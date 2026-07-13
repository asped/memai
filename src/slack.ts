import { createHmac, timingSafeEqual } from "node:crypto";
import type { ImageService } from "./image-service.js";

const FIVE_MINUTES_IN_SECONDS = 5 * 60;

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
  responseUrl: string;
  imageService: ImageService;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  if (!isSlackResponseUrl(input.responseUrl)) {
    throw new Error("Invalid Slack response URL");
  }

  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const image = await input.imageService.create({ prompt: input.prompt });
    await fetchImpl(input.responseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        response_type: "in_channel",
        text: input.prompt,
        blocks: [
          {
            type: "image",
            image_url: image.url,
            alt_text: `AI-generated reaction image for: ${input.prompt}`.slice(0, 2_000),
          },
          {
            type: "context",
            elements: [{ type: "plain_text", text: `Prompt: ${input.prompt}`, emoji: true }],
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
