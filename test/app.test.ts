import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { ImageService } from "../src/image-service.js";

function makeApp(apiToken = "test-token") {
  const imageService = new ImageService(
    { async generate() { return { bytes: Buffer.from("x"), mimeType: "image/jpeg" }; } },
    { async save() { return { id: "1", url: "https://example.com/images/1.jpg", mimeType: "image/jpeg" }; } },
    "low",
  );

  return createApp({
    config: {
      API_TOKEN: apiToken,
      BROWSER_USERNAME: "admin",
      BROWSER_PASSWORD: "test-password",
      SESSION_SECRET: "test-session-secret",
    },
    imageService,
    imageDirectory: "/tmp/memai-test-images",
    publicDirectory: "/tmp/memai-test-public",
  });
}

test("health endpoint reports readiness", async () => {
  const response = await request(makeApp()).get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});

test("creates an image through the API", async () => {
  const response = await request(makeApp())
    .post("/v1/images")
    .set("authorization", "Bearer test-token")
    .send({ prompt: "code review face" });
  assert.equal(response.status, 201);
  assert.equal(response.body.prompt, "code review face");
  assert.equal(response.body.url, "https://example.com/images/1.jpg");
});

test("generates and returns an image directly from the browser route", async () => {
  const agent = request.agent(makeApp());
  await agent
    .post("/auth/login")
    .set("host", "memai.test")
    .set("origin", "http://memai.test")
    .send({ username: "admin", password: "test-password" })
    .expect(200);
  const response = await agent
    .get("/images/Monday%20morning%20face")
    .query({ quality: "medium" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(response.headers["content-type"] ?? "", /^image\/jpeg/);
  assert.equal(response.headers["content-disposition"], 'inline; filename="memai.jpg"');
  assert.equal(response.body.toString(), "x");
});

test("does not generate through GET /v1/images", async () => {
  const response = await request(makeApp())
    .get("/v1/images")
    .set("authorization", "Bearer test-token")
    .query({ prompt: "nope" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, "POST");
});

test("always enforces the API bearer token", async () => {
  const app = makeApp("test-token");
  assert.equal((await request(app).post("/v1/images").send({ prompt: "hello" })).status, 401);
  assert.equal(
    (await request(app).post("/v1/images").set("authorization", "Bearer test-token").send({ prompt: "hello" })).status,
    201,
  );
});

test("fails closed when the API bearer token is not configured", async () => {
  const response = await request(makeApp("")).post("/v1/images").send({ prompt: "hello" });
  assert.equal(response.status, 401);
});

test("browser generation requires a same-origin authenticated session", async () => {
  const agent = request.agent(makeApp());
  assert.equal((await agent.post("/browser/images").send({ prompt: "hello" })).status, 403);
  await agent
    .post("/auth/login")
    .set("host", "memai.test")
    .set("origin", "http://memai.test")
    .send({ username: "admin", password: "test-password" })
    .expect(200);
  const response = await agent
    .post("/browser/images")
    .set("host", "memai.test")
    .set("origin", "http://memai.test")
    .send({ prompt: "hello" });
  assert.equal(response.status, 201);
});
