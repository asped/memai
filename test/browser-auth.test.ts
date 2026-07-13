import assert from "node:assert/strict";
import test from "node:test";
import {
  clearBrowserSessionCookie,
  createBrowserSessionCookie,
  credentialsAreValid,
  hasValidBrowserSession,
  isSameOriginRequest,
} from "../src/browser-auth.js";

const config = {
  BROWSER_USERNAME: "admin",
  BROWSER_PASSWORD: "correct horse battery staple",
  SESSION_SECRET: "session-secret",
};

test("creates and verifies an expiring signed browser session", () => {
  const cookie = createBrowserSessionCookie(config, { now: 1_000, secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(hasValidBrowserSession(cookie, config, 1_001), true);
  assert.equal(hasValidBrowserSession(cookie, config, 1_000 + 12 * 60 * 60), false);
  assert.equal(hasValidBrowserSession(cookie.replace(".", "x."), config, 1_001), false);
  assert.match(clearBrowserSessionCookie(true), /Max-Age=0/);
});

test("validates both browser credentials", () => {
  assert.equal(credentialsAreValid("admin", "correct horse battery staple", config), true);
  assert.equal(credentialsAreValid("admin", "wrong", config), false);
  assert.equal(credentialsAreValid("someone", "correct horse battery staple", config), false);
});

test("requires an exact request origin", () => {
  assert.equal(isSameOriginRequest("https://memai.example/auth/login", "https://memai.example"), true);
  assert.equal(isSameOriginRequest("https://memai.example/auth/login", "https://evil.example"), false);
  assert.equal(isSameOriginRequest("https://memai.example/auth/login", undefined), false);
});
