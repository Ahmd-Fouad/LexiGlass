import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateRateLimit, rateLimitResponse } from "../lib/rate-limit";

const config = { limit: 2, windowMs: 60_000, blockMs: 30_000 };
const at = new Date("2026-07-18T12:00:00.000Z");

describe("rate limiting", () => {
  it("allows requests below and at the limit", () => {
    const first = evaluateRateLimit(null, config, at);
    const second = evaluateRateLimit(first.state, config, new Date(at.getTime() + 1));
    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
  });

  it("blocks the first request above the limit with Retry-After", () => {
    const state = { count: 2, windowStart: at, blockedUntil: null };
    const decision = evaluateRateLimit(state, config, new Date(at.getTime() + 2));
    assert.equal(decision.allowed, false);
    assert.equal(decision.retryAfterSeconds, 30);
    const response = rateLimitResponse(decision);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "30");
  });

  it("keeps a lockout active until blockedUntil", () => {
    const state = { count: 3, windowStart: at, blockedUntil: new Date(at.getTime() + 20_000) };
    const decision = evaluateRateLimit(state, config, new Date(at.getTime() + 5_000));
    assert.equal(decision.allowed, false);
    assert.equal(decision.retryAfterSeconds, 15);
  });

  it("resets deterministically after the window", () => {
    const state = { count: 2, windowStart: at, blockedUntil: null };
    const decision = evaluateRateLimit(state, config, new Date(at.getTime() + config.windowMs));
    assert.equal(decision.allowed, true);
    assert.equal(decision.state.count, 1);
  });

  it("independent identities have independent state", () => {
    const userA = evaluateRateLimit(null, config, at);
    const userB = evaluateRateLimit(null, config, at);
    assert.equal(userA.state.count, 1);
    assert.equal(userB.state.count, 1);
  });
});
