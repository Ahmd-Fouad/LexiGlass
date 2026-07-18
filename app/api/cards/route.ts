import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, readJsonBody, str, strOrEmpty, toErrorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    const userId = await requireUserId();
    const cards = await db.flashcard.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ cards });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;

    const text = str(body.text, 200);
    const meaning = str(body.meaning, 1000);
    if (!text) return badRequest("Please enter the word or phrase.");
    if (!meaning) return badRequest("Please enter the meaning.");

    const card = await db.flashcard.create({
      data: {
        userId,
        text,
        meaning,
        kind: oneOf(body.kind, ["word", "phrase"] as const, "word"),
        translation: str(body.translation) ?? undefined,
        example: str(body.example) ?? undefined,
        pronunciation: str(body.pronunciation, 200) ?? undefined,
        wordType: str(body.wordType, 50) ?? undefined,
        notes: str(body.notes) ?? undefined,
        tags: strOrEmpty(body.tags, 500),
        category: str(body.category, 100) ?? undefined,
        difficulty: oneOf(body.difficulty, ["easy", "medium", "hard"] as const, "medium"),
      },
    });
    return NextResponse.json({ card }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
