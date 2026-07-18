import { NextResponse } from "next/server";
import { destroySession, requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { toErrorResponse } from "@/lib/api-helpers";

/** Revokes every JWT previously issued for the authenticated account. */
export async function POST() {
  try {
    const userId = await requireUserId();
    await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}

