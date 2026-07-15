import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { queueSlackCommand, queueSlackEvent } from "../src/netlify-slack.js";

test("queues a signed Slack command and acknowledges immediately", async () => {
  const signingSecret = "slack-secret";
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const body = new URLSearchParams({
    text: "the deploy working on the first try",
    response_url: "https://hooks.slack.com/commands/example",
  }).toString();
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  let forwardedBody = "";
  let forwardedSignature = "";

  const result = await queueSlackCommand({
    body,
    signature,
    timestamp,
    signingSecret,
    backgroundUrl: "https://memai.netlify.app/.netlify/functions/slack-generate-background",
    fetchImpl: (async (_url, init) => {
      forwardedBody = String(init?.body ?? "");
      forwardedSignature = new Headers(init?.headers).get("x-slack-signature") ?? "";
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.response_type, "ephemeral");
  assert.match(result.body.text ?? "", /Cooking/);
  assert.equal(forwardedBody, body);
  assert.equal(forwardedSignature, signature);
});

test("does not queue a Slack command with an invalid signature", async () => {
  let fetchCalled = false;
  const result = await queueSlackCommand({
    body: "text=test",
    signature: "v0=invalid",
    timestamp: String(Math.floor(Date.now() / 1_000)),
    signingSecret: "slack-secret",
    backgroundUrl: "https://memai.netlify.app/.netlify/functions/slack-generate-background",
    fetchImpl: (async () => {
      fetchCalled = true;
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  });

  assert.equal(result.status, 401);
  assert.equal(fetchCalled, false);
});

test("rejects a signed command from a different Slack workspace", async () => {
  const signingSecret = "slack-secret";
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const body = new URLSearchParams({ team_id: "T-WRONG", text: "test" }).toString();
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  const result = await queueSlackCommand({
    body,
    signature,
    timestamp,
    signingSecret,
    allowedTeamId: "T-ALLOWED",
    backgroundUrl: "https://memai.netlify.app/.netlify/functions/slack-generate-background",
  });
  assert.equal(result.status, 403);
});

test("answers Slack URL verification without queuing work", async () => {
  const signingSecret = "slack-secret";
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const body = JSON.stringify({
    type: "url_verification",
    team_id: "T123",
    challenge: "challenge-value",
  });
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  let fetchCalled = false;

  const result = await queueSlackEvent({
    body,
    signature,
    timestamp,
    retryNumber: undefined,
    signingSecret,
    allowedTeamId: "T123",
    backgroundUrl: "https://memai.netlify.app/.netlify/functions/slack-mention-background",
    fetchImpl: (async () => {
      fetchCalled = true;
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.challenge, "challenge-value");
  assert.equal(fetchCalled, false);
});

test("queues a signed Slack app mention with Unicode intact", async () => {
  const signingSecret = "slack-secret";
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const body = JSON.stringify({
    type: "event_callback",
    team_id: "T123",
    event_id: "Ev123",
    event: {
      type: "app_mention",
      user: "U123ABC456",
      channel: "C123",
      text: "<@U012MEMAI> príliš žltý štvrtok",
      ts: "123.456",
      thread_ts: "120.000",
    },
  });
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  let forwardedBody = "";

  const result = await queueSlackEvent({
    body,
    signature,
    timestamp,
    retryNumber: undefined,
    signingSecret,
    allowedTeamId: "T123",
    backgroundUrl: "https://memai.netlify.app/.netlify/functions/slack-mention-background",
    fetchImpl: (async (_url, init) => {
      forwardedBody = String(init?.body ?? "");
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  });

  assert.equal(result.status, 200);
  assert.equal(forwardedBody, body);
  assert.match(forwardedBody, /príliš žltý štvrtok/);
});
