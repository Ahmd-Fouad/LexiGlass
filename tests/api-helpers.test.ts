import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readJsonBody } from "../lib/api-helpers";

describe("bounded JSON bodies", () => {
  it("accepts a small JSON object", async () => {
    const result = await readJsonBody(new Request("https://app.example/api/test", {
      method: "POST", body: JSON.stringify({ value: "ok" }),
    }), 100);
    assert.equal(result.ok, true);
  });
  it("rejects an oversized declared or actual body", async () => {
    const declared = await readJsonBody(new Request("https://app.example/api/test", {
      method: "POST", headers: { "content-length": "1000" }, body: "{}",
    }), 10);
    assert.equal(declared.ok, false);
    if (!declared.ok) assert.equal(declared.response.status, 413);

    const actual = await readJsonBody(new Request("https://app.example/api/test", {
      method: "POST", body: JSON.stringify({ value: "a".repeat(100) }),
    }), 20);
    assert.equal(actual.ok, false);
  });
  it("rejects malformed and non-object JSON", async () => {
    const malformed = await readJsonBody(new Request("https://app.example/api/test", { method: "POST", body: "{" }));
    assert.equal(malformed.ok, false);
    const array = await readJsonBody(new Request("https://app.example/api/test", { method: "POST", body: "[]" }));
    assert.equal(array.ok, false);
  });
});

