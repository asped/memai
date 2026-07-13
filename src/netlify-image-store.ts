import { randomUUID } from "node:crypto";
import { getStore, type SetOptions, type Store } from "@netlify/blobs";
import type { GeneratedImageData, ImageStore, StoredImage } from "./types.js";

export const NETLIFY_IMAGE_STORE = "memai-images";

const extensions: Record<GeneratedImageData["mimeType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface NetlifyBlobWriter {
  set(key: string, data: Blob, options?: SetOptions): Promise<{ modified: boolean; etag?: string }>;
}

export type NetlifyBlobReader = Pick<Store, "getWithMetadata">;

export class NetlifyImageStore implements ImageStore {
  constructor(
    private readonly publicBaseUrl: string,
    private readonly store: NetlifyBlobWriter = getStore(NETLIFY_IMAGE_STORE),
  ) {}

  async save(image: GeneratedImageData): Promise<StoredImage> {
    const id = randomUUID();
    const filename = `${id}.${extensions[image.mimeType]}`;
    const data = new Blob([Uint8Array.from(image.bytes)], { type: image.mimeType });
    const result = await this.store.set(filename, data, {
      metadata: { mimeType: image.mimeType },
      onlyIfNew: true,
    });

    if (!result.modified) {
      throw new Error("Could not persist the generated image");
    }

    return {
      id,
      url: new URL(`/generated-images/${filename}`, this.publicBaseUrl).toString(),
      mimeType: image.mimeType,
    };
  }
}

export async function readNetlifyImage(
  key: string,
  store: NetlifyBlobReader = getStore(NETLIFY_IMAGE_STORE),
) {
  return store.getWithMetadata(key, { type: "blob" });
}
