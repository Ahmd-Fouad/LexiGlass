import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { badRequest, toErrorResponse } from "@/lib/api-helpers";
import { MAX_TERM_LENGTH, lookupDefinitions, normalizeTerm } from "@/lib/dictionary";
import { prismaDictionaryCache } from "@/lib/dictionary-cache";

// GET /api/dictionary/lookup?term=... — definition suggestions for a word/phrase.
export async function GET(req: Request) {
  try {
    await requireUserId();
    const term = new URL(req.url).searchParams.get("term") ?? "";
    if (term.length > MAX_TERM_LENGTH) return badRequest("Term is too long.");
    if (!normalizeTerm(term).key) return badRequest("Please provide a word or phrase.");

    const result = await lookupDefinitions(term, { cache: prismaDictionaryCache });
    return NextResponse.json({ result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
