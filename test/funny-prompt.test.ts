import assert from "node:assert/strict";
import test from "node:test";
import { makeFunnyImagePrompt, normalizePrompt } from "../src/funny-prompt.js";

test("normalizes whitespace in a user prompt", () => {
  assert.equal(normalizePrompt("  deploy   on Friday \n again "), "deploy on Friday again");
});

test("rejects an empty prompt", () => {
  assert.throws(() => normalizePrompt(" \n "), /cannot be empty/);
});

test("turns the idea into a focused reaction-image prompt", () => {
  const result = makeFunnyImagePrompt("the tests finally pass");
  assert.match(result, /the tests finally pass/);
  assert.match(result, /one strong visual joke/i);
  assert.match(result, /chat-message size/i);
});
