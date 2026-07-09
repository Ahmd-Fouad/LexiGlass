import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/api-helpers";
import { resolveGrammarMistake } from "@/lib/grammar-mistakes";

type Params = { params: Promise<{ id: string }> };

/** Marks a GrammarMistake resolved. Never deletes the row — kept for history. */
export async function POST(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const result = await resolveGrammarMistake(id, userId);
    if (!result) return NextResponse.json({ error: "Mistake not found" }, { status: 404 });

    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
