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
    const email = str(body.email, 200)?.toLowerCase() ?? null;
    const limited = await enforceRateLimit({ req, action: "login", identity: email ?? "invalid" });
    if (limited) return limited;
    const password = typeof body.password === "string" && body.password.length <= 128 ? body.password : "";
    if (!email || !password) return badRequest("Please enter your email and password.");

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return badRequest("Incorrect email or password.");
    }

    await createSession(user.id, user.sessionVersion);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
