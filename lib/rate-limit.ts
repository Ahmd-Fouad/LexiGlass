import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "./db";

export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  dictionary: { limit: 60, windowMs: 60_000, blockMs: 60_000 },
  providerTest: { limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  grammarGenerate: { limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  grammarTopUp: { limit: 20, windowMs: 60 * 60_000, blockMs: 30 * 60_000 },
  quizStart: { limit: 20, windowMs: 60_000, blockMs: 60_000 },
  quizAnswer: { limit: 120, windowMs: 60_000, blockMs: 60_000 },
  reviewOnline: { limit: 120, windowMs: 60_000, blockMs: 60_000 },
  reviewSync: { limit: 20, windowMs: 60_000, blockMs: 60_000 },
  writingAttempt: { limit: 30, windowMs: 60 * 60_000, blockMs: 15 * 60_000 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

export interface RateLimitState {
  count: number;
  windowStart: Date;
  blockedUntil: Date | null;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  state: RateLimitState;
}

/** Pure fixed-window rule, separated for deterministic tests. */
export function evaluateRateLimit(
  state: RateLimitState | null,
  config: { limit: number; windowMs: number; blockMs: number },
  now: Date = new Date()
): RateLimitDecision {
  if (state?.blockedUntil && state.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.blockedUntil.getTime() - now.getTime()) / 1000)),
      state,
    };
  }
  const expired = !state || now.getTime() - state.windowStart.getTime() >= config.windowMs;
  const next: RateLimitState = expired
    ? { count: 1, windowStart: now, blockedUntil: null }
    : { ...state, count: state.count + 1, blockedUntil: null };
  if (next.count <= config.limit) return { allowed: true, retryAfterSeconds: 0, state: next };
  next.blockedUntil = new Date(now.getTime() + config.blockMs);
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(config.blockMs / 1000)), state: next };
}

export function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function enforceRateLimit(input: {
  req: Request;
  action: RateLimitAction;
  userId?: string | null;
  identity?: string | null;
}): Promise<Response | null> {
  const base = RATE_LIMITS[input.action];
  const envName = `RATE_LIMIT_${input.action.replace(/([A-Z])/g, "_$1").toUpperCase()}_MAX`;
  const configured = Number(process.env[envName]);
  const config = { ...base, limit: Number.isInteger(configured) && configured > 0 ? configured : base.limit };
  const identity = input.userId ? `user:${input.userId}` : `ip:${requestIp(input.req)}|id:${input.identity ?? ""}`;
  const key = createHash("sha256").update(`${input.action}|${identity}`).digest("hex");
  const now = new Date();

  // Bounded table maintenance; expired buckets contain no audit value.
  await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
  const decision = await retrySerializable(() => db.$transaction(async (tx) => {
    const row = await tx.rateLimitBucket.findUnique({ where: { key } });
    const evaluated = evaluateRateLimit(row ? {
      count: row.count,
      windowStart: row.windowStart,
      blockedUntil: row.blockedUntil,
    } : null, config, now);
    const expiresAt = new Date(Math.max(
      evaluated.state.windowStart.getTime() + config.windowMs,
      evaluated.state.blockedUntil?.getTime() ?? 0
    ));
    await tx.rateLimitBucket.upsert({
      where: { key },
      create: { key, action: input.action, ...evaluated.state, expiresAt },
      update: { count: evaluated.state.count, windowStart: evaluated.state.windowStart,
        blockedUntil: evaluated.state.blockedUntil, expiresAt },
    });
    return evaluated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  if (decision.allowed) return null;
  return rateLimitResponse(decision);
}

export function rateLimitResponse(decision: Pick<RateLimitDecision, "retryAfterSeconds">): Response {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds), "Cache-Control": "no-store" } }
  );
}

async function retrySerializable<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (e) {
      if (attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") continue;
      throw e;
    }
  }
}
