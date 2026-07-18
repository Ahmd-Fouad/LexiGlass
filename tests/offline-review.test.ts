import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActionTimestampUsable,
  isDuplicateAction,
  prepareSyncActions,
  validateQueuedReviewAction,
} from "../lib/offline-review";

const now = new Date("2026-07-18T12:00:00.000Z");
const action = {
  id: "action-1",
  flashcardId: "card-1",
  rating: "good" as const,
  reviewedAt: "2026-07-18T11:00:00.000Z",
};

describe("offline review queue safety", () => {
  it("validates the durable action id and rating", () => {
    assert.deepEqual(validateQueuedReviewAction(action), action);
    assert.equal(validateQueuedReviewAction({ ...action, rating: "perfect" }), null);
    assert.equal(validateQueuedReviewAction({ ...action, id: "" }), null);
  });

  it("deduplicates action ids and identical card timestamps", () => {
    assert.equal(isDuplicateAction([action], { ...action }), true);
    assert.equal(isDuplicateAction([action], { ...action, id: "action-2" }), true);
    assert.equal(isDuplicateAction([action], { ...action, id: "action-2", reviewedAt: "2026-07-18T11:01:00.000Z" }), false);
  });

  it("sorts actions chronologically before server replay", () => {
    const later = { ...action, id: "action-2", reviewedAt: "2026-07-18T11:30:00.000Z" };
    assert.deepEqual(prepareSyncActions([later, action]).map((a) => a.id), ["action-1", "action-2"]);
  });

  it("rejects stale and future actions safely", () => {
    assert.equal(isActionTimestampUsable(action, now), true);
    assert.equal(isActionTimestampUsable({ ...action, reviewedAt: "2026-05-01T00:00:00.000Z" }, now), false);
    assert.equal(isActionTimestampUsable({ ...action, reviewedAt: "2026-07-18T13:00:00.000Z" }, now), false);
  });
});

