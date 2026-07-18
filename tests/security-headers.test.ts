import assert from "node:assert/strict";
import { describe, it } from "node:test";
import nextConfig from "../next.config";
import { requestId } from "../lib/request-id";

describe("production security policy", () => {
  it("sets the expected defensive response headers", async () => {
    const rules = await nextConfig.headers?.();
    const headers = new Map(rules?.[0]?.headers.map((item) => [item.key, item.value]));
    assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
    assert.equal(headers.get("X-Frame-Options"), "DENY");
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
    assert.ok(headers.has("Permissions-Policy"));
  });

  it("accepts only bounded, safe upstream request IDs", () => {
    assert.equal(requestId(new Headers({ "x-request-id": "trusted_ID-123" })), "trusted_ID-123");
    assert.notEqual(requestId(new Headers({ "x-request-id": "bad value" })), "bad value");
  });
});
