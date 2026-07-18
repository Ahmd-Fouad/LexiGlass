import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

describe("service worker privacy policy", () => {
  it("never handles API requests", () => {
    assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  });
  it("only stores the public offline shell and immutable assets", () => {
    assert.match(worker, /cache\.put\("\/offline"/);
    assert.doesNotMatch(worker, /cache\.put\([^\n]*\/dashboard/);
  });
  it("requires an explicit message before a waiting update skips", () => {
    assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
    const installStart = worker.indexOf('self.addEventListener("install"');
    const messageStart = worker.indexOf('self.addEventListener("message"');
    const installBlock = worker.slice(installStart, messageStart);
    assert.doesNotMatch(installBlock, /skipWaiting/);
  });
});
