import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { ImageService } from "../src/image-service.js";
import { finishSlackCommand, verifySlackRequest } from "../src/slack.js";

test("verifies a current Slack signature", () => {
  const timestamp = "1700000000";
  const body = "text=hello";
  const secret = "secret";
  const signature = `v0=${createHmac("sha256", secret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;

  assert.equal(
    verifySlackRequest({ body, signature, timestamp, signingSecret: secret, now: 1700000000 }),
    true,
  );
  assert.equal(
    verifySlackRequest({ body, signature, timestamp, signingSecret: secret, now: 1700001000 }),
    false,
  );
});

test("posts a completed image to the Slack response URL", async () => {
  const imageService = new ImageService(
    { async generate() { return { bytes: Buffer.from("x"), mimeType: "image/jpeg" }; } },
    { async save() { return { id: "1", url: "https://images.example/1.jpg", mimeType: "image/jpeg" }; } },
    "low",
  );
  const requests: Array<{ url: string; body: string }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: input.toString(), body: String(init?.body) });
    return new Response(null, { status: 200 });
  };

  await finishSlackCommand({
    prompt: "production is on fire",
    responseUrl: "https://hooks.slack.com/commands/example",
    imageService,
    fetchImpl,
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0]?.body ?? "", /images\.example/);
  assert.match(requests[0]?.body ?? "", /in_channel/);
});
