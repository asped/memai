import type { Config } from "@netlify/functions";
import { hasValidBrowserSession } from "../../src/browser-auth.js";
import { jsonResponse, loadNetlifyConfig } from "../../src/netlify-http.js";

export default (request: Request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "GET" } });
  }
  const config = loadNetlifyConfig();
  const authenticated = hasValidBrowserSession(request.headers.get("cookie"), config);
  return jsonResponse(
    { authenticated, ...(authenticated ? { username: config.BROWSER_USERNAME } : {}) },
    { status: authenticated ? 200 : 401, headers: { "cache-control": "no-store" } },
  );
};

export const config = { path: "/auth/session" } satisfies Config;
