import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { badRequest, str, toErrorResponse } from "@/lib/api-helpers";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = str(body.email, 200)?.toLowerCase() ?? null;
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return badRequest("Please enter your email and password.");

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return badRequest("Incorrect email or password.");
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
