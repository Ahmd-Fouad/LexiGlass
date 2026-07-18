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
    const topics = await db.grammarTopic.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = topics.length > limit;
    const page = hasMore ? topics.slice(0, limit) : topics;
    return NextResponse.json({
      topics: page,
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

    const title = str(body.title, 200);
    const explanation = str(body.explanation, 5000);
    if (!title) return badRequest("Please enter a title.");
    if (!explanation) return badRequest("Please enter an explanation.");

    const topic = await db.grammarTopic.create({
      data: {
        userId,
        title,
        explanation,
        examples: strOrEmpty(body.examples),
        commonMistakes: strOrEmpty(body.commonMistakes),
        notes: str(body.notes) ?? undefined,
        tags: strOrEmpty(body.tags, 500),
        difficulty: oneOf(body.difficulty, ["easy", "medium", "hard"] as const, "medium"),
      },
    });
    return NextResponse.json({ topic }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
