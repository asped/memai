import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadConfig } from "./config.js";
import { imageQualities } from "./types.js";

export const netlifyImageRequestSchema = z.object({
  prompt: z.string().min(1).max(1_000),
  quality: z.enum(imageQualities).optional(),
});

export function loadNetlifyConfig(environment = process.env) {
  const publicBaseUrl = environment.PUBLIC_BASE_URL || environment.URL;
  return loadConfig({
    ...environment,
    ...(publicBaseUrl ? { PUBLIC_BASE_URL: publicBaseUrl } : {}),
  });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return jsonResponse(
      {
        error: "Invalid request",
        details: error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  if (/Prompt (cannot|must)/.test(message)) {
    return jsonResponse({ error: message }, { status: 400 });
  }
  console.error("MemAI request failed", error);
  return jsonResponse({ error: "Image generation failed" }, { status: 500 });
}

export async function readJsonBody(request: Request) {
  const body = await request.text();
  if (body.length > 16_384) throw new Error("Request body is too large");
  return JSON.parse(body) as unknown;
}

export function hasValidApiToken(request: Request, token: string | undefined) {
  if (!token) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  const actualDigest = createHmac("sha256", "memai-api-token").update(authorization).digest();
  const expectedDigest = createHmac("sha256", "memai-api-token").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function getNetlifyRouteValue(
  request: Request,
  searchParameter: string,
  pathPrefix: string,
) {
  const url = new URL(request.url);
  const queryValue = url.searchParams.get(searchParameter);
  if (queryValue && queryValue !== ":splat") return queryValue;

  const prefixIndex = url.pathname.indexOf(pathPrefix);
  if (prefixIndex === -1) return "";

  const encoded = url.pathname.slice(prefixIndex + pathPrefix.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
}
