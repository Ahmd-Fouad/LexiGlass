// Smart Definition & Example Assistant — server-side dictionary module.
//
// All external API calls are centralized here and must only run server-side.
// Sources (all free, no API keys):
//   - dictionaryapi.dev      → primary definitions
//   - freedictionaryapi.com  → fallback definitions
//   - Datamuse               → related words / spelling suggestions (not a dictionary)
//   - Tatoeba                → example sentences (not a dictionary)
//
// The orchestrators (`lookupDefinitions`, `lookupExamples`) accept an optional
// cache store and fetch function so they can be unit-tested without a network
// or database. API routes pass the Prisma-backed cache from lib/dictionary-cache.

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
  related: string[]; // Datamuse related words / spelling suggestions
}

export interface ExampleLookupResult {
  term: string;
  exact: boolean; // false when we fell back to the phrase's main word
  searchedWord: string; // what was actually searched (main word for phrase fallback)
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
const MAX_SUGGESTIONS = 5;
const MIN_EXAMPLE_WORDS = 4;
const MAX_EXAMPLE_WORDS = 26;
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

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "but", "with",
  "at", "by", "from", "up", "out", "off", "about", "into", "over", "under",
  "after", "before", "is", "are", "was", "were", "be", "been", "being", "it",
  "its", "this", "that", "these", "those", "as", "so", "not", "no", "do",
  "does", "did", "have", "has", "had", "will", "would", "can", "could",
  "should", "my", "your", "his", "her", "our", "their", "you", "he", "she",
  "we", "they", "i", "me", "him", "them", "us",
]);

/** Picks the most important word of a phrase (longest non-stopword). */
export function mainWordOf(key: string): string {
  const words = key.split(" ").filter(Boolean);
  const candidates = words.filter((w) => !STOPWORDS.has(w));
  const pool = candidates.length > 0 ? candidates : words;
  return pool.reduce((best, w) => (w.length > best.length ? w : best), pool[0] ?? key);
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

// ---------- Filtering / data quality ----------

/** Removes duplicate/empty definitions and keeps the best few. */
export function dedupeDefinitions(
  suggestions: DictionarySuggestion[],
  cap = MAX_SUGGESTIONS
): DictionarySuggestion[] {
  const seen = new Set<string>();
  const out: DictionarySuggestion[] = [];
  for (const s of suggestions) {
    const key = dedupeKey(s.definition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, id: `def-${out.length}` });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Removes duplicates, drops examples that are too short (< 4 words) or too
 * long, prefers shorter sentences, and keeps the best few.
 */
export function filterExamples(
  examples: ExampleSuggestion[],
  cap = MAX_SUGGESTIONS
): ExampleSuggestion[] {
  const seen = new Set<string>();
  const usable: ExampleSuggestion[] = [];
  for (const ex of examples) {
    const sentence = ex.sentence.trim().replace(/\s+/g, " ");
    if (!sentence) continue;
    const words = wordCount(sentence);
    if (words < MIN_EXAMPLE_WORDS) continue;
    if (words > MAX_EXAMPLE_WORDS || sentence.length > MAX_EXAMPLE_CHARS) continue;
    const key = dedupeKey(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    usable.push({ ...ex, sentence });
  }
  // Prefer short, clear sentences; stable for equal lengths.
  usable.sort((a, b) => a.sentence.length - b.sentence.length);
  return usable.slice(0, cap).map((ex, i) => ({ ...ex, id: `ex-${i}` }));
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

// ---------- Cache helpers (failures must never break a lookup) ----------

async function cacheGet<T>(
  cache: DictionaryCacheStore | undefined,
  key: string,
  type: CacheType
): Promise<T | null> {
  if (!cache) return null;
  try {
    const raw = await cache.get(key, type);
    return raw ? (JSON.parse(raw) as T) : null;
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
    await cache.set({ ...entry, data: JSON.stringify(entry.data) });
  } catch {
    // Caching is best-effort; the lookup result is still returned.
  }
}

// ---------- Definition lookup orchestrator ----------

/**
 * Definition lookup: cache → dictionaryapi.dev → FreeDictionaryAPI.com →
 * Datamuse related/spelling suggestions (phrases and misses). Results are
 * cached only when at least one source actually responded.
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

  // 1. Primary: dictionaryapi.dev
  const primary = await fetchJson(
    fetchFn,
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`
  );
  if (primary.kind === "failed") anySourceFailed = true;
  else anySourceResponded = true;
  if (primary.kind === "ok") {
    suggestions = parseDictionaryApiDev(primary.json);
    if (suggestions.length > 0) source = "dictionaryapi.dev";
  }

  // 2. Fallback: freedictionaryapi.com
  if (suggestions.length === 0) {
    const fallback = await fetchJson(
      fetchFn,
      `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(key)}`
    );
    if (fallback.kind === "failed") anySourceFailed = true;
    else anySourceResponded = true;
    if (fallback.kind === "ok") {
      suggestions = parseFreeDictionaryApi(fallback.json);
      if (suggestions.length > 0) source = "freedictionaryapi.com";
    }
  }

  // 3. No exact definition → Datamuse related words + spelling suggestions.
  if (suggestions.length === 0) {
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
    suggestions: dedupeDefinitions(suggestions),
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
 * Example lookup: cache → dictionary API examples → Tatoeba exact term →
 * Tatoeba main word of the phrase. Only English sentences are returned.
 */
export async function lookupExamples(
  rawTerm: string,
  opts: LookupOptions = {}
): Promise<ExampleLookupResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const { display, key } = normalizeTerm(rawTerm);
  if (!key) return { term: display, exact: false, searchedWord: "", suggestions: [] };

  const cached = await cacheGet<ExampleLookupResult>(opts.cache, key, "example");
  if (cached) return cached;

  const collected: ExampleSuggestion[] = [];
  let source = "none";
  let exact = true;
  let searchedWord = key;
  let anySourceResponded = false;
  let anySourceFailed = false;

  // 1. Examples embedded in dictionary API definitions.
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
    if (collected.length > 0) source = "dictionaryapi.dev";
  }

  // 2. Tatoeba — exact term (quoted when it's a phrase).
  if (filterExamples(collected).length < 3) {
    const query = isPhrase(key) ? `"${key}"` : key;
    const exactSearch = await tatoebaSearch(fetchFn, query);
    if (exactSearch.kind === "failed") anySourceFailed = true;
    else anySourceResponded = true;
    if (exactSearch.kind === "ok") {
      const sentences = parseTatoeba(exactSearch.json);
      if (sentences.length > 0) {
        collected.push(...sentences);
        source = source === "none" ? "tatoeba" : "mixed";
      }
    }

    // 3. Phrase with no exact hits → search the phrase's main word.
    if (isPhrase(key) && filterExamples(collected).length === 0) {
      const main = mainWordOf(key);
      const mainSearch = await tatoebaSearch(fetchFn, main);
      if (mainSearch.kind === "failed") anySourceFailed = true;
      else anySourceResponded = true;
      if (mainSearch.kind === "ok") {
        const sentences = parseTatoeba(mainSearch.json);
        if (sentences.length > 0) {
          collected.push(...sentences);
          exact = false;
          searchedWord = main;
          source = "tatoeba";
        }
      }
    }
  }

  const result: ExampleLookupResult = {
    term: display,
    exact,
    searchedWord,
    suggestions: filterExamples(collected),
  };

  // Cache real data always; cache an empty result only when every consulted
  // source actually responded (a down/timed-out source should be retried).
  if (anySourceResponded && (result.suggestions.length > 0 || !anySourceFailed)) {
    await cacheSet(opts.cache, { term: display, normalizedTerm: key, type: "example", source, data: result });
  }
  return result;
}
