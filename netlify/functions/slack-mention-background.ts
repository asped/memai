import type { Config } from "@netlify/functions";
import { createNetlifyImageService } from "../../src/netlify-runtime.js";
import { finishSlackMention, parseSlackEvent, verifySlackRequest } from "../../src/slack.js";

export default async (request: Request) => {
  try {
    const body = await request.text();
    const { config, imageService } = createNetlifyImageService();
    if (!config.SLACK_SIGNING_SECRET || !config.SLACK_BOT_TOKEN) {
      console.error("Slack app mentions are not configured");
      return;
    }

    const valid = verifySlackRequest({
      body,
      signature: request.headers.get("x-slack-signature") ?? undefined,
      timestamp: request.headers.get("x-slack-request-timestamp") ?? undefined,
      signingSecret: config.SLACK_SIGNING_SECRET,
    });
    if (!valid) {
      console.error("Rejected an invalid Slack mention background request");
      return;
    }

    const parsed = parseSlackEvent(body);
    if (parsed.kind !== "mention") return;
    if (config.SLACK_TEAM_ID && parsed.mention.teamId !== config.SLACK_TEAM_ID) {
      console.error("Rejected a Slack mention from a different workspace");
      return;
    }

    await finishSlackMention({
      mention: parsed.mention,
      botToken: config.SLACK_BOT_TOKEN,
      imageService,
    });
  } catch (error) {
    // Returning normally prevents Netlify's automatic retry from generating duplicate images.
    console.error("Could not finish the Slack app mention", error);
  }
};

export const config = { background: true } satisfies Config;
