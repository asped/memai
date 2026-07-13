import { createNetlifyImageService } from "../../src/netlify-runtime.js";
import {
  errorResponse,
  hasValidApiToken,
  jsonResponse,
  loadNetlifyConfig,
  netlifyImageRequestSchema,
  readJsonBody,
} from "../../src/netlify-http.js";

export default async (request: Request) => {
  const config = loadNetlifyConfig();

  if (!hasValidApiToken(request, config.API_TOKEN)) {
    return jsonResponse({ error: "Invalid API token" }, { status: 401 });
  }

  if (request.method === "GET") {
    return jsonResponse(
      { error: "Method not allowed; use POST /v1/images" },
      { status: 405, headers: { allow: "POST" } },
    );
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
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
