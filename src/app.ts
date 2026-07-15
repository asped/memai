import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { z } from "zod";
import {
  clearBrowserSessionCookie,
  createBrowserSessionCookie,
  credentialsAreValid,
  hasValidBrowserSession,
  isBrowserAuthConfigured,
} from "./browser-auth.js";
import type { AppConfig } from "./config.js";
import type { ImageService } from "./image-service.js";
import {
  finishSlackCommand,
  finishSlackMention,
  parseSlackEvent,
  verifySlackRequest,
} from "./slack.js";
import { imageQualities } from "./types.js";

const imageRequestSchema = z.object({
  prompt: z.string().min(1).max(1_000),
  quality: z.enum(imageQualities).optional(),
});

const loginRequestSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(500),
});

export interface AppDependencies {
  config: Pick<
    AppConfig,
    | "API_TOKEN"
    | "BROWSER_USERNAME"
    | "BROWSER_PASSWORD"
    | "SESSION_SECRET"
    | "SLACK_SIGNING_SECRET"
    | "SLACK_TEAM_ID"
    | "SLACK_BOT_TOKEN"
  >;
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
      if (
        dependencies.config.SLACK_TEAM_ID &&
        form.get("team_id") !== dependencies.config.SLACK_TEAM_ID
      ) {
        response.status(403).json({ error: "Slack workspace is not allowed" });
        return;
      }
      const prompt = form.get("text")?.trim() ?? "";
      const userId = form.get("user_id") ?? undefined;
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
        userId,
        responseUrl,
        imageService: dependencies.imageService,
      }).catch((error: unknown) => {
        console.error("Could not deliver the Slack command response", error);
      });
    },
  );

  app.post(
    "/integrations/slack/events",
    express.raw({ type: "application/json", limit: "32kb" }),
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

      let parsed;
      try {
        parsed = parseSlackEvent(body);
      } catch {
        response.status(400).json({ error: "Invalid Slack event" });
        return;
      }

      const teamId = parsed.kind === "mention" ? parsed.mention.teamId : parsed.teamId;
      if (
        dependencies.config.SLACK_TEAM_ID &&
        teamId &&
        teamId !== dependencies.config.SLACK_TEAM_ID
      ) {
        response.status(403).json({ error: "Slack workspace is not allowed" });
        return;
      }
      if (parsed.kind === "challenge") {
        response.json({ challenge: parsed.challenge });
        return;
      }

      response.json({ ok: true });
      if (
        parsed.kind === "mention" &&
        !request.header("x-slack-retry-num") &&
        dependencies.config.SLACK_BOT_TOKEN
      ) {
        void finishSlackMention({
          mention: parsed.mention,
          botToken: dependencies.config.SLACK_BOT_TOKEN,
          imageService: dependencies.imageService,
        }).catch((error: unknown) => {
          console.error("Could not deliver the Slack mention response", error);
        });
      }
    },
  );

  app.use(express.json({ limit: "16kb" }));

  const hasSameOrigin = (request: express.Request) => {
    const origin = request.header("origin");
    if (!origin) return false;
    try {
      return new URL(origin).origin === `${request.protocol}://${request.header("host")}`;
    } catch {
      return false;
    }
  };

  const requireSameOrigin: RequestHandler = (request, response, next) => {
    if (hasSameOrigin(request)) {
      next();
      return;
    }
    response.status(403).json({ error: "Invalid request origin" });
  };

  const requireBrowserSession: RequestHandler = (request, response, next) => {
    if (hasValidBrowserSession(request.header("cookie"), dependencies.config)) {
      next();
      return;
    }
    response.status(401).json({ error: "Login required" });
  };

  const requireApiToken: RequestHandler = (request, response, next) => {
    const token = dependencies.config.API_TOKEN;
    const authorization = request.header("authorization") ?? "";
    const actual = createHmac("sha256", "memai-api-token").update(authorization).digest();
    const expected = createHmac("sha256", "memai-api-token")
      .update(token ? `Bearer ${token}` : "missing-token")
      .digest();
    if (token && timingSafeEqual(actual, expected)) {
      next();
      return;
    }
    response.status(401).json({ error: "Invalid API token" });
  };

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/auth/session", (request, response) => {
    const authenticated = hasValidBrowserSession(request.header("cookie"), dependencies.config);
    response
      .status(authenticated ? 200 : 401)
      .set("cache-control", "no-store")
      .json({
        authenticated,
        ...(authenticated ? { username: dependencies.config.BROWSER_USERNAME } : {}),
      });
  });

  app.post("/auth/login", requireSameOrigin, (request, response) => {
    if (!isBrowserAuthConfigured(dependencies.config)) {
      response.status(503).json({ error: "Browser login is not configured" });
      return;
    }
    const input = loginRequestSchema.parse(request.body);
    if (!credentialsAreValid(input.username, input.password, dependencies.config)) {
      response.status(401).json({ error: "Invalid username or password" });
      return;
    }
    response
      .set({
        "cache-control": "no-store",
        "set-cookie": createBrowserSessionCookie(dependencies.config, {
          secure: request.protocol === "https",
        }),
      })
      .json({ authenticated: true, username: dependencies.config.BROWSER_USERNAME });
  });

  app.post("/auth/logout", requireSameOrigin, (_request, response) => {
    response
      .set({
        "cache-control": "no-store",
        "set-cookie": clearBrowserSessionCookie(false),
      })
      .json({ authenticated: false });
  });

  app.get("/images/:prompt", requireBrowserSession, async (request, response, next) => {
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

  app.post("/browser/images", requireSameOrigin, requireBrowserSession, createImage);
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
    if (/Prompt (cannot|must)/.test(message)) {
      response.status(400).json({ error: message });
      return;
    }
    console.error("MemAI request failed", error);
    response.status(500).json({ error: "Image generation failed" });
  };
  app.use(errorHandler);

  return app;
}
