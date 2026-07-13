import path from "node:path";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ImageService } from "./image-service.js";
import { LocalImageStore } from "./local-image-store.js";
import { OpenAIImageGenerator } from "./openai-image-generator.js";

const config = loadConfig();

if (!config.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required. Copy .env.example to .env and add your key.");
}

const root = path.resolve(process.env.PROJECT_ROOT ?? process.cwd());
const imageDirectory = path.join(root, "data", "images");
const publicDirectory = path.join(root, "public");
const generator = new OpenAIImageGenerator({
  apiKey: config.OPENAI_API_KEY,
  model: config.OPENAI_IMAGE_MODEL,
  size: config.IMAGE_SIZE,
});
const store = new LocalImageStore(imageDirectory, config.PUBLIC_BASE_URL);
const imageService = new ImageService(generator, store, config.IMAGE_QUALITY);
const app = createApp({ config, imageService, imageDirectory, publicDirectory });

app.listen(config.PORT, () => {
  console.log(`MemAI is listening on ${config.PUBLIC_BASE_URL}`);
});
