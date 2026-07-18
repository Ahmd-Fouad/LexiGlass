import { NextResponse } from "next/server";

function errorResponse(message: string, status: number, code: string, requestId?: string): Response {
  return NextResponse.json(
    { error: message, code, ...(requestId ? { requestId } : {}) },
    { status, headers: { "Cache-Control": "no-store", ...(requestId ? { "X-Request-ID": requestId } : {}) } }
  );
}

/** Converts thrown Responses (e.g. from requireUserId) into route responses. */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof Response) return e;
  const correlationId = crypto.randomUUID();
  const errorName = e instanceof Error ? e.name : "UnknownError";
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "api_request_failed",
    requestId: correlationId,
    errorName,
  }));
  return errorResponse("Something went wrong", 500, "INTERNAL_ERROR", correlationId);
}

export function badRequest(message: string): Response {
  return errorResponse(message, 400, "VALIDATION_ERROR");
}

/** Returns trimmed string field or null. */
export function str(v: unknown, maxLen = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 || t.length > maxLen ? null : t;
}

export function strOrEmpty(v: unknown, maxLen = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, maxLen) : "";
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export async function readJsonBody(
  req: Request,
  maxBytes = 16 * 1024
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: "Request body is too large" }, { status: 413 }) };
  }
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return { ok: false, response: NextResponse.json({ error: "Request body is too large" }, { status: 413 }) };
    }
    const parsed = text ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: badRequest("Invalid JSON request body") };
  }
}
