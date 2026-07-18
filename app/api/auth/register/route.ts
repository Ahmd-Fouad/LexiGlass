import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { badRequest, readJsonBody, str, toErrorResponse } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const parsed = await readJsonBody(req, 4 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const name = str(body.name, 100);
    const email = str(body.email, 200)?.toLowerCase() ?? null;
    const password = typeof body.password === "string" && body.password.length <= 128 ? body.password : "";
    const limited = await enforceRateLimit({ req, action: "register", identity: email ?? "invalid" });
    if (limited) return limited;

    if (!name) return badRequest("Please enter your name.");
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return badRequest("Please enter a valid email.");
    if (password.length < 10) return badRequest("Password must be 10–128 characters; passphrases are welcome.");

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return badRequest("An account with this email already exists.");

    const user = await db.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
    });
    await createSession(user.id, user.sessionVersion);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
