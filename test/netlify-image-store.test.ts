import assert from "node:assert/strict";
import test from "node:test";
import { NetlifyImageStore, type NetlifyBlobWriter } from "../src/netlify-image-store.js";

test("stores generated images in Netlify Blobs and returns a public URL", async () => {
  let savedKey = "";
  let savedBlob: Blob | undefined;
  let savedMimeType: unknown;
  const writer: NetlifyBlobWriter = {
    async set(key, data, options) {
      savedKey = key;
      savedBlob = data;
      savedMimeType = options?.metadata?.mimeType;
      return { modified: true, etag: "etag" };
    },
  };
  const store = new NetlifyImageStore("https://memai.netlify.app", writer);
  const result = await store.save({
    bytes: Buffer.from("fake-image"),
    mimeType: "image/jpeg",
  });

  assert.match(savedKey, /^[0-9a-f-]+\.jpg$/);
  assert.equal(savedBlob?.type, "image/jpeg");
  assert.equal(await savedBlob?.text(), "fake-image");
  assert.equal(savedMimeType, "image/jpeg");
  assert.equal(result.url, `https://memai.netlify.app/generated-images/${savedKey}`);
});
