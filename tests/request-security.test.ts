import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTrustedRequestOrigin } from "../lib/request-security";

describe("mutation origin validation", () => {
  it("accepts same-origin Origin and Referer headers", () => {
    assert.equal(isTrustedRequestOrigin({ requestUrl: "https://app.example/api/cards", origin: "https://app.example" }), true);
    assert.equal(isTrustedRequestOrigin({ requestUrl: "https://app.example/api/cards", referer: "https://app.example/cards" }), true);
  });
  it("rejects cross-origin, malformed and missing evidence", () => {
    assert.equal(isTrustedRequestOrigin({ requestUrl: "https://app.example/api/cards", origin: "https://evil.example" }), false);
    assert.equal(isTrustedRequestOrigin({ requestUrl: "https://app.example/api/cards", origin: "not a url" }), false);
    assert.equal(isTrustedRequestOrigin({ requestUrl: "https://app.example/api/cards" }), false);
  });
  it("supports an explicit public origin behind a trusted proxy", () => {
    assert.equal(isTrustedRequestOrigin({
      requestUrl: "http://internal:3000/api/cards",
      origin: "https://learn.example",
      configuredOrigin: "https://learn.example/",
    }), true);
  });
});

