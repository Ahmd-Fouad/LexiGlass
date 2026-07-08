import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, str, strOrEmpty, toErrorResponse } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

async function findOwnedCard(id: string, userId: string) {
  const card = await db.flashcard.findUnique({ where: { id } });
  if (!card || card.userId !== userId) return null;
  return card;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const card = await findOwnedCard(id, userId);
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    return NextResponse.json({ card });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await findOwnedCard(id, userId))) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const text = str(body.text, 200);
    const meaning = str(body.meaning, 1000);
    if (!text) return badRequest("Please enter the word or phrase.");
    if (!meaning) return badRequest("Please enter the meaning.");

    const card = await db.flashcard.update({
      where: { id },
      data: {
        text,
        meaning,
        kind: oneOf(body.kind, ["word", "phrase"] as const, "word"),
        translation: str(body.translation),
        example: str(body.example),
        pronunciation: str(body.pronunciation, 200),
        wordType: str(body.wordType, 50),
        notes: str(body.notes),
        tags: strOrEmpty(body.tags, 500),
        category: str(body.category, 100),
        difficulty: oneOf(body.difficulty, ["easy", "medium", "hard"] as const, "medium"),
      },
    });
    return NextResponse.json({ card });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await findOwnedCard(id, userId))) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    await db.flashcard.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
