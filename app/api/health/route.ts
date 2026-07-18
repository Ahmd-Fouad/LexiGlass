import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness plus a lightweight PostgreSQL readiness probe. */
export async function GET() {
  const startedAt = performance.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", database: "reachable", responseTimeMs: Math.round(performance.now() - startedAt) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } }
    );
  }
}
