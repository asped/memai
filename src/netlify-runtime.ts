import { ImageService } from "./image-service.js";
import { loadNetlifyConfig } from "./netlify-http.js";
import { NetlifyImageStore } from "./netlify-image-store.js";
import { OpenAIImageGenerator } from "./openai-image-generator.js";

export function createNetlifyImageService(environment = process.env) {
  const config = loadNetlifyConfig(environment);

  if (!config.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const generator = new OpenAIImageGenerator({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_IMAGE_MODEL,
    size: config.IMAGE_SIZE,
  });
  const store = new NetlifyImageStore(config.PUBLIC_BASE_URL);

  return {
    config,
    imageService: new ImageService(generator, store, config.IMAGE_QUALITY),
  };
}
