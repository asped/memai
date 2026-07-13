import assert from "node:assert/strict";
import test from "node:test";
import { planImageSize } from "../src/image-size.js";

test("uses the smallest valid provider square for a 640px output", () => {
  assert.deepEqual(planImageSize("640x640"), {
    output: { width: 640, height: 640 },
    provider: { width: 816, height: 816 },
    providerSize: "816x816",
    needsResize: true,
  });
});

test("passes through an already valid provider size", () => {
  assert.deepEqual(planImageSize("1024x1024"), {
    output: { width: 1024, height: 1024 },
    provider: { width: 1024, height: 1024 },
    providerSize: "1024x1024",
    needsResize: false,
  });
});

test("rejects unsupported aspect ratios", () => {
  assert.throws(() => planImageSize("640x160"), /aspect ratio/);
});
