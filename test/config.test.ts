import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("treats empty optional environment values as unset", () => {
  const config = loadConfig({
    OPENAI_API_KEY: "test-key",
    API_TOKEN: "",
    SLACK_SIGNING_SECRET: "",
  });

  assert.equal(config.OPENAI_API_KEY, "test-key");
  assert.equal(config.API_TOKEN, undefined);
  assert.equal(config.SLACK_SIGNING_SECRET, undefined);
  assert.equal(config.PORT, 4317);
  assert.equal(config.PUBLIC_BASE_URL, "http://localhost:4317");
  assert.equal(config.IMAGE_SIZE, "640x640");
});
