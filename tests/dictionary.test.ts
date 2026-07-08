// Tests for the Smart Definition & Example Assistant (lib/dictionary.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DICTIONARY_CACHE_VERSION,
  LOCAL_SOURCE,
  containsTerm,
  lookupDefinitions,
  lookupExamples,
  normalizeTerm,
  parseDatamuse,
  parseDictionaryApiDev,
  parseFreeDictionaryApi,
  parseTatoeba,
  rankDefinitions,
  rankExamples,
  scoreDefinitionSuggestion,
  scoreExampleSentence,
  type DictionaryCacheStore,
  type DictionarySuggestion,
  type ExampleSuggestion,
} from "../lib/dictionary";
import { findLocalPhrase, findLocalWordExamples } from "../lib/local-phrase-dictionary";

// ---------- Test doubles ----------

type Route = { status: number; json?: unknown } | "network-error";

/** Fake fetch: routes by URL substring, records every call. */
function fakeFetch(handler: (url: string) => Route) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = handler(url);
    if (route === "network-error") throw new Error("network down");
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      json: async () => route.json,
    } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

/** In-memory cache store recording sets. */
function fakeCache(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const sets: { normalizedTerm: string; type: string; source: string; data: string }[] = [];
  const cache: DictionaryCacheStore = {
    async get(normalizedTerm, type) {
      return store.get(`${type}:${normalizedTerm}`) ?? null;
    },
    async set(entry) {
      sets.push(entry);
      store.set(`${entry.type}:${entry.normalizedTerm}`, entry.data);
    },
  };
  return { cache, sets };
}

/** Wraps a result the way the current cache version stores it. */
function versioned(result: unknown): string {
  return JSON.stringify({ v: DICTIONARY_CACHE_VERSION, result });
}

// ---------- Fixtures ----------

const dictApiDevHello = [
  {
    word: "hello",
    phonetic: "/həˈləʊ/",
    phonetics: [{ text: "/həˈləʊ/", audio: "https://api.dictionaryapi.dev/media/hello.mp3" }],
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          {
            definition: '"Hello!" or an equivalent greeting.',
            example: "She gave him a cheerful hello.",
            synonyms: ["greeting"],
            antonyms: [],
          },
        ],
        synonyms: ["salutation"],
        antonyms: ["farewell"],
      },
      {
        partOfSpeech: "interjection",
        definitions: [
          { definition: "A greeting used when meeting someone.", example: "Hello, everyone, nice to meet you." },
        ],
      },
    ],
  },
];

const freeDictHello = {
  word: "hello",
  entries: [
    {
      partOfSpeech: "interjection",
      pronunciations: [{ type: "ipa", text: "/hɛˈloʊ/" }],
      definitions: [
        {
          definition: "A greeting said when meeting someone.",
          examples: ["Hello there, how are you doing today?"],
          synonyms: ["hi"],
          antonyms: [],
        },
      ],
      synonyms: ["hey"],
      antonyms: ["goodbye"],
    },
  ],
};

const tatoebaHello = {
  results: [
    { id: 1, text: "Hello, how are you doing today?", lang: "eng" },
    { id: 2, text: "Hallo, wie geht es dir heute Morgen?", lang: "deu" },
    { id: 3, text: "He said hello to everyone in the room.", lang: "eng" },
    { id: 4, text: "Hello there.", lang: "eng" }, // too short (< 5 words)
  ],
};

// Tatoeba lemma-matching noise for "winning …" searches: none of these
// contain the full phrase "winning formula".
const tatoebaWinNoise = {
  results: [
    { id: 1, text: "We let her win the game today.", lang: "eng" },
    { id: 2, text: "He deserved to win the championship this year.", lang: "eng" },
    { id: 3, text: "The team kept winning every single match.", lang: "eng" },
  ],
};

function def(definition: string, source = "test"): DictionarySuggestion {
  return { id: "x", definition, partOfSpeech: null, phonetic: null, audioUrl: null, example: null, synonyms: [], antonyms: [], source };
}

function ex(sentence: string): ExampleSuggestion {
  return { id: "x", sentence, source: "test" };
}

// ---------- Term normalization ----------

describe("normalizeTerm", () => {
  it("trims, collapses spaces, and lowercases the key", () => {
    const { display, key } = normalizeTerm("  Winning   Formula  ");
    assert.equal(display, "Winning Formula");
    assert.equal(key, "winning formula");
  });

  it("strips punctuation from the key but preserves the display text", () => {
    const { display, key } = normalizeTerm("break the ice!?");
    assert.equal(display, "break the ice!?");
    assert.equal(key, "break the ice");
  });

  it("keeps apostrophes and hyphens", () => {
    assert.equal(normalizeTerm("Don't give up").key, "don't give up");
    assert.equal(normalizeTerm("well-known").key, "well-known");
  });

  it("handles single words and empty input", () => {
    assert.equal(normalizeTerm("Meticulous").key, "meticulous");
    assert.equal(normalizeTerm("   ").key, "");
  });
});

// ---------- Local phrase dictionary ----------

describe("local phrase dictionary", () => {
  it("finds entries by exact normalized key", () => {
    const entry = findLocalPhrase("get rid of");
    assert.ok(entry);
    assert.equal(entry.type, "phrasal verb");
    assert.ok(entry.definition.toLowerCase().includes("remove"));
  });

  it("matches after normalization of messy input", () => {
    assert.ok(findLocalPhrase(normalizeTerm("  Get RID of!! ").key));
    assert.ok(findLocalPhrase(normalizeTerm("Winning Formula").key));
  });

  it("does not match partial phrases or unknown terms", () => {
    assert.equal(findLocalPhrase("get rid"), null);
    assert.equal(findLocalPhrase("purple elephant theory"), null);
  });

  it("has curated word examples for common study words", () => {
    assert.equal(findLocalWordExamples("restrict").length, 3);
    assert.equal(findLocalWordExamples("nonexistentword").length, 0);
  });
});

// ---------- Target-term matching ----------

describe("containsTerm", () => {
  it("requires the exact full phrase for phrases", () => {
    assert.ok(containsTerm("We finally found a winning formula for studying.", "winning formula"));
    assert.ok(!containsTerm("He deserved to win the championship.", "winning formula"));
    assert.ok(!containsTerm("The formula was winning hearts.", "winning formula"));
  });

  it("accepts valid word forms for single words", () => {
    assert.ok(containsTerm("The company restricts access to files.", "restrict"));
    assert.ok(containsTerm("There are no restrictions on imports.", "restrict"));
    assert.ok(containsTerm("She carried the boxes upstairs.", "carry"));
    assert.ok(containsTerm("They are making progress.", "make"));
  });

  it("does not match unrelated words that merely share a prefix", () => {
    assert.ok(!containsTerm("Be careful with that.", "car"));
    assert.ok(!containsTerm("The catalog is ready.", "cat"));
  });
});

// ---------- Parsers ----------

describe("parseDictionaryApiDev", () => {
  it("extracts definitions, part of speech, phonetics, audio, examples, synonyms and antonyms", () => {
    const out = parseDictionaryApiDev(dictApiDevHello);
    assert.equal(out.length, 2);
    assert.equal(out[0].definition, '"Hello!" or an equivalent greeting.');
    assert.equal(out[0].partOfSpeech, "noun");
    assert.equal(out[0].phonetic, "/həˈləʊ/");
    assert.equal(out[0].audioUrl, "https://api.dictionaryapi.dev/media/hello.mp3");
    assert.equal(out[0].example, "She gave him a cheerful hello.");
    assert.deepEqual(out[0].synonyms, ["greeting", "salutation"]);
    assert.deepEqual(out[0].antonyms, ["farewell"]);
    assert.equal(out[0].source, "dictionaryapi.dev");
    assert.equal(out[1].partOfSpeech, "interjection");
  });

  it("returns an empty list for malformed responses", () => {
    assert.deepEqual(parseDictionaryApiDev({ title: "No Definitions Found" }), []);
    assert.deepEqual(parseDictionaryApiDev(null), []);
    assert.deepEqual(parseDictionaryApiDev([{ meanings: [{ definitions: [{}] }] }]), []);
  });
});

describe("parseFreeDictionaryApi", () => {
  it("extracts definitions with pronunciation, examples, synonyms and antonyms", () => {
    const out = parseFreeDictionaryApi(freeDictHello);
    assert.equal(out.length, 1);
    assert.equal(out[0].definition, "A greeting said when meeting someone.");
    assert.equal(out[0].partOfSpeech, "interjection");
    assert.equal(out[0].phonetic, "/hɛˈloʊ/");
    assert.equal(out[0].example, "Hello there, how are you doing today?");
    assert.deepEqual(out[0].synonyms, ["hi", "hey"]);
    assert.deepEqual(out[0].antonyms, ["goodbye"]);
    assert.equal(out[0].source, "freedictionaryapi.com");
  });

  it("returns an empty list for malformed responses", () => {
    assert.deepEqual(parseFreeDictionaryApi(null), []);
    assert.deepEqual(parseFreeDictionaryApi({ entries: "nope" }), []);
  });
});

describe("parseDatamuse", () => {
  it("extracts unique words from a Datamuse response", () => {
    const out = parseDatamuse([
      { word: "recipe", score: 100 },
      { word: "recipe", score: 90 },
      { word: "method" },
      { notAWord: true },
    ]);
    assert.deepEqual(out, ["recipe", "method"]);
  });

  it("handles empty and malformed responses", () => {
    assert.deepEqual(parseDatamuse([]), []);
    assert.deepEqual(parseDatamuse({ oops: 1 }), []);
  });
});

describe("parseTatoeba", () => {
  it("extracts only English sentences", () => {
    const out = parseTatoeba(tatoebaHello);
    assert.equal(out.length, 3);
    assert.ok(out.every((s) => s.source === "Tatoeba"));
    assert.ok(!out.some((s) => s.sentence.startsWith("Hallo")));
  });

  it("handles malformed responses", () => {
    assert.deepEqual(parseTatoeba(null), []);
    assert.deepEqual(parseTatoeba({ results: "x" }), []);
  });
});

// ---------- Quality scoring ----------

describe("scoreExampleSentence", () => {
  it("prefers sentences with the exact word over inflected forms", () => {
    const exact = scoreExampleSentence("Doctors often advise patients to restrict sugar intake.", "restrict");
    const inflected = scoreExampleSentence("The rules restricted access to the sensitive project files.", "restrict");
    const missing = scoreExampleSentence("The weather was lovely on that sunny afternoon.", "restrict");
    assert.ok(exact > inflected);
    assert.ok(inflected > missing);
    assert.ok(missing < 0);
  });

  it("requires the full phrase for phrase terms", () => {
    const withPhrase = scoreExampleSentence(
      "After several attempts, we finally found a winning formula for our study routine.",
      "winning formula"
    );
    const withoutPhrase = scoreExampleSentence("He deserved to win the championship this year.", "winning formula");
    assert.ok(withPhrase > 0);
    assert.ok(withoutPhrase < 0);
  });

  it("prefers 8-22 word sentences over very short or very long ones", () => {
    const ideal = scoreExampleSentence("I need to get rid of old files to free up disk space.", "get rid of");
    const short = scoreExampleSentence("Get rid of it now, please.", "get rid of");
    assert.ok(ideal > short);
  });

  it("penalizes fragment-like text", () => {
    const sentence = scoreExampleSentence("She speaks English quite well.", "quite");
    const fragment = scoreExampleSentence("speaks English quite", "quite");
    assert.ok(sentence > fragment);
  });
});

describe("scoreDefinitionSuggestion", () => {
  it("penalizes one-word definitions", () => {
    const oneWord = scoreDefinitionSuggestion("Greeting.", "hello");
    const clear = scoreDefinitionSuggestion("A greeting said when meeting someone.", "hello");
    assert.ok(clear > oneWord);
  });

  it("penalizes technical or archaic definitions", () => {
    const plain = scoreDefinitionSuggestion("To remove or throw away something unwanted.", "get rid of");
    const archaic = scoreDefinitionSuggestion("(archaic) To divest oneself of a possession.", "get rid of");
    assert.ok(plain > archaic);
  });
});

// ---------- Ranking / filtering ----------

describe("rankDefinitions", () => {
  it("removes duplicate definitions ignoring case and punctuation", () => {
    const out = rankDefinitions(
      [def("A greeting said to someone."), def("a greeting said to someone"), def("Something else entirely different.")],
      "hello"
    );
    assert.equal(out.length, 2);
  });

  it("caps the number of definitions at 5 and ranks clear ones first", () => {
    const many = [
      def("Word."),
      ...Array.from({ length: 8 }, (_, i) => def(`A clear and useful definition number ${i} of the word.`)),
    ];
    const out = rankDefinitions(many, "hello");
    assert.equal(out.length, 5);
    assert.notEqual(out[0].definition, "Word."); // one-word definition ranked down
  });
});

describe("rankExamples", () => {
  it("removes duplicates and ignores examples shorter than 5 words", () => {
    const out = rankExamples(
      [
        ex("He said hello to everyone here."),
        ex("he said hello to everyone here"),
        ex("Hello there, friend."),
        ex("She waved hello at the neighbors this morning."),
      ],
      "hello"
    );
    assert.equal(out.length, 2);
    assert.ok(!out.some((s) => s.sentence === "Hello there, friend."));
  });

  it("requires the exact full phrase for phrase terms", () => {
    const out = rankExamples(
      [
        ex("We let her win the game today."),
        ex("He deserved to win the championship this year."),
        ex("After several failed attempts, we finally found a winning formula for improving our study routine."),
      ],
      "winning formula"
    );
    assert.equal(out.length, 1);
    assert.ok(out[0].sentence.includes("winning formula"));
  });

  it("drops sentences that do not contain the target word in any form", () => {
    const out = rankExamples(
      [ex("The weather was lovely on that sunny afternoon."), ex("The school restricts phone use during class.")],
      "restrict"
    );
    assert.equal(out.length, 1);
    assert.ok(out[0].sentence.includes("restricts"));
  });

  it("drops very long sentences and keeps at most 5, best first", () => {
    const long = ex("hello " + "word ".repeat(30).trim() + " and this sentence just keeps going on and on forever");
    const sentences = [
      long,
      ex("Hello, it is nice to finally meet you in person today."),
      ex("She gave him a cheerful hello."),
      ex("He shouted hello across the crowded room to his friend."),
      ex("They exchanged a quick hello before the meeting started."),
      ex("A warm hello can brighten someone's entire day at work."),
      ex("Every morning she says hello to the security guard downstairs."),
    ];
    const out = rankExamples(sentences, "hello");
    assert.equal(out.length, 5);
    assert.ok(!out.some((s) => s.sentence === long.sentence));
    // 8-22 word sentences should outrank the 6-word one.
    assert.notEqual(out[0].sentence, "She gave him a cheerful hello.");
  });
});

// ---------- Definition lookup orchestration ----------

describe("lookupDefinitions", () => {
  it("uses dictionaryapi.dev as the primary source for single words and caches the result", async () => {
    const { fn, calls } = fakeFetch((url) =>
      url.includes("dictionaryapi.dev") ? { status: 200, json: dictApiDevHello } : { status: 404 }
    );
    const { cache, sets } = fakeCache();

    const result = await lookupDefinitions("Hello", { fetchFn: fn, cache });
    assert.equal(result.exact, true);
    assert.equal(result.suggestions.length, 2);
    assert.equal(result.suggestions[0].source, "dictionaryapi.dev");
    // Primary succeeded → no fallback calls.
    assert.equal(calls.length, 1);
    // Cache miss stored the normalized, versioned result.
    assert.equal(sets.length, 1);
    assert.equal(sets[0].normalizedTerm, "hello");
    assert.equal(sets[0].type, "definition");
    assert.equal(sets[0].source, "dictionaryapi.dev");
    assert.equal(JSON.parse(sets[0].data).v, DICTIONARY_CACHE_VERSION);
  });

  it("falls back to FreeDictionaryAPI when the primary has no result", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("freedictionaryapi.com") ? { status: 200, json: freeDictHello } : { status: 404 }
    );
    const result = await lookupDefinitions("hello", { fetchFn: fn });
    assert.equal(result.exact, true);
    assert.equal(result.suggestions[0].source, "freedictionaryapi.com");
  });

  it("falls back to the next source when the primary API fails (network error)", async () => {
    const { fn } = fakeFetch((url) => {
      if (url.includes("dictionaryapi.dev")) return "network-error";
      if (url.includes("freedictionaryapi.com")) return { status: 200, json: freeDictHello };
      return { status: 404 };
    });
    const result = await lookupDefinitions("hello", { fetchFn: fn });
    assert.equal(result.exact, true);
    assert.equal(result.suggestions[0].source, "freedictionaryapi.com");
  });

  it("returns the built-in definition for 'winning formula' without calling any external API", async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 404 }));
    const result = await lookupDefinitions("winning formula", { fetchFn: fn });
    assert.equal(result.exact, true);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].source, LOCAL_SOURCE);
    assert.equal(
      result.suggestions[0].definition,
      "A method, plan, or combination of things that produces successful results."
    );
    assert.equal(result.suggestions[0].partOfSpeech, "noun phrase");
    // Local phrase dictionary wins for phrases — zero external calls.
    assert.equal(calls.length, 0);
  });

  it("uses the local dictionary as a late fallback for phrases only after real dictionaries", async () => {
    // "figure out" is in the local dictionary, but phrases check local FIRST.
    const { fn, calls } = fakeFetch(() => ({ status: 200, json: dictApiDevHello }));
    const result = await lookupDefinitions("figure out", { fetchFn: fn });
    assert.equal(result.suggestions[0].source, LOCAL_SOURCE);
    assert.equal(calls.length, 0);
  });

  it("returns Datamuse words as related suggestions, never as definitions", async () => {
    const { fn } = fakeFetch((url) => {
      if (url.includes("datamuse.com") && url.includes("ml="))
        return { status: 200, json: [{ word: "recipe for success" }, { word: "formula" }] };
      if (url.includes("datamuse.com")) return { status: 200, json: [] };
      return { status: 404 };
    });
    const result = await lookupDefinitions("purple elephant theory", { fetchFn: fn });
    assert.equal(result.exact, false); // → UI renders "No exact definition found — related suggestions"
    assert.equal(result.suggestions.length, 0); // related words are NOT definitions
    assert.deepEqual(result.related, ["recipe for success", "formula"]);
  });

  it("returns a clean empty result (and caches it) when no source has data", async () => {
    const { fn } = fakeFetch(() => ({ status: 404 }));
    const { cache, sets } = fakeCache();
    const result = await lookupDefinitions("qzxvbn", { fetchFn: fn, cache });
    assert.equal(result.exact, false);
    assert.deepEqual(result.suggestions, []);
    assert.deepEqual(result.related, []);
    // Sources responded (just empty) → the empty result is cached.
    assert.equal(sets.length, 1);
  });

  it("does not cache when every source is down", async () => {
    const { fn } = fakeFetch(() => "network-error");
    const { cache, sets } = fakeCache();
    const result = await lookupDefinitions("hello", { fetchFn: fn, cache });
    assert.deepEqual(result.suggestions, []);
    assert.equal(sets.length, 0);
  });

  it("does not cache an empty result when one source failed (partial outage)", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("dictionaryapi.dev") ? { status: 404 } : "network-error"
    );
    const { cache, sets } = fakeCache();
    const result = await lookupDefinitions("hello", { fetchFn: fn, cache });
    assert.deepEqual(result.suggestions, []);
    // The empty result could be a lie (Datamuse was down) → retry next time.
    assert.equal(sets.length, 0);
  });

  it("returns the versioned cached result without calling any external API (cache hit)", async () => {
    const cachedResult = { term: "hello", exact: true, suggestions: [def("Cached greeting definition.")], related: [] };
    const { cache } = fakeCache({ "definition:hello": versioned(cachedResult) });
    const { fn, calls } = fakeFetch(() => ({ status: 200, json: dictApiDevHello }));

    const result = await lookupDefinitions("  HELLO  ", { fetchFn: fn, cache });
    assert.equal(calls.length, 0);
    assert.equal(result.suggestions[0].definition, "Cached greeting definition.");
  });

  it("ignores cache entries written by older lookup logic and overwrites them", async () => {
    // Old (v1) format: the bare result, no version wrapper — e.g. the old bad
    // "winning formula" record that only had Datamuse related words.
    const oldBad = JSON.stringify({ term: "winning formula", exact: false, suggestions: [], related: ["manning formula"] });
    const { cache, sets } = fakeCache({ "definition:winning formula": oldBad });
    const { fn } = fakeFetch(() => ({ status: 404 }));

    const result = await lookupDefinitions("winning formula", { fetchFn: fn, cache });
    // Fresh lookup ran (local dictionary) instead of returning the stale record.
    assert.equal(result.exact, true);
    assert.equal(result.suggestions[0].source, LOCAL_SOURCE);
    // And the stale record was overwritten with a versioned one.
    assert.equal(sets.length, 1);
    assert.equal(JSON.parse(sets[0].data).v, DICTIONARY_CACHE_VERSION);
  });
});

// ---------- Example lookup orchestration ----------

describe("lookupExamples", () => {
  it("uses dictionary API examples that contain the target word", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("dictionaryapi.dev") ? { status: 200, json: dictApiDevHello } : { status: 200, json: tatoebaHello }
    );
    const result = await lookupExamples("hello", { fetchFn: fn });
    assert.equal(result.exact, true);
    assert.ok(result.suggestions.some((s) => s.source === "dictionaryapi.dev"));
    assert.ok(result.suggestions.every((s) => /hello/i.test(s.sentence)));
  });

  it("falls back to Tatoeba when dictionary examples are missing", async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.includes("tatoeba.org")) return { status: 200, json: tatoebaHello };
      return { status: 404 };
    });
    const result = await lookupExamples("hello", { fetchFn: fn });
    assert.ok(result.suggestions.length >= 2);
    assert.ok(result.suggestions.every((s) => s.source === "Tatoeba"));
    // Only English sentences (the German one is filtered out).
    assert.ok(!result.suggestions.some((s) => s.sentence.startsWith("Hallo")));
    assert.ok(calls.some((u) => u.includes("tatoeba.org")));
  });

  it("'winning formula' returns the built-in example containing the full phrase", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("tatoeba.org") ? { status: 200, json: { results: [] } } : { status: 404 }
    );
    const result = await lookupExamples("winning formula", { fetchFn: fn });
    assert.ok(result.suggestions.length >= 1);
    assert.ok(result.suggestions[0].sentence.includes("winning formula"));
    assert.equal(result.suggestions[0].source, LOCAL_SOURCE);
  });

  it("'winning formula' never shows examples that are only about 'win'", async () => {
    const { fn, calls } = fakeFetch((url) =>
      url.includes("tatoeba.org") ? { status: 200, json: tatoebaWinNoise } : { status: 404 }
    );
    const result = await lookupExamples("winning formula", { fetchFn: fn });
    assert.ok(result.suggestions.length >= 1);
    // Every suggestion must contain the exact full phrase.
    assert.ok(result.suggestions.every((s) => /winning formula/i.test(s.sentence)));
    assert.ok(!result.suggestions.some((s) => s.sentence.includes("let her win")));
    // Exactly one Tatoeba call: the quoted exact-phrase search, no main-word fallback.
    const tatoebaCalls = calls.filter((u) => u.includes("tatoeba.org"));
    assert.equal(tatoebaCalls.length, 1);
    assert.ok(decodeURIComponent(tatoebaCalls[0]).includes('"winning formula"'));
  });

  it("'get rid of' returns a useful example longer than 5 words", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("tatoeba.org") ? { status: 200, json: { results: [] } } : { status: 404 }
    );
    const result = await lookupExamples("get rid of", { fetchFn: fn });
    assert.ok(result.suggestions.length >= 1);
    const best = result.suggestions[0].sentence;
    assert.ok(best.includes("get rid of"));
    assert.ok(best.split(/\s+/).length > 5);
    assert.notEqual(best, "Get rid of it.");
  });

  it("'restrict' returns useful curated examples when API examples are weak", async () => {
    // API only offers a 4-word fragment; Tatoeba has nothing.
    const weakDict = [
      {
        word: "restrict",
        meanings: [
          { partOfSpeech: "verb", definitions: [{ definition: "To limit.", example: "There are no restrictions." }] },
        ],
      },
    ];
    const { fn } = fakeFetch((url) => {
      if (url.includes("dictionaryapi.dev")) return { status: 200, json: weakDict };
      if (url.includes("tatoeba.org")) return { status: 200, json: { results: [] } };
      return { status: 404 };
    });
    const result = await lookupExamples("restrict", { fetchFn: fn });
    assert.equal(result.suggestions.length, 3);
    assert.ok(result.suggestions.every((s) => /restrict/i.test(s.sentence)));
    assert.ok(result.suggestions.every((s) => s.source === LOCAL_SOURCE));
    assert.ok(!result.suggestions.some((s) => s.sentence === "There are no restrictions."));
  });

  it("does not use curated word examples when the APIs already provide good ones", async () => {
    const goodTatoeba = {
      results: [
        { id: 1, text: "The new law restricts smoking in all public places.", lang: "eng" },
        { id: 2, text: "You should restrict your spending until the end of the month.", lang: "eng" },
        { id: 3, text: "The airline restricts the size of carry-on luggage strictly.", lang: "eng" },
      ],
    };
    const { fn } = fakeFetch((url) =>
      url.includes("tatoeba.org") ? { status: 200, json: goodTatoeba } : { status: 404 }
    );
    const result = await lookupExamples("restrict", { fetchFn: fn });
    assert.equal(result.suggestions.length, 3);
    assert.ok(result.suggestions.every((s) => s.source === "Tatoeba"));
  });

  it("returns a clean empty result when nothing exact is found", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("tatoeba.org") ? { status: 200, json: { results: [] } } : { status: 404 }
    );
    const result = await lookupExamples("qzxvbn", { fetchFn: fn });
    assert.deepEqual(result.suggestions, []);
  });

  it("does not cache an empty result when Tatoeba failed but the dictionary responded", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("tatoeba.org") ? "network-error" : { status: 404 }
    );
    const { cache, sets } = fakeCache();
    const result = await lookupExamples("qzxvbn", { fetchFn: fn, cache });
    assert.deepEqual(result.suggestions, []);
    assert.equal(sets.length, 0);
  });

  it("returns the versioned cached result without calling any external API (cache hit)", async () => {
    const cachedResult = { term: "hello", exact: true, searchedWord: "hello", suggestions: [ex("A cached hello example sentence here.")] };
    const { cache } = fakeCache({ "example:hello": versioned(cachedResult) });
    const { fn, calls } = fakeFetch(() => ({ status: 200, json: tatoebaHello }));

    const result = await lookupExamples("hello", { fetchFn: fn, cache });
    assert.equal(calls.length, 0);
    assert.equal(result.suggestions[0].sentence, "A cached hello example sentence here.");
  });

  it("ignores old-format cached examples (e.g. the bad 'win' fallback results)", async () => {
    // Old (v1) record produced by the removed main-word fallback.
    const oldBad = JSON.stringify({
      term: "winning formula",
      exact: false,
      searchedWord: "winning",
      suggestions: [{ id: "ex-0", sentence: "We let her win.", source: "Tatoeba" }],
    });
    const { cache, sets } = fakeCache({ "example:winning formula": oldBad });
    const { fn } = fakeFetch((url) =>
      url.includes("tatoeba.org") ? { status: 200, json: { results: [] } } : { status: 404 }
    );

    const result = await lookupExamples("winning formula", { fetchFn: fn, cache });
    assert.ok(!result.suggestions.some((s) => s.sentence === "We let her win."));
    assert.ok(result.suggestions[0].sentence.includes("winning formula"));
    // Overwritten with a versioned record.
    assert.equal(sets.length, 1);
    assert.equal(JSON.parse(sets[0].data).v, DICTIONARY_CACHE_VERSION);
  });

  it("stores example lookups separately from definition lookups", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("dictionaryapi.dev") ? { status: 200, json: dictApiDevHello } : { status: 200, json: tatoebaHello }
    );
    const { cache, sets } = fakeCache();
    await lookupDefinitions("hello", { fetchFn: fn, cache });
    await lookupExamples("hello", { fetchFn: fn, cache });
    assert.deepEqual(sets.map((s) => s.type), ["definition", "example"]);
  });
});
