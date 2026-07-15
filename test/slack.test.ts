import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { ImageService } from "../src/image-service.js";
import {
  finishSlackCommand,
  finishSlackMention,
  parseSlackEvent,
  verifySlackRequest,
} from "../src/slack.js";

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
    userId: "U123ABC456",
    responseUrl: "https://hooks.slack.com/commands/example",
    imageService,
    fetchImpl,
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0]?.body ?? "", /images\.example/);
  assert.match(requests[0]?.body ?? "", /in_channel/);
  assert.match(requests[0]?.body ?? "", /Requested by <@U123ABC456>/);
});

test("parses a Slovak app mention and preserves its thread", () => {
  const parsed = parseSlackEvent(JSON.stringify({
    type: "event_callback",
    team_id: "T123",
    event_id: "Ev123",
    event: {
      type: "app_mention",
      user: "U123ABC456",
      channel: "C123",
      text: "<@U012MEMAI> žltý kôň rieši príliš ťažký štvrtok",
      ts: "123.456",
      thread_ts: "120.000",
    },
  }));

  assert.equal(parsed.kind, "mention");
  if (parsed.kind !== "mention") return;
  assert.equal(parsed.mention.prompt, "žltý kôň rieši príliš ťažký štvrtok");
  assert.equal(parsed.mention.threadTs, "120.000");
});

test("posts an app mention result into the originating Slack thread", async () => {
  const imageService = new ImageService(
    { async generate() { return { bytes: Buffer.from("x"), mimeType: "image/jpeg" }; } },
    { async save() { return { id: "1", url: "https://images.example/1.jpg", mimeType: "image/jpeg" }; } },
    "low",
  );
  let requestBody = "";
  let authorization = "";
  await finishSlackMention({
    mention: {
      eventId: "Ev123",
      teamId: "T123",
      userId: "U123ABC456",
      channelId: "C123",
      prompt: "produkcia horí",
      eventTs: "123.456",
      threadTs: "120.000",
    },
    botToken: "xoxb-test",
    imageService,
    fetchImpl: (async (_url, init) => {
      requestBody = String(init?.body ?? "");
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ ok: true });
    }) as typeof fetch,
  });

  assert.equal(authorization, "Bearer xoxb-test");
  assert.equal(JSON.parse(requestBody).thread_ts, "120.000");
  assert.match(requestBody, /images\.example/);
});
