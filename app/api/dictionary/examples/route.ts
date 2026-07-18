import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { badRequest, toErrorResponse } from "@/lib/api-helpers";
import { MAX_TERM_LENGTH, lookupExamples, normalizeTerm } from "@/lib/dictionary";
import { prismaDictionaryCache } from "@/lib/dictionary-cache";
import { enforceRateLimit } from "@/lib/rate-limit";

// GET /api/dictionary/examples?term=... — example sentence suggestions.
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const limited = await enforceRateLimit({ req, action: "dictionary", userId });
    if (limited) return limited;
    const term = new URL(req.url).searchParams.get("term") ?? "";
    if (term.length > MAX_TERM_LENGTH) return badRequest("Term is too long.");
    if (!normalizeTerm(term).key) return badRequest("Please provide a word or phrase.");

    const result = await lookupExamples(term, { cache: prismaDictionaryCache });
    return NextResponse.json({ result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
