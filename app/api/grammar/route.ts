import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, readJsonBody, str, strOrEmpty, toErrorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    const userId = await requireUserId();
    const topics = await db.grammarTopic.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ topics });
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
