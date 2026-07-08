// Tests for the Smart Definition & Example Assistant (lib/dictionary.ts).
// Run with: npm test  (node --import tsx --test)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeDefinitions,
  filterExamples,
  lookupDefinitions,
  lookupExamples,
  mainWordOf,
  normalizeTerm,
  parseDatamuse,
  parseDictionaryApiDev,
  parseFreeDictionaryApi,
  parseTatoeba,
  type DictionaryCacheStore,
  type DictionarySuggestion,
  type ExampleSuggestion,
} from "../lib/dictionary";

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
    { id: 4, text: "Hello there.", lang: "eng" }, // too short (< 4 words)
  ],
};

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

describe("mainWordOf", () => {
  it("picks the longest non-stopword of a phrase", () => {
    assert.equal(mainWordOf("break the ice"), "break");
    assert.equal(mainWordOf("a piece of cake"), "piece");
  });

  it("falls back to any word when everything is a stopword", () => {
    assert.equal(mainWordOf("in on at"), "in");
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

// ---------- Filtering / duplicates ----------

function def(definition: string): DictionarySuggestion {
  return { id: "x", definition, partOfSpeech: null, phonetic: null, audioUrl: null, example: null, synonyms: [], antonyms: [], source: "test" };
}

function ex(sentence: string): ExampleSuggestion {
  return { id: "x", sentence, source: "test" };
}

describe("dedupeDefinitions", () => {
  it("removes duplicate definitions ignoring case and punctuation", () => {
    const out = dedupeDefinitions([def("A greeting."), def("a greeting"), def("Something else entirely.")]);
    assert.equal(out.length, 2);
  });

  it("caps the number of definitions at 5", () => {
    const many = Array.from({ length: 10 }, (_, i) => def(`Definition number ${i} of the word.`));
    assert.equal(dedupeDefinitions(many).length, 5);
  });
});

describe("filterExamples", () => {
  it("removes duplicates and ignores examples shorter than 4 words", () => {
    const out = filterExamples([
      ex("He said hello to everyone."),
      ex("he said hello to everyone"),
      ex("Hello there."),
      ex("She waved hello at the neighbors this morning."),
    ]);
    assert.equal(out.length, 2);
    assert.ok(!out.some((s) => s.sentence === "Hello there."));
  });

  it("drops very long sentences and prefers short ones, capped at 5", () => {
    const long = ex("word ".repeat(40).trim() + " end of an extremely long winded sentence");
    const sentences = [
      long,
      ex("This is the longest of the short valid example sentences here."),
      ex("A short clear example sentence."),
      ex("Another usable short example sentence right here."),
      ex("Yet another perfectly usable example sentence for testing."),
      ex("One more valid example sentence to exceed the cap limit."),
      ex("And a final example sentence to push past five results."),
    ];
    const out = filterExamples(sentences);
    assert.equal(out.length, 5);
    assert.ok(!out.some((s) => s.sentence === long.sentence));
    assert.equal(out[0].sentence, "A short clear example sentence.");
  });
});

// ---------- Definition lookup orchestration ----------

describe("lookupDefinitions", () => {
  it("uses dictionaryapi.dev as the primary source and caches the result", async () => {
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
    // Cache miss stored the normalized result.
    assert.equal(sets.length, 1);
    assert.equal(sets[0].normalizedTerm, "hello");
    assert.equal(sets[0].type, "definition");
    assert.equal(sets[0].source, "dictionaryapi.dev");
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

  it("uses Datamuse related suggestions for phrases with no exact definition", async () => {
    const { fn } = fakeFetch((url) => {
      if (url.includes("datamuse.com") && url.includes("ml="))
        return { status: 200, json: [{ word: "recipe for success" }, { word: "formula" }] };
      if (url.includes("datamuse.com")) return { status: 200, json: [] };
      return { status: 404 };
    });
    const result = await lookupDefinitions("winning formula", { fetchFn: fn });
    assert.equal(result.exact, false);
    assert.equal(result.suggestions.length, 0);
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

  it("returns the cached result without calling any external API (cache hit)", async () => {
    const cachedResult = { term: "hello", exact: true, suggestions: [def("Cached greeting definition.")], related: [] };
    const { cache } = fakeCache({ "definition:hello": JSON.stringify(cachedResult) });
    const { fn, calls } = fakeFetch(() => ({ status: 200, json: dictApiDevHello }));

    const result = await lookupDefinitions("  HELLO  ", { fetchFn: fn, cache });
    assert.equal(calls.length, 0);
    assert.equal(result.suggestions[0].definition, "Cached greeting definition.");
  });
});

// ---------- Example lookup orchestration ----------

describe("lookupExamples", () => {
  it("uses dictionary API examples first", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("dictionaryapi.dev") ? { status: 200, json: dictApiDevHello } : { status: 200, json: tatoebaHello }
    );
    const result = await lookupExamples("hello", { fetchFn: fn });
    assert.equal(result.exact, true);
    assert.ok(result.suggestions.some((s) => s.source === "dictionaryapi.dev"));
  });

  it("falls back to Tatoeba when dictionary examples are missing", async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.includes("tatoeba.org")) return { status: 200, json: tatoebaHello };
      return { status: 404 };
    });
    const result = await lookupExamples("hello", { fetchFn: fn });
    assert.equal(result.exact, true);
    assert.ok(result.suggestions.length >= 2);
    assert.ok(result.suggestions.every((s) => s.source === "Tatoeba"));
    // Only English sentences (the German one is filtered out).
    assert.ok(!result.suggestions.some((s) => s.sentence.startsWith("Hallo")));
    assert.ok(calls.some((u) => u.includes("tatoeba.org")));
  });

  it("searches the exact phrase first, then falls back to the main word", async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.includes("tatoeba.org") && decodeURIComponent(url).includes('"winning formula"'))
        return { status: 200, json: { results: [] } };
      if (url.includes("tatoeba.org"))
        return { status: 200, json: { results: [{ text: "The team kept winning every single match.", lang: "eng" }] } };
      return { status: 404 };
    });
    const result = await lookupExamples("winning formula", { fetchFn: fn });
    assert.equal(result.exact, false);
    assert.equal(result.searchedWord, "winning");
    assert.equal(result.suggestions.length, 1);
    // The quoted exact-phrase search happened before the fallback.
    const tatoebaCalls = calls.filter((u) => u.includes("tatoeba.org"));
    assert.equal(tatoebaCalls.length, 2);
    assert.ok(decodeURIComponent(tatoebaCalls[0]).includes('"winning formula"'));
  });

  it("returns a clean empty result when nothing is found", async () => {
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
    const result = await lookupExamples("hello", { fetchFn: fn, cache });
    assert.deepEqual(result.suggestions, []);
    assert.equal(sets.length, 0);
  });

  it("returns the cached result without calling any external API (cache hit)", async () => {
    const cachedResult = { term: "hello", exact: true, searchedWord: "hello", suggestions: [ex("A cached example sentence here.")] };
    const { cache } = fakeCache({ "example:hello": JSON.stringify(cachedResult) });
    const { fn, calls } = fakeFetch(() => ({ status: 200, json: tatoebaHello }));

    const result = await lookupExamples("hello", { fetchFn: fn, cache });
    assert.equal(calls.length, 0);
    assert.equal(result.suggestions[0].sentence, "A cached example sentence here.");
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
