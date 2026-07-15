import { jsonResponse, loadNetlifyConfig } from "../../src/netlify-http.js";
import { queueSlackEvent } from "../../src/netlify-slack.js";

export default async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  }

  const body = await request.text();
  const config = loadNetlifyConfig();
  const result = await queueSlackEvent({
    body,
    signature: request.headers.get("x-slack-signature") ?? undefined,
    timestamp: request.headers.get("x-slack-request-timestamp") ?? undefined,
    retryNumber: request.headers.get("x-slack-retry-num") ?? undefined,
    signingSecret: config.SLACK_SIGNING_SECRET,
    allowedTeamId: config.SLACK_TEAM_ID,
    backgroundUrl: new URL(
      "/.netlify/functions/slack-mention-background",
      request.url,
    ).toString(),
  });

  return jsonResponse(result.body, { status: result.status });
};
