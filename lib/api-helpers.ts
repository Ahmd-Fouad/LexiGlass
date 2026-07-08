import { NextResponse } from "next/server";

/** Converts thrown Responses (e.g. from requireUserId) into route responses. */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof Response) return e;
  console.error(e);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
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
