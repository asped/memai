import type { Config } from "@netlify/functions";
import { clearBrowserSessionCookie, isSameOriginRequest } from "../../src/browser-auth.js";
import { jsonResponse } from "../../src/netlify-http.js";

export default (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  }
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return jsonResponse({ error: "Invalid request origin" }, { status: 403 });
  }
  return jsonResponse(
    { authenticated: false },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "set-cookie": clearBrowserSessionCookie(new URL(request.url).protocol === "https:"),
      },
    },
  );
};

export const config = { path: "/auth/logout" } satisfies Config;
