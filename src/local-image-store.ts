import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedImageData, ImageStore, StoredImage } from "./types.js";

const extensions: Record<GeneratedImageData["mimeType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class LocalImageStore implements ImageStore {
  constructor(
    private readonly directory: string,
    private readonly publicBaseUrl: string,
  ) {}

  async save(image: GeneratedImageData): Promise<StoredImage> {
    const id = randomUUID();
    const filename = `${id}.${extensions[image.mimeType]}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, filename), image.bytes, { flag: "wx" });

    return {
      id,
      url: new URL(`/generated-images/${filename}`, this.publicBaseUrl).toString(),
      mimeType: image.mimeType,
    };
  }
}
