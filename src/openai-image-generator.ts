import OpenAI from "openai";
import sharp from "sharp";
import { planImageSize } from "./image-size.js";
import type { GeneratedImageData, ImageGenerator } from "./types.js";

interface OpenAIImageGeneratorOptions {
  apiKey: string;
  model: string;
  size: string;
}

const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_RETRY_BASE_MS = 15_000;

function rateLimitRetryDelay(error: unknown, attempt: number): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error) || error.status !== 429) {
    return undefined;
  }

  const headers = "headers" in error && error.headers instanceof Headers ? error.headers : undefined;
  const retryAfterMs = Number(headers?.get("retry-after-ms"));
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return retryAfterMs;

  const retryAfterSeconds = Number(headers?.get("retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1_000;
  }

  return RATE_LIMIT_RETRY_BASE_MS * (attempt + 1);
}

export class OpenAIImageGenerator implements ImageGenerator {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIImageGeneratorOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
  }

  async generate(input: Parameters<ImageGenerator["generate"]>[0]): Promise<GeneratedImageData> {
    const sizePlan = planImageSize(this.options.size);
    let result;
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await this.client.images.generate({
          model: this.options.model,
          prompt: input.prompt,
          quality: input.quality,
          size: sizePlan.providerSize,
          output_format: "jpeg",
          output_compression: 85,
          n: 1,
        });
        break;
      } catch (error) {
        const delay = rateLimitRetryDelay(error, attempt);
        if (delay === undefined || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
        console.warn(`OpenAI image rate limit reached; retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    const encoded = result.data?.[0]?.b64_json;

    if (!encoded) {
      throw new Error("The image provider returned no image data");
    }

    const generatedBytes = Buffer.from(encoded, "base64");
    const bytes = sizePlan.needsResize
      ? await sharp(generatedBytes)
          .resize(sizePlan.output.width, sizePlan.output.height, { fit: "fill" })
          .jpeg({ quality: 85 })
          .toBuffer()
      : generatedBytes;

    return {
      bytes,
      mimeType: "image/jpeg",
    };
  }
}
