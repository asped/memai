import { z } from "zod";
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
  const status = /Prompt (cannot|must)/.test(message) ? 400 : 500;
  return jsonResponse({ error: message }, { status });
}

export async function readJsonBody(request: Request) {
  const body = await request.text();
  if (body.length > 16_384) throw new Error("Request body is too large");
  return JSON.parse(body) as unknown;
}

export function hasValidApiToken(request: Request, token: string | undefined) {
  return !token || request.headers.get("authorization") === `Bearer ${token}`;
}
