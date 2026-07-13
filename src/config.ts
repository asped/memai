import "dotenv/config";
import { z } from "zod";
import { planImageSize } from "./image-size.js";
import { imageQualities } from "./types.js";

const optionalEnvironmentValue = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  OPENAI_API_KEY: optionalEnvironmentValue,
  OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-2"),
  IMAGE_QUALITY: z.enum(imageQualities).default("low"),
  IMAGE_SIZE: z.string().regex(/^\d+x\d+$/).default("640x640").superRefine((size, context) => {
    try {
      planImageSize(size);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid IMAGE_SIZE",
      });
    }
  }),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:4317"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4317),
  API_TOKEN: optionalEnvironmentValue,
  BROWSER_USERNAME: z.string().min(1).default("admin"),
  BROWSER_PASSWORD: optionalEnvironmentValue,
  SESSION_SECRET: optionalEnvironmentValue,
  SLACK_SIGNING_SECRET: optionalEnvironmentValue,
  SLACK_TEAM_ID: optionalEnvironmentValue,
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
