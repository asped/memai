import assert from "node:assert/strict";
import test from "node:test";
import { getNetlifyRouteValue } from "../src/netlify-http.js";

test("reads a Netlify wildcard value from the original request path", () => {
  const request = new Request("https://memai.netlify.app/images/the%20deploy%20worked");
  assert.equal(
    getNetlifyRouteValue(request, "prompt", "/images/"),
    "the deploy worked",
  );
});

test("prefers a populated Netlify wildcard query value", () => {
  const request = new Request(
    "https://memai.netlify.app/.netlify/functions/direct-image?prompt=hello%20there",
  );
  assert.equal(getNetlifyRouteValue(request, "prompt", "/images/"), "hello there");
});
