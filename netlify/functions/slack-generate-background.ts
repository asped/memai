import type { Config } from "@netlify/functions";
import { createNetlifyImageService } from "../../src/netlify-runtime.js";
import { finishSlackCommand, verifySlackRequest } from "../../src/slack.js";

export default async (request: Request) => {
  try {
    const body = await request.text();
    const { config, imageService } = createNetlifyImageService();
    if (!config.SLACK_SIGNING_SECRET) {
      console.error("Slack integration is not configured");
      return;
    }

    const valid = verifySlackRequest({
      body,
      signature: request.headers.get("x-slack-signature") ?? undefined,
      timestamp: request.headers.get("x-slack-request-timestamp") ?? undefined,
      signingSecret: config.SLACK_SIGNING_SECRET,
    });
    if (!valid) {
      console.error("Rejected an invalid Slack background request");
      return;
    }

    const form = new URLSearchParams(body);
    if (config.SLACK_TEAM_ID && form.get("team_id") !== config.SLACK_TEAM_ID) {
      console.error("Rejected a Slack request from a different workspace");
      return;
    }
    const prompt = form.get("text")?.trim() ?? "";
    const userId = form.get("user_id") ?? undefined;
    const responseUrl = form.get("response_url") ?? "";
    if (!prompt) return;

    await finishSlackCommand({ prompt, userId, responseUrl, imageService });
  } catch (error) {
    // Returning normally prevents Netlify's automatic retry from generating duplicate images.
    console.error("Could not finish the Slack image command", error);
  }
};

export const config = { background: true } satisfies Config;
