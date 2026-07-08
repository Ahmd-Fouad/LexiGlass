import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { badRequest, str, toErrorResponse } from "@/lib/api-helpers";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = str(body.name, 100);
    const email = str(body.email, 200)?.toLowerCase() ?? null;
    const password = typeof body.password === "string" ? body.password : "";

    if (!name) return badRequest("Please enter your name.");
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return badRequest("Please enter a valid email.");
    if (password.length < 8) return badRequest("Password must be at least 8 characters.");

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return badRequest("An account with this email already exists.");

    const user = await db.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
    });
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
