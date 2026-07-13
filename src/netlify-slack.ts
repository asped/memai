import { verifySlackRequest } from "./slack.js";

interface QueueSlackCommandInput {
  body: string;
  signature: string | undefined;
  timestamp: string | undefined;
  signingSecret: string | undefined;
  allowedTeamId?: string | undefined;
  backgroundUrl: string;
  fetchImpl?: typeof fetch;
}

interface SlackCommandHttpResult {
  status: number;
  body: Record<string, string>;
}

export async function queueSlackCommand(
  input: QueueSlackCommandInput,
): Promise<SlackCommandHttpResult> {
  if (!input.signingSecret) {
    return { status: 503, body: { error: "Slack integration is not configured" } };
  }

  const valid = verifySlackRequest({
    body: input.body,
    signature: input.signature,
    timestamp: input.timestamp,
    signingSecret: input.signingSecret,
  });

  if (!valid) {
    return { status: 401, body: { error: "Invalid Slack signature" } };
  }

  const form = new URLSearchParams(input.body);
  if (input.allowedTeamId && form.get("team_id") !== input.allowedTeamId) {
    return { status: 403, body: { error: "Slack workspace is not allowed" } };
  }
  const prompt = form.get("text")?.trim() ?? "";

  if (!prompt) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "Try `/memai the build passing locally but failing in CI`",
      },
    };
  }

  try {
    const queued = await (input.fetchImpl ?? fetch)(input.backgroundUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-slack-request-timestamp": input.timestamp ?? "",
        "x-slack-signature": input.signature ?? "",
      },
      body: input.body,
    });

    if (!queued.ok) throw new Error(`Background function returned ${queued.status}`);
  } catch (error) {
    console.error("Could not queue Slack image generation", error);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "I couldn't start that image. Please try again in a moment.",
      },
    };
  }

  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: "🎨 Cooking up something ridiculous…",
    },
  };
}
