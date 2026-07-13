import { errorResponse, netlifyImageRequestSchema } from "../../src/netlify-http.js";
import { createNetlifyImageService } from "../../src/netlify-runtime.js";

export default async (request: Request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  }

  try {
    const url = new URL(request.url);
    const input = netlifyImageRequestSchema.parse({
      prompt: url.searchParams.get("prompt") ?? "",
      ...(url.searchParams.get("quality") ? { quality: url.searchParams.get("quality") } : {}),
    });
    const { imageService } = createNetlifyImageService();
    const image = await imageService.generate({
      prompt: input.prompt,
      ...(input.quality ? { quality: input.quality } : {}),
    });

    return new Response(Uint8Array.from(image.bytes), {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-disposition": 'inline; filename="memai.jpg"',
        "content-length": String(image.bytes.length),
        "content-type": image.mimeType,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
};
