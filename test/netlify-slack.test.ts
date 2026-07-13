import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { queueSlackCommand } from "../src/netlify-slack.js";

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
