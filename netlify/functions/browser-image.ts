import type { Config } from "@netlify/functions";
import { hasValidBrowserSession, isSameOriginRequest } from "../../src/browser-auth.js";
import { createNetlifyImageService } from "../../src/netlify-runtime.js";
import {
  errorResponse,
  jsonResponse,
  loadNetlifyConfig,
  netlifyImageRequestSchema,
  readJsonBody,
} from "../../src/netlify-http.js";

export default async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  }
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return jsonResponse({ error: "Invalid request origin" }, { status: 403 });
  }

  const config = loadNetlifyConfig();
  if (!hasValidBrowserSession(request.headers.get("cookie"), config)) {
    return jsonResponse({ error: "Login required" }, { status: 401 });
  }

  try {
    const { imageService } = createNetlifyImageService();
    const input = netlifyImageRequestSchema.parse(await readJsonBody(request));
    const result = await imageService.create({
      prompt: input.prompt,
      ...(input.quality ? { quality: input.quality } : {}),
    });
    return jsonResponse(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = {
  path: "/browser/images",
  rateLimit: { aggregateBy: "ip", windowSize: 60, windowLimit: 5 },
} satisfies Config;
