import { readNetlifyImage } from "../../src/netlify-image-store.js";
import { jsonResponse } from "../../src/netlify-runtime.js";

const validImageKey = /^[0-9a-f-]+\.(?:jpg|png|webp)$/i;

export default async (request: Request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  }

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!validImageKey.test(key)) {
    return jsonResponse({ error: "Image not found" }, { status: 404 });
  }

  const stored = await readNetlifyImage(key);
  if (!stored) {
    return jsonResponse({ error: "Image not found" }, { status: 404 });
  }

  const mimeType =
    typeof stored.metadata.mimeType === "string" ? stored.metadata.mimeType : stored.data.type;

  return new Response(stored.data, {
    status: 200,
    headers: {
      "cache-control": "public, max-age=2592000, immutable",
      "content-type": mimeType || "application/octet-stream",
    },
  });
};
