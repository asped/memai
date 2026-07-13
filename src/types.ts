export const imageQualities = ["low", "medium", "high", "auto"] as const;
export type ImageQuality = (typeof imageQualities)[number];

export interface GenerateImageInput {
  prompt: string;
  quality?: ImageQuality;
}

export interface GeneratedImageData {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface ImageGenerator {
  generate(input: Required<GenerateImageInput>): Promise<GeneratedImageData>;
}

export interface StoredImage {
  id: string;
  url: string;
  mimeType: GeneratedImageData["mimeType"];
}

export interface ImageStore {
  save(image: GeneratedImageData): Promise<StoredImage>;
}

export interface ImageResult extends StoredImage {
  prompt: string;
  createdAt: string;
}
