import { jsonResponse, loadNetlifyConfig } from "../../src/netlify-http.js";
import { queueSlackCommand } from "../../src/netlify-slack.js";

export default async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  }

  const body = await request.text();
  const backgroundUrl = new URL(
    "/.netlify/functions/slack-generate-background",
    request.url,
  ).toString();
  const config = loadNetlifyConfig();
  const result = await queueSlackCommand({
    body,
    signature: request.headers.get("x-slack-signature") ?? undefined,
    timestamp: request.headers.get("x-slack-request-timestamp") ?? undefined,
    signingSecret: config.SLACK_SIGNING_SECRET,
    allowedTeamId: config.SLACK_TEAM_ID,
    backgroundUrl,
  });

  return jsonResponse(result.body, { status: result.status });
};
