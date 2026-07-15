import { createHmac, timingSafeEqual } from "node:crypto";
import type { ImageService } from "./image-service.js";

const FIVE_MINUTES_IN_SECONDS = 5 * 60;
const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

export interface SlackAppMention {
  eventId: string;
  teamId: string;
  userId: string;
  channelId: string;
  prompt: string;
  eventTs: string;
  threadTs?: string | undefined;
}

export type ParsedSlackEvent =
  | { kind: "challenge"; challenge: string; teamId?: string | undefined }
  | { kind: "mention"; mention: SlackAppMention }
  | { kind: "ignored"; teamId?: string | undefined };

export function verifySlackRequest(input: {
  body: string;
  signature: string | undefined;
  timestamp: string | undefined;
  signingSecret: string;
  now?: number;
}): boolean {
  if (!input.signature || !input.timestamp) return false;

  const timestamp = Number(input.timestamp);
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > FIVE_MINUTES_IN_SECONDS) {
    return false;
  }

  const expected = `v0=${createHmac("sha256", input.signingSecret)
    .update(`v0:${input.timestamp}:${input.body}`)
    .digest("hex")}`;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(input.signature);

  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function parseSlackEvent(body: string): ParsedSlackEvent {
  const envelope = JSON.parse(body) as Record<string, unknown>;
  const teamId = typeof envelope.team_id === "string" ? envelope.team_id : undefined;

  if (envelope.type === "url_verification" && typeof envelope.challenge === "string") {
    return { kind: "challenge", challenge: envelope.challenge, teamId };
  }

  if (envelope.type !== "event_callback" || typeof envelope.event_id !== "string") {
    return { kind: "ignored", teamId };
  }

  const event = envelope.event;
  if (typeof event !== "object" || event === null) return { kind: "ignored", teamId };
  const slackEvent = event as Record<string, unknown>;
  if (slackEvent.type !== "app_mention" || typeof slackEvent.bot_id === "string") {
    return { kind: "ignored", teamId };
  }

  if (
    !teamId ||
    typeof slackEvent.user !== "string" ||
    typeof slackEvent.channel !== "string" ||
    typeof slackEvent.text !== "string" ||
    typeof slackEvent.ts !== "string"
  ) {
    return { kind: "ignored", teamId };
  }

  const prompt = slackEvent.text.replace(/<@[A-Z0-9]+>/i, "").trim();
  return {
    kind: "mention",
    mention: {
      eventId: envelope.event_id,
      teamId,
      userId: slackEvent.user,
      channelId: slackEvent.channel,
      prompt,
      eventTs: slackEvent.ts,
      ...(typeof slackEvent.thread_ts === "string" ? { threadTs: slackEvent.thread_ts } : {}),
    },
  };
}

function isSlackResponseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "hooks.slack.com" || url.hostname === "hooks.slack-gov.com")
    );
  } catch {
    return false;
  }
}

export async function finishSlackCommand(input: {
  prompt: string;
  userId?: string | undefined;
  responseUrl: string;
  imageService: ImageService;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  if (!isSlackResponseUrl(input.responseUrl)) {
    throw new Error("Invalid Slack response URL");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const requester = input.userId && /^[UW][A-Z0-9]+$/.test(input.userId)
    ? `<@${input.userId}>`
    : undefined;

  try {
    const image = await input.imageService.create({ prompt: input.prompt });
    await fetchImpl(input.responseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        response_type: "in_channel",
        text: requester ? `${requester} asked MemAI: ${input.prompt}` : input.prompt,
        blocks: [
          {
            type: "image",
            image_url: image.url,
            alt_text: `AI-generated reaction image for: ${input.prompt}`.slice(0, 2_000),
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `${requester ? `Requested by ${requester} · ` : ""}Prompt: ${input.prompt}`,
              },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    console.error("Slack image generation failed", error);
    await fetchImpl(input.responseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: "I couldn't make that image. Please try again in a moment.",
      }),
    });
  }
}

async function postSlackMessage(input: {
  botToken: string;
  channelId: string;
  text: string;
  blocks?: unknown[] | undefined;
  threadTs?: string | undefined;
  fetchImpl: typeof fetch;
}) {
  const response = await input.fetchImpl(SLACK_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.botToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channelId,
      text: input.text,
      ...(input.blocks ? { blocks: input.blocks } : {}),
      ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
    }),
  });
  const result = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(`Slack chat.postMessage failed: ${result.error ?? response.status}`);
  }
}

export async function finishSlackMention(input: {
  mention: SlackAppMention;
  botToken: string;
  imageService: ImageService;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const requester = /^[UW][A-Z0-9]+$/.test(input.mention.userId)
    ? `<@${input.mention.userId}>`
    : "Someone";
  const threadTs = input.mention.threadTs;

  if (!input.mention.prompt) {
    await postSlackMessage({
      botToken: input.botToken,
      channelId: input.mention.channelId,
      threadTs,
      text: `${requester}, try mentioning me with a prompt, like: @MemAI the deploy on Friday afternoon`,
      fetchImpl,
    });
    return;
  }

  try {
    const image = await input.imageService.create({ prompt: input.mention.prompt });
    await postSlackMessage({
      botToken: input.botToken,
      channelId: input.mention.channelId,
      threadTs,
      text: `${requester} asked MemAI: ${input.mention.prompt}`,
      blocks: [
        {
          type: "image",
          image_url: image.url,
          alt_text: `AI-generated reaction image for: ${input.mention.prompt}`.slice(0, 2_000),
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Requested by ${requester} · Prompt: ${input.mention.prompt}`,
            },
          ],
        },
      ],
      fetchImpl,
    });
  } catch (error) {
    console.error("Slack mention image generation failed", error);
    await postSlackMessage({
      botToken: input.botToken,
      channelId: input.mention.channelId,
      threadTs,
      text: `${requester}, I couldn't make that image. Please try again in a moment.`,
      fetchImpl,
    });
  }
}
