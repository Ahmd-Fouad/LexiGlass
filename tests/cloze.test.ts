// Tests for full cloze practice (lib/cloze.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClozeFromCard,
  canCreateCloze,
  checkClozeAnswer,
  createClozePrompt,
  evaluateCloze,
  normalizeClozeAnswer,
  type ClozeCard,
} from "../lib/cloze";
import { ratingFromCorrectness } from "../lib/srs";

describe("canCreateCloze", () => {
  it("allows a single-word cloze when the example contains the word", () => {
    const card: ClozeCard = { text: "restrict", kind: "word", example: "They restrict access to the files." };
    assert.equal(canCreateCloze(card), true);
  });

  it("allows a phrase cloze when the example contains the full phrase", () => {
    const card: ClozeCard = {
      text: "winning formula",
      kind: "phrase",
      example: "After several failed attempts, we finally found a winning formula for improving our study routine.",
    };
    assert.equal(canCreateCloze(card), true);
  });

  it("rejects a cloze when the target is missing from the example", () => {
    assert.equal(canCreateCloze({ text: "restrict", example: "There are no rules here." }), false);
    // "winning formula" phrase must not match an example that only has "win".
    assert.equal(
      canCreateCloze({ text: "winning formula", kind: "phrase", example: "He deserved to win." }),
      false
    );
  });

  it("rejects when there is no example at all", () => {
    assert.equal(canCreateCloze({ text: "restrict", example: null }), false);
    assert.equal(canCreateCloze({ text: "restrict" }), false);
  });

  it("does not match the target inside a longer word", () => {
    // "win" should not be found inside "winning".
    assert.equal(canCreateCloze({ text: "win", example: "She has a winning smile." }), false);
  });
});

describe("createClozePrompt", () => {
  it("blanks out a single word, keeping the rest of the sentence", () => {
    const out = createClozePrompt("They restrict access to the files.", "restrict");
    assert.ok(out.includes("______"));
    assert.ok(!/restrict/i.test(out));
    assert.equal(out, "They ______ access to the files.");
  });

  it("blanks out the full phrase, not just one word of it", () => {
    const out = createClozePrompt(
      "After several failed attempts, we finally found a winning formula for improving our study routine.",
      "winning formula"
    );
    assert.ok(out.includes("______"));
    assert.ok(!/winning formula/i.test(out));
    assert.ok(out.includes("found a ______ for"));
  });

  it("is case-insensitive when locating the target", () => {
    assert.equal(createClozePrompt("Winning formula matters.", "winning formula"), "______ matters.");
  });

  it("returns the sentence unchanged when the target is absent", () => {
    assert.equal(createClozePrompt("Nothing to see here.", "restrict"), "Nothing to see here.");
  });
});

describe("buildClozeFromCard", () => {
  it("builds a phrase cloze with the full phrase as the answer", () => {
    const cloze = buildClozeFromCard({
      text: "winning formula",
      kind: "phrase",
      example: "We finally found a winning formula for studying.",
    });
    assert.ok(cloze);
    assert.equal(cloze.kind, "phrase");
    assert.equal(cloze.answer, "winning formula");
    assert.ok(cloze.sentence.includes("______"));
    assert.ok(!cloze.sentence.toLowerCase().includes("winning formula"));
  });

  it("returns null when no cloze can be made", () => {
    assert.equal(buildClozeFromCard({ text: "restrict", example: "No target here." }), null);
  });
});

describe("normalizeClozeAnswer", () => {
  it("lowercases, trims, and strips simple punctuation", () => {
    assert.equal(normalizeClozeAnswer("  Winning Formula! "), "winning formula");
    assert.equal(normalizeClozeAnswer("don’t"), "don't");
  });
});

describe("checkClozeAnswer", () => {
  it("accepts answers case-insensitively and ignores punctuation/whitespace", () => {
    assert.ok(checkClozeAnswer("  Restrict! ", "restrict", { kind: "word" }));
    assert.ok(checkClozeAnswer("Winning Formula.", "winning formula", { kind: "phrase" }));
  });

  it("requires the full phrase for phrase cards — one word is never enough", () => {
    assert.ok(checkClozeAnswer("winning formula", "winning formula", { kind: "phrase" }));
    assert.ok(!checkClozeAnswer("formula", "winning formula", { kind: "phrase" }));
    assert.ok(!checkClozeAnswer("winning", "winning formula", { kind: "phrase" }));
  });

  it("tolerates one small typo for single words only", () => {
    assert.ok(checkClozeAnswer("restrictt", "restrict", { kind: "word" })); // 1 extra letter
    assert.ok(checkClozeAnswer("restict", "restrict", { kind: "word" })); // 1 missing letter
    assert.ok(!checkClozeAnswer("restraint", "restrict", { kind: "word" })); // too far
  });

  it("gives phrases no typo tolerance", () => {
    assert.ok(!checkClozeAnswer("winnin formula", "winning formula", { kind: "phrase" }));
  });

  it("infers phrase vs word from the target when kind is omitted", () => {
    assert.ok(!checkClozeAnswer("formula", "winning formula")); // inferred phrase
    assert.ok(checkClozeAnswer("restrictt", "restrict")); // inferred word, typo tolerated
  });

  it("can disable typo tolerance for words", () => {
    assert.ok(!checkClozeAnswer("restrictt", "restrict", { kind: "word", allowTypos: false }));
  });

  it("rejects an empty answer", () => {
    assert.ok(!checkClozeAnswer("", "restrict", { kind: "word" }));
    assert.ok(!checkClozeAnswer("   ", "restrict", { kind: "word" }));
  });
});

describe("evaluateCloze → SRS rating", () => {
  const phrase: ClozeCard = {
    text: "winning formula",
    kind: "phrase",
    example: "We found a winning formula for studying.",
  };
  const word: ClozeCard = { text: "restrict", kind: "word", example: "They restrict access." };

  it("maps a correct cloze answer to Good", () => {
    const result = evaluateCloze("winning formula", phrase);
    assert.equal(result.correct, true);
    assert.equal(result.similarity, 1);
    assert.equal(ratingFromCorrectness(result.correct), "good");
  });

  it("maps a wrong cloze answer to Again", () => {
    const result = evaluateCloze("formula", phrase);
    assert.equal(result.correct, false);
    assert.equal(ratingFromCorrectness(result.correct), "again");
  });

  it("reports a high similarity for a near-miss single word", () => {
    const result = evaluateCloze("restric", word); // one letter off but distance 1, len<... still typo-tolerated
    // "restric" is distance 1 from "restrict" and length ≥ 5 → counted correct.
    assert.equal(result.correct, true);
  });

  it("reports partial similarity for a clearly wrong answer", () => {
    const result = evaluateCloze("banana", word);
    assert.equal(result.correct, false);
    assert.ok(result.similarity < 0.5);
  });
});
