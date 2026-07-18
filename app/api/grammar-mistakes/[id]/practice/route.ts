import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { badRequest, readJsonBody, strOrEmpty, toErrorResponse } from "@/lib/api-helpers";
import { practiceGrammarMistake } from "@/lib/grammar-mistakes";

type Params = { params: Promise<{ id: string }> };

/**
 * Grades one practice attempt on a GrammarMistake. Correct → "practiced";
 * wrong → stays "active" and mistakeCount increments. Never deletes the row.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const parsed = await readJsonBody(req, 4 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const answer = strOrEmpty(body.answer, 1000);
    if (!answer) return badRequest("An answer is required.");

    const result = await practiceGrammarMistake(id, userId, answer);
    if (!result) return NextResponse.json({ error: "Mistake not found" }, { status: 404 });

    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
