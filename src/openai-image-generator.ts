import OpenAI from "openai";
import sharp from "sharp";
import { planImageSize } from "./image-size.js";
import type { GeneratedImageData, ImageGenerator } from "./types.js";

interface OpenAIImageGeneratorOptions {
  apiKey: string;
  model: string;
  size: string;
}

export class OpenAIImageGenerator implements ImageGenerator {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIImageGeneratorOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
  }

  async generate(input: Parameters<ImageGenerator["generate"]>[0]): Promise<GeneratedImageData> {
    const sizePlan = planImageSize(this.options.size);
    const result = await this.client.images.generate({
      model: this.options.model,
      prompt: input.prompt,
      quality: input.quality,
      size: sizePlan.providerSize,
      output_format: "jpeg",
      output_compression: 85,
      n: 1,
    });
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
