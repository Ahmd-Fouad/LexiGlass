// Smart Definition & Example Assistant — server-side dictionary module.
//
// All external API calls are centralized here and must only run server-side.
// Sources (all free, no API keys):
//   - built-in phrase dictionary → curated phrase definitions/examples (lib/local-phrase-dictionary.ts)
//   - dictionaryapi.dev          → primary definitions for single words
//   - freedictionaryapi.com      → fallback definitions
//   - Datamuse                   → related words ONLY, never shown as definitions
//   - Tatoeba                    → example sentences (exact-match search only)
//
// Definition source order:
//   phrase:      local phrase dictionary → dictionaryapi.dev → FreeDictionaryAPI → Datamuse (related)
//   single word: dictionaryapi.dev → FreeDictionaryAPI → local phrase dictionary → Datamuse (related)
//
// Example rules: every suggestion must contain the target — the full exact
// phrase for phrases, or a valid form of the word for single words. There is
// deliberately no "main word of the phrase" fallback.
//
// The orchestrators (`lookupDefinitions`, `lookupExamples`) accept an optional
// cache store and fetch function so they can be unit-tested without a network
// or database. API routes pass the Prisma-backed cache from lib/dictionary-cache.

import { findLocalPhrase, findLocalWordExamples, type LocalPhraseEntry } from "./local-phrase-dictionary";

// ---------- Normalized response types ----------

export interface DictionarySuggestion {
  id: string;
  definition: string;
  partOfSpeech: string | null;
  phonetic: string | null;
  audioUrl: string | null;
  example: string | null;
  synonyms: string[];
  antonyms: string[];
  source: string;
}

export interface ExampleSuggestion {
  id: string;
  sentence: string;
  source: string;
}

export interface DefinitionLookupResult {
  term: string; // original display text
  exact: boolean; // true when suggestions are real definitions of the term
  suggestions: DictionarySuggestion[];
  related: string[]; // Datamuse related words — never definitions
}

export interface ExampleLookupResult {
  term: string;
  exact: boolean; // always true now: every suggestion contains the target
  searchedWord: string;
  suggestions: ExampleSuggestion[];
}

export type CacheType = "definition" | "example";

/** Minimal cache contract; the Prisma implementation lives in lib/dictionary-cache.ts. */
export interface DictionaryCacheStore {
  get(normalizedTerm: string, type: CacheType): Promise<string | null>;
  set(entry: {
    term: string;
    normalizedTerm: string;
    type: CacheType;
    source: string;
    data: string;
  }): Promise<void>;
}

export interface LookupOptions {
  cache?: DictionaryCacheStore;
  fetchFn?: typeof fetch;
}

export const MAX_TERM_LENGTH = 100;
export const LOCAL_SOURCE = "built-in dictionary";

/**
 * Bumped whenever lookup/ranking logic changes. Cached payloads carry this
 * version; entries written by older logic are ignored (treated as a cache
 * miss) and overwritten, so stale low-quality results can't linger.
 */
export const DICTIONARY_CACHE_VERSION = 2;

const MAX_SUGGESTIONS = 5;
// An example is "high quality" when it uses the exact word (or simple plural)
// and has a decent length — see scoreExampleSentence. Curated local examples
// are added when the APIs can't provide at least 3 of these.
const HIGH_QUALITY_EXAMPLE_SCORE = 60;
const MIN_EXAMPLE_WORDS = 5;
const MAX_EXAMPLE_WORDS = 26;
const IDEAL_EXAMPLE_WORDS_MIN = 8;
const IDEAL_EXAMPLE_WORDS_MAX = 22;
const MAX_EXAMPLE_CHARS = 180;
const FETCH_TIMEOUT_MS = 6000;

// ---------- Term normalization ----------

/**
 * Normalizes a lookup term: `display` keeps the user's text (trimmed, spaces
 * collapsed); `key` is the lookup/cache key (lowercased, punctuation stripped,
 * apostrophes and hyphens preserved). Works for words and multi-word phrases.
 */
export function normalizeTerm(raw: string): { display: string; key: string } {
  const display = raw.trim().replace(/\s+/g, " ");
  const key = display
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'") // curly apostrophes → straight
    .replace(/[^\p{L}\p{N}'\- ]+/gu, " ") // drop punctuation, keep letters/digits/'/-
    .replace(/\s+/g, " ")
    .trim();
  return { display, key };
}

export function isPhrase(key: string): boolean {
  return key.includes(" ");
}

// ---------- Small helpers ----------

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function cleanStr(v: unknown, maxLen = 1000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t.length === 0 ? null : t.slice(0, maxLen);
}

function cleanStrings(v: unknown, cap = 8): string[] {
  const out: string[] = [];
  for (const item of asArray(v)) {
    const s = cleanStr(item, 80);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Case/punctuation-insensitive key used for duplicate detection. */
function dedupeKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
}

// ---------- Target-term matching ----------

/**
 * True when `token` is `word` or a common inflection/derivation of it, e.g.
 * restrict → restricts / restricted / restricting / restriction(s),
 * win → wins / winning / winner, make → making, carry → carried.
 */
function wordFormsMatch(token: string, word: string): boolean {
  if (token === word) return true;
  const stems = new Set([word]);
  if (word.endsWith("e")) stems.add(word.slice(0, -1)); // make → mak(ing)
  if (word.endsWith("y")) stems.add(word.slice(0, -1) + "i"); // carry → carri(ed)
  if (/[bcdfghjklmnpqrstvz]$/.test(word)) stems.add(word + word.slice(-1)); // run → runn(ing)
  const suffixes = ["s", "es", "ed", "d", "ing", "ion", "ions", "er", "ers", "ly"];
  for (const stem of stems) {
    if (token.startsWith(stem) && suffixes.includes(token.slice(stem.length))) return true;
  }
  return false;
}

/**
 * Does the sentence contain the target term? Phrases require the exact full
 * phrase (word-boundary, case/punctuation-insensitive); single words accept
 * the word itself or a valid form of it.
 */
export function containsTerm(sentence: string, termKey: string): boolean {
  const norm = normalizeTerm(sentence).key;
  if (isPhrase(termKey)) return ` ${norm} `.includes(` ${termKey} `);
  return norm.split(" ").some((t) => t.length > 0 && wordFormsMatch(t, termKey));
}

// ---------- Response parsers (pure, exported for tests) ----------

/** Parses a dictionaryapi.dev `/api/v2/entries/en/<word>` response. */
export function parseDictionaryApiDev(json: unknown): DictionarySuggestion[] {
  const out: DictionarySuggestion[] = [];
  for (const entry of asArray(json)) {
    const e = asRecord(entry);
    let phonetic = cleanStr(e.phonetic, 80);
    let audioUrl: string | null = null;
    for (const p of asArray(e.phonetics)) {
      const ph = asRecord(p);
      const audio = cleanStr(ph.audio, 500);
      if (!audioUrl && audio && audio.startsWith("http")) audioUrl = audio;
      if (!phonetic) phonetic = cleanStr(ph.text, 80);
    }
    for (const meaning of asArray(e.meanings)) {
      const m = asRecord(meaning);
      const partOfSpeech = cleanStr(m.partOfSpeech, 40);
      const meaningSynonyms = cleanStrings(m.synonyms);
      const meaningAntonyms = cleanStrings(m.antonyms);
      for (const def of asArray(m.definitions)) {
        const d = asRecord(def);
        const definition = cleanStr(d.definition);
        if (!definition) continue;
        out.push({
          id: `dictapi-${out.length}`,
          definition,
          partOfSpeech,
          phonetic,
          audioUrl,
          example: cleanStr(d.example, 300),
          synonyms: [...new Set([...cleanStrings(d.synonyms), ...meaningSynonyms])].slice(0, 6),
          antonyms: [...new Set([...cleanStrings(d.antonyms), ...meaningAntonyms])].slice(0, 6),
          source: "dictionaryapi.dev",
        });
      }
    }
  }
  return out;
}

/** Parses a freedictionaryapi.com `/api/v1/entries/en/<word>` response. */
export function parseFreeDictionaryApi(json: unknown): DictionarySuggestion[] {
  const out: DictionarySuggestion[] = [];
  const root = asRecord(json);
  for (const entry of asArray(root.entries)) {
    const e = asRecord(entry);
    const partOfSpeech = cleanStr(e.partOfSpeech, 40);
    let phonetic: string | null = null;
    for (const p of asArray(e.pronunciations)) {
      const pr = asRecord(p);
      const text = cleanStr(pr.text, 80);
      if (text) {
        phonetic = text;
        break;
      }
    }
    const entrySynonyms = cleanStrings(e.synonyms);
    const entryAntonyms = cleanStrings(e.antonyms);
    for (const def of asArray(e.definitions)) {
      const d = asRecord(def);
      const definition = cleanStr(d.definition);
      if (!definition) continue;
      const firstExample = cleanStr(asArray(d.examples)[0], 300);
      out.push({
        id: `freedict-${out.length}`,
        definition,
        partOfSpeech,
        phonetic,
        audioUrl: null,
        example: firstExample,
        synonyms: [...new Set([...cleanStrings(d.synonyms), ...entrySynonyms])].slice(0, 6),
        antonyms: [...new Set([...cleanStrings(d.antonyms), ...entryAntonyms])].slice(0, 6),
        source: "freedictionaryapi.com",
      });
    }
  }
  return out;
}

/** Parses a Datamuse `/words?...` response into a list of related words. */
export function parseDatamuse(json: unknown, cap = 8): string[] {
  const out: string[] = [];
  for (const item of asArray(json)) {
    const word = cleanStr(asRecord(item).word, 60);
    if (word && !out.includes(word)) out.push(word);
    if (out.length >= cap) break;
  }
  return out;
}

/** Parses a Tatoeba `api_v0/search` response into English example suggestions. */
export function parseTatoeba(json: unknown): ExampleSuggestion[] {
  const out: ExampleSuggestion[] = [];
  for (const item of asArray(asRecord(json).results)) {
    const r = asRecord(item);
    const lang = cleanStr(r.lang, 10);
    if (lang && lang !== "eng") continue; // only English sentences
    const text = cleanStr(r.text, 400);
    if (!text) continue;
    out.push({ id: `tatoeba-${out.length}`, sentence: text, source: "Tatoeba" });
  }
  return out;
}

// ---------- Quality scoring ----------

/**
 * Scores an example sentence for a given term. Higher is better. Prefers
 * sentences that contain the exact term (required for phrases), 8–22 words
 * long, and shaped like a real sentence rather than a fragment.
 */
export function scoreExampleSentence(sentence: string, term: string): number {
  const clean = sentence.trim().replace(/\s+/g, " ");
  const { key } = normalizeTerm(term);
  const tokens = normalizeTerm(clean).key.split(" ").filter(Boolean);
  let score = 0;

  // Target containment — the dominant factor.
  if (isPhrase(key)) {
    score += containsTerm(clean, key) ? 60 : -100;
  } else if (tokens.includes(key)) {
    score += 60; // exact word, e.g. "restrict"
  } else if (tokens.includes(`${key}s`) || tokens.includes(`${key}es`)) {
    score += 50; // simple plural / 3rd person, e.g. "restricts"
  } else if (tokens.some((t) => wordFormsMatch(t, key))) {
    score += 30; // other valid form, e.g. "restricted", "restriction"
  } else {
    score -= 100;
  }

  // Length: 8–22 words is the sweet spot.
  const words = wordCount(clean);
  if (words >= IDEAL_EXAMPLE_WORDS_MIN && words <= IDEAL_EXAMPLE_WORDS_MAX) score += 20;
  else if (words >= MIN_EXAMPLE_WORDS && words < IDEAL_EXAMPLE_WORDS_MIN) score += 8;
  else if (words > IDEAL_EXAMPLE_WORDS_MAX && words <= MAX_EXAMPLE_WORDS) score += 4;
  else score -= 50; // very short or very long

  // Fragment-like / unnatural sentences.
  if (!/[.!?…”"')]$/.test(clean)) score -= 10;
  if (!/^[\p{Lu}\p{N}“”"']/u.test(clean)) score -= 5;
  if (clean.length > 3 && clean === clean.toUpperCase()) score -= 15;
  if (/[{}<>|\\_@#*]/.test(clean)) score -= 20;

  return score;
}

/**
 * Scores a definition for a given term. Higher is better. Prefers short,
 * clear definitions; penalizes one-word, overly technical, or circular ones.
 */
export function scoreDefinitionSuggestion(definition: string, term: string): number {
  const clean = definition.trim().replace(/\s+/g, " ");
  const words = wordCount(clean);
  let score = 0;

  if (words <= 1) score -= 30; // one-word definitions are rarely useful
  else if (words >= 3 && words <= 24) score += 20; // short and clear
  else if (words > 40) score -= 10; // rambling

  // Technical / niche-register markers — usable, but ranked below plain ones.
  if (/\b(archaic|obsolete|dated|dialectal|slang|vulgar)\b/i.test(clean)) score -= 15;
  if (/\b(botany|zoology|chemistry|physics|mathematics|nautical|heraldry|taxonomy|genus)\b/i.test(clean)) score -= 10;
  if (/^\(/.test(clean)) score -= 10; // "(specifically) …" label-prefixed niche senses
  if ((clean.match(/\(/g) ?? []).length >= 2) score -= 10; // parenthesis-heavy = technical
  if ((clean.match(/;/g) ?? []).length >= 2) score -= 3; // mild: "to limit; to confine" is fine

  if (dedupeKey(clean) === normalizeTerm(term).key) score -= 40; // circular

  return score;
}

// ---------- Ranking / filtering ----------

/** Dedupes definitions, ranks them by quality score, keeps the best few. */
export function rankDefinitions(
  suggestions: DictionarySuggestion[],
  term: string,
  cap = MAX_SUGGESTIONS
): DictionarySuggestion[] {
  const seen = new Set<string>();
  const unique: DictionarySuggestion[] = [];
  for (const s of suggestions) {
    const k = dedupeKey(s.definition);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    unique.push(s);
  }
  return unique
    .map((s) => ({ s, score: scoreDefinitionSuggestion(s.definition, term) }))
    .sort((a, b) => b.score - a.score) // stable: ties keep source order
    .slice(0, cap)
    .map(({ s }, i) => ({ ...s, id: `def-${i}` }));
}

/**
 * Filters and ranks example sentences for a term: drops sentences shorter
 * than 5 words or overly long ones, requires the target term (exact full
 * phrase for phrases, a valid word form for single words), removes
 * duplicates, and keeps the best few by score.
 */
export function rankExamples(
  examples: ExampleSuggestion[],
  term: string,
  cap = MAX_SUGGESTIONS
): ExampleSuggestion[] {
  const { key } = normalizeTerm(term);
  const seen = new Set<string>();
  const scored: { ex: ExampleSuggestion; score: number }[] = [];
  for (const ex of examples) {
    const sentence = ex.sentence.trim().replace(/\s+/g, " ");
    if (!sentence) continue;
    const words = wordCount(sentence);
    if (words < MIN_EXAMPLE_WORDS) continue;
    if (words > MAX_EXAMPLE_WORDS || sentence.length > MAX_EXAMPLE_CHARS) continue;
    if (key && !containsTerm(sentence, key)) continue; // must contain the target
    const k = dedupeKey(sentence);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    scored.push({ ex: { ...ex, sentence }, score: scoreExampleSentence(sentence, term) });
  }
  scored.sort((a, b) => b.score - a.score); // stable: ties keep source order
  return scored.slice(0, cap).map(({ ex }, i) => ({ ...ex, id: `ex-${i}` }));
}

// ---------- Fetch helper ----------

type FetchOutcome =
  | { kind: "ok"; json: unknown }
  | { kind: "empty" } // API responded but has no data for the term (e.g. 404)
  | { kind: "failed" }; // network error, timeout, bad JSON, 5xx …

async function fetchJson(fetchFn: typeof fetch, url: string): Promise<FetchOutcome> {
  try {
    const res = await fetchFn(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) return { kind: "empty" };
    if (!res.ok) return { kind: "failed" };
    return { kind: "ok", json: await res.json() };
  } catch {
    return { kind: "failed" };
  }
}

// ---------- Versioned cache helpers (failures must never break a lookup) ----------

interface VersionedPayload<T> {
  v: number;
  result: T;
}

async function cacheGet<T>(
  cache: DictionaryCacheStore | undefined,
  key: string,
  type: CacheType
): Promise<T | null> {
  if (!cache) return null;
  try {
    const raw = await cache.get(key, type);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VersionedPayload<T>>;
    // Entries written by older lookup logic (no/old version) are ignored and
    // will be overwritten by the fresh result.
    if (parsed?.v !== DICTIONARY_CACHE_VERSION || parsed.result === undefined) return null;
    return parsed.result;
  } catch {
    return null;
  }
}

async function cacheSet(
  cache: DictionaryCacheStore | undefined,
  entry: { term: string; normalizedTerm: string; type: CacheType; source: string; data: unknown }
): Promise<void> {
  if (!cache) return;
  try {
    const payload: VersionedPayload<unknown> = { v: DICTIONARY_CACHE_VERSION, result: entry.data };
    await cache.set({ ...entry, data: JSON.stringify(payload) });
  } catch {
    // Caching is best-effort; the lookup result is still returned.
  }
}

// ---------- Definition lookup orchestrator ----------

function localPhraseSuggestion(entry: LocalPhraseEntry): DictionarySuggestion {
  return {
    id: "local-0",
    definition: entry.definition,
    partOfSpeech: entry.type,
    phonetic: null,
    audioUrl: null,
    example: entry.example,
    synonyms: entry.synonyms ?? [],
    antonyms: [],
    source: LOCAL_SOURCE,
  };
}

/**
 * Definition lookup. Phrases: built-in phrase dictionary → dictionaryapi.dev →
 * FreeDictionaryAPI. Single words: dictionaryapi.dev → FreeDictionaryAPI →
 * built-in dictionary. Datamuse only ever fills `related` — never definitions.
 */
export async function lookupDefinitions(
  rawTerm: string,
  opts: LookupOptions = {}
): Promise<DefinitionLookupResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const { display, key } = normalizeTerm(rawTerm);
  if (!key) return { term: display, exact: false, suggestions: [], related: [] };

  const cached = await cacheGet<DefinitionLookupResult>(opts.cache, key, "definition");
  if (cached) return cached;

  let suggestions: DictionarySuggestion[] = [];
  let related: string[] = [];
  let source = "none";
  let anySourceResponded = false;
  let anySourceFailed = false;

  const tryLocal = (): boolean => {
    const entry = findLocalPhrase(key);
    if (!entry) return false;
    suggestions = [localPhraseSuggestion(entry)];
    source = LOCAL_SOURCE;
    anySourceResponded = true; // the built-in dictionary always responds
    return true;
  };

  const tryApi = async (
    url: string,
    parse: (json: unknown) => DictionarySuggestion[],
    name: string
  ): Promise<boolean> => {
    const res = await fetchJson(fetchFn, url);
    if (res.kind === "failed") anySourceFailed = true;
    else anySourceResponded = true;
    if (res.kind !== "ok") return false;
    const parsed = parse(res.json);
    if (parsed.length === 0) return false;
    suggestions = parsed;
    source = name;
    return true;
  };

  const tryDictApiDev = () =>
    tryApi(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`,
      parseDictionaryApiDev,
      "dictionaryapi.dev"
    );
  const tryFreeDict = () =>
    tryApi(
      `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(key)}`,
      parseFreeDictionaryApi,
      "freedictionaryapi.com"
    );

  // Phrases trust the curated local dictionary first; single words trust the
  // real dictionaries first and use local entries as a late fallback.
  let found: boolean;
  if (isPhrase(key)) {
    found = tryLocal() || (await tryDictApiDev()) || (await tryFreeDict());
  } else {
    found = (await tryDictApiDev()) || (await tryFreeDict()) || tryLocal();
  }

  // No definition anywhere → Datamuse related words + spelling suggestions.
  // These are shown under a "related suggestions" heading, never as definitions.
  if (!found) {
    const [meansLike, spelledLike] = await Promise.all([
      fetchJson(fetchFn, `https://api.datamuse.com/words?ml=${encodeURIComponent(key)}&max=8`),
      fetchJson(fetchFn, `https://api.datamuse.com/words?sp=${encodeURIComponent(key)}&max=5`),
    ]);
    if (meansLike.kind !== "failed" || spelledLike.kind !== "failed") anySourceResponded = true;
    if (meansLike.kind === "failed" || spelledLike.kind === "failed") anySourceFailed = true;
    const relatedWords = meansLike.kind === "ok" ? parseDatamuse(meansLike.json) : [];
    const spellings =
      spelledLike.kind === "ok"
        ? parseDatamuse(spelledLike.json).filter((w) => w.toLowerCase() !== key)
        : [];
    related = [...new Set([...spellings, ...relatedWords])].slice(0, 8);
    if (related.length > 0) source = "datamuse";
  }

  const result: DefinitionLookupResult = {
    term: display,
    exact: suggestions.length > 0,
    suggestions: rankDefinitions(suggestions, key),
    related,
  };

  // Cache real data always; cache an empty result only when every consulted
  // source actually responded (a down/timed-out source should be retried).
  const hasData = result.suggestions.length > 0 || result.related.length > 0;
  if (anySourceResponded && (hasData || !anySourceFailed)) {
    await cacheSet(opts.cache, { term: display, normalizedTerm: key, type: "definition", source, data: result });
  }
  return result;
}

// ---------- Example lookup orchestrator ----------

async function tatoebaSearch(fetchFn: typeof fetch, query: string): Promise<FetchOutcome> {
  // word_count filters keep Tatoeba's relevance sort from returning only
  // 2-3 word sentences that our quality filter would drop anyway.
  const url =
    `https://tatoeba.org/en/api_v0/search?from=eng&to=none&sort=relevance` +
    `&word_count_min=${MIN_EXAMPLE_WORDS}&word_count_max=${MAX_EXAMPLE_WORDS - 2}` +
    `&query=${encodeURIComponent(query)}`;
  return fetchJson(fetchFn, url);
}

/**
 * Example lookup: built-in phrase dictionary example → dictionary API
 * examples → Tatoeba exact search → curated word examples when API results
 * are missing or low quality. Every returned sentence contains the target
 * (full phrase for phrases, a valid word form for single words) — there is
 * no loose "main word" fallback.
 */
export async function lookupExamples(
  rawTerm: string,
  opts: LookupOptions = {}
): Promise<ExampleLookupResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const { display, key } = normalizeTerm(rawTerm);
  if (!key) return { term: display, exact: true, searchedWord: "", suggestions: [] };

  const cached = await cacheGet<ExampleLookupResult>(opts.cache, key, "example");
  if (cached) return cached;

  const collected: ExampleSuggestion[] = [];
  let anySourceResponded = false;
  let anySourceFailed = false;
  const usableCount = () => rankExamples(collected, key).length;

  // 1. Curated example from the built-in phrase dictionary (always exact).
  const phraseEntry = findLocalPhrase(key);
  if (phraseEntry) {
    collected.push({ id: "local-0", sentence: phraseEntry.example, source: LOCAL_SOURCE });
    anySourceResponded = true;
  }

  // 2. Dictionary API examples — rankExamples keeps only those that contain
  //    the exact target.
  const dict = await fetchJson(
    fetchFn,
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`
  );
  if (dict.kind === "failed") anySourceFailed = true;
  else anySourceResponded = true;
  if (dict.kind === "ok") {
    for (const s of parseDictionaryApiDev(dict.json)) {
      if (s.example) {
        collected.push({ id: `d-${collected.length}`, sentence: s.example, source: "dictionaryapi.dev" });
      }
    }
  }

  // 3. Tatoeba — exact search only (quoted for phrases). Results that don't
  //    contain the full target phrase are filtered out by rankExamples.
  if (usableCount() < MAX_SUGGESTIONS) {
    const query = isPhrase(key) ? `"${key}"` : key;
    const exactSearch = await tatoebaSearch(fetchFn, query);
    if (exactSearch.kind === "failed") anySourceFailed = true;
    else anySourceResponded = true;
    if (exactSearch.kind === "ok") {
      collected.push(...parseTatoeba(exactSearch.json));
    }
  }

  // 4. Curated local examples for common study words, only when API results
  //    are missing or low quality (fewer than 3 high-quality sentences).
  const highQualityCount = () =>
    rankExamples(collected, key).filter(
      (e) => scoreExampleSentence(e.sentence, key) >= HIGH_QUALITY_EXAMPLE_SCORE
    ).length;
  if (highQualityCount() < 3) {
    const localExamples = findLocalWordExamples(key);
    if (localExamples.length > 0) {
      for (const sentence of localExamples) {
        collected.push({ id: `w-${collected.length}`, sentence, source: LOCAL_SOURCE });
      }
      anySourceResponded = true;
    }
  }

  const suggestions = rankExamples(collected, key);
  const result: ExampleLookupResult = {
    term: display,
    exact: true,
    searchedWord: key,
    suggestions,
  };

  // Cache real data always; cache an empty result only when every consulted
  // source actually responded (a down/timed-out source should be retried).
  if (anySourceResponded && (suggestions.length > 0 || !anySourceFailed)) {
    const source = suggestions[0]?.source ?? "none";
    await cacheSet(opts.cache, { term: display, normalizedTerm: key, type: "example", source, data: result });
  }
  return result;
}
