import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { badRequest, oneOf, readJsonBody, str, strOrEmpty, toErrorResponse } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

async function findOwnedTopic(id: string, userId: string) {
  const topic = await db.grammarTopic.findUnique({ where: { id } });
  if (!topic || topic.userId !== userId) return null;
  return topic;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const topic = await findOwnedTopic(id, userId);
    if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    return NextResponse.json({ topic });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await findOwnedTopic(id, userId))) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const title = str(body.title, 200);
    const explanation = str(body.explanation, 5000);
    if (!title) return badRequest("Please enter a title.");
    if (!explanation) return badRequest("Please enter an explanation.");

    const topic = await db.grammarTopic.update({
      where: { id },
      data: {
        title,
        explanation,
        examples: strOrEmpty(body.examples),
        commonMistakes: strOrEmpty(body.commonMistakes),
        notes: str(body.notes),
        tags: strOrEmpty(body.tags, 500),
        difficulty: oneOf(body.difficulty, ["easy", "medium", "hard"] as const, "medium"),
      },
    });
    return NextResponse.json({ topic });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await findOwnedTopic(id, userId))) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    await db.grammarTopic.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
