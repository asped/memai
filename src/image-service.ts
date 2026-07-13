import { makeFunnyImagePrompt, normalizePrompt } from "./funny-prompt.js";
import type {
  GenerateImageInput,
  ImageGenerator,
  ImageQuality,
  ImageResult,
  ImageStore,
} from "./types.js";

export class ImageService {
  constructor(
    private readonly generator: ImageGenerator,
    private readonly store: ImageStore,
    private readonly defaultQuality: ImageQuality,
  ) {}

  async generate(input: GenerateImageInput) {
    const prompt = normalizePrompt(input.prompt);
    return this.generator.generate({
      prompt: makeFunnyImagePrompt(prompt),
      quality: input.quality ?? this.defaultQuality,
    });
  }

  async create(input: GenerateImageInput): Promise<ImageResult> {
    const prompt = normalizePrompt(input.prompt);
    const image = await this.generate({
      prompt,
      ...(input.quality ? { quality: input.quality } : {}),
    });
    const stored = await this.store.save(image);

    return {
      ...stored,
      prompt,
      createdAt: new Date().toISOString(),
    };
  }
}
