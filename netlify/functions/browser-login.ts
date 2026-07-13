import type { Config } from "@netlify/functions";
import { z } from "zod";
import {
  createBrowserSessionCookie,
  credentialsAreValid,
  isBrowserAuthConfigured,
  isSameOriginRequest,
} from "../../src/browser-auth.js";
import { jsonResponse, loadNetlifyConfig, readJsonBody } from "../../src/netlify-http.js";

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(500),
});

export default async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST" } });
  }
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return jsonResponse({ error: "Invalid request origin" }, { status: 403 });
  }

  const config = loadNetlifyConfig();
  if (!isBrowserAuthConfigured(config)) {
    return jsonResponse({ error: "Browser login is not configured" }, { status: 503 });
  }

  try {
    const input = loginSchema.parse(await readJsonBody(request));
    if (!credentialsAreValid(input.username, input.password, config)) {
      return jsonResponse({ error: "Invalid username or password" }, { status: 401 });
    }
    return jsonResponse(
      { authenticated: true, username: config.BROWSER_USERNAME },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "set-cookie": createBrowserSessionCookie(config, {
            secure: new URL(request.url).protocol === "https:",
          }),
        },
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return jsonResponse({ error: "Invalid login request" }, { status: 400 });
    }
    console.error("Browser login failed", error);
    return jsonResponse({ error: "Login failed" }, { status: 500 });
  }
};

export const config = {
  path: "/auth/login",
  rateLimit: { aggregateBy: "ip", windowSize: 60, windowLimit: 5 },
} satisfies Config;
