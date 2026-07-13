import path from "node:path";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { ImageService } from "./image-service.js";
import { finishSlackCommand, verifySlackRequest } from "./slack.js";
import { imageQualities } from "./types.js";

const imageRequestSchema = z.object({
  prompt: z.string().min(1).max(1_000),
  quality: z.enum(imageQualities).optional(),
});

export interface AppDependencies {
  config: Pick<AppConfig, "API_TOKEN" | "SLACK_SIGNING_SECRET">;
  imageService: ImageService;
  imageDirectory: string;
  publicDirectory: string;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.use("/generated-images", express.static(dependencies.imageDirectory, {
    immutable: true,
    maxAge: "30d",
  }));

  app.post(
    "/integrations/slack/commands",
    express.raw({ type: "application/x-www-form-urlencoded", limit: "32kb" }),
    (request, response) => {
      if (!dependencies.config.SLACK_SIGNING_SECRET) {
        response.status(503).json({ error: "Slack integration is not configured" });
        return;
      }

      const body = request.body instanceof Buffer ? request.body.toString("utf8") : "";
      const valid = verifySlackRequest({
        body,
        signature: request.header("x-slack-signature"),
        timestamp: request.header("x-slack-request-timestamp"),
        signingSecret: dependencies.config.SLACK_SIGNING_SECRET,
      });

      if (!valid) {
        response.status(401).json({ error: "Invalid Slack signature" });
        return;
      }

      const form = new URLSearchParams(body);
      const prompt = form.get("text")?.trim() ?? "";
      const responseUrl = form.get("response_url") ?? "";

      if (!prompt) {
        response.json({
          response_type: "ephemeral",
          text: "Try `/memai the build passing locally but failing in CI`",
        });
        return;
      }

      response.json({
        response_type: "ephemeral",
        text: "🎨 Cooking up something ridiculous…",
      });

      void finishSlackCommand({
        prompt,
        responseUrl,
        imageService: dependencies.imageService,
      }).catch((error: unknown) => {
        console.error("Could not deliver the Slack command response", error);
      });
    },
  );

  app.use(express.json({ limit: "16kb" }));

  const requireApiToken: RequestHandler = (request, response, next) => {
    const token = dependencies.config.API_TOKEN;
    if (!token || request.header("authorization") === `Bearer ${token}`) {
      next();
      return;
    }
    response.status(401).json({ error: "Invalid API token" });
  };

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/images/:prompt", async (request, response, next) => {
    try {
      const input = imageRequestSchema.parse({
        prompt: request.params.prompt,
        ...(typeof request.query.quality === "string" ? { quality: request.query.quality } : {}),
      });
      const image = await dependencies.imageService.generate({
        prompt: input.prompt,
        ...(input.quality ? { quality: input.quality } : {}),
      });

      response
        .status(200)
        .set({
          "cache-control": "no-store",
          "content-disposition": 'inline; filename="memai.jpg"',
          "content-length": String(image.bytes.length),
          "content-type": image.mimeType,
        })
        .send(image.bytes);
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/images", requireApiToken, (_request, response) => {
    response
      .status(405)
      .set("allow", "POST")
      .json({ error: "Method not allowed; use POST /v1/images" });
  });

  const createImage: RequestHandler = async (request, response, next) => {
    try {
      const input = imageRequestSchema.parse(request.body);
      const result = await dependencies.imageService.create({
        prompt: input.prompt,
        ...(input.quality ? { quality: input.quality } : {}),
      });
      response
        .set("cache-control", "no-store")
        .status(201)
        .json(result);
    } catch (error) {
      next(error);
    }
  };

  app.post("/v1/images", requireApiToken, createImage);

  app.use(express.static(dependencies.publicDirectory));
  app.get("/*splat", (_request, response) => {
    response.sendFile(path.join(dependencies.publicDirectory, "index.html"));
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: "Invalid request",
        details: error.issues.map((issue) => issue.message),
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /Prompt (cannot|must)/.test(message) ? 400 : 500;
    response.status(status).json({ error: message });
  };
  app.use(errorHandler);

  return app;
}
