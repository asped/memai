import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "memai_session";
const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

export interface BrowserAuthConfig {
  BROWSER_USERNAME: string;
  BROWSER_PASSWORD?: string | undefined;
  SESSION_SECRET?: string | undefined;
}

interface SessionPayload {
  username: string;
  expiresAt: number;
}

function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHmac("sha256", "memai-constant-time-compare").update(left).digest();
  const rightDigest = createHmac("sha256", "memai-constant-time-compare").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  for (const part of cookieHeader?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export function isBrowserAuthConfigured(config: BrowserAuthConfig): boolean {
  return Boolean(config.BROWSER_PASSWORD && config.SESSION_SECRET);
}

export function credentialsAreValid(
  username: string,
  password: string,
  config: BrowserAuthConfig,
): boolean {
  return Boolean(
    config.BROWSER_PASSWORD &&
      safeEqual(username, config.BROWSER_USERNAME) &&
      safeEqual(password, config.BROWSER_PASSWORD),
  );
}

export function createBrowserSessionCookie(
  config: BrowserAuthConfig,
  options: { now?: number; secure?: boolean } = {},
): string {
  if (!config.SESSION_SECRET) throw new Error("Browser authentication is not configured");
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  const payload: SessionPayload = {
    username: config.BROWSER_USERNAME,
    expiresAt: now + SESSION_LIFETIME_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${sign(encoded, config.SESSION_SECRET)}`;
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_LIFETIME_SECONDS}`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearBrowserSessionCookie(secure = false): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function hasValidBrowserSession(
  cookieHeader: string | null | undefined,
  config: BrowserAuthConfig,
  now = Math.floor(Date.now() / 1_000),
): boolean {
  if (!config.SESSION_SECRET) return false;
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator === -1) return false;
  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, sign(encoded, config.SESSION_SECRET))) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    return (
      payload.username === config.BROWSER_USERNAME &&
      Number.isSafeInteger(payload.expiresAt) &&
      payload.expiresAt > now
    );
  } catch {
    return false;
  }
}

export function isSameOriginRequest(requestUrl: string, origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}
