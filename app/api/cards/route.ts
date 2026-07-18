import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, readJsonBody, str, strOrEmpty, toErrorResponse } from "@/lib/api-helpers";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    const cursor = url.searchParams.get("cursor") || undefined;
    const cards = await db.flashcard.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = cards.length > limit;
    const page = hasMore ? cards.slice(0, limit) : cards;
    return NextResponse.json({
      cards: page,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    });
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
