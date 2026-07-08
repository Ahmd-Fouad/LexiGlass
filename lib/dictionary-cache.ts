import { db } from "./db";
import type { CacheType, DictionaryCacheStore } from "./dictionary";

// Prisma-backed implementation of the dictionary cache. Lookups are keyed by
// (normalizedTerm, type) so definition and example caches never collide.
export const prismaDictionaryCache: DictionaryCacheStore = {
  async get(normalizedTerm: string, type: CacheType): Promise<string | null> {
    const row = await db.dictionaryCache.findUnique({
      where: { normalizedTerm_type: { normalizedTerm, type } },
    });
    return row?.data ?? null;
  },

  async set(entry): Promise<void> {
    await db.dictionaryCache.upsert({
      where: { normalizedTerm_type: { normalizedTerm: entry.normalizedTerm, type: entry.type } },
      create: entry,
      update: { term: entry.term, source: entry.source, data: entry.data },
    });
  },
};
