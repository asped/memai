import assert from "node:assert/strict";
import test from "node:test";
import { ImageService } from "../src/image-service.js";
import type { ImageGenerator, ImageStore } from "../src/types.js";

test("generates, stores, and returns an image", async () => {
  let generatedPrompt = "";
  const generator: ImageGenerator = {
    async generate(input) {
      generatedPrompt = input.prompt;
      assert.equal(input.quality, "low");
      return { bytes: Buffer.from("image"), mimeType: "image/jpeg" };
    },
  };
  const store: ImageStore = {
    async save(image) {
      assert.equal(image.bytes.toString(), "image");
      return { id: "image-1", url: "https://example.com/images/image-1.jpg", mimeType: image.mimeType };
    },
  };
  const service = new ImageService(generator, store, "low");

  const result = await service.create({ prompt: "  merge conflict at midnight " });

  assert.match(generatedPrompt, /merge conflict at midnight/);
  assert.equal(result.prompt, "merge conflict at midnight");
  assert.equal(result.id, "image-1");
});
