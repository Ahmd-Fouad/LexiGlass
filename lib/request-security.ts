export function isTrustedRequestOrigin(input: {
  requestUrl: string;
  origin?: string | null;
  referer?: string | null;
  configuredOrigin?: string | null;
}): boolean {
  const requestOrigin = new URL(input.requestUrl).origin;
  const configured = input.configuredOrigin?.replace(/\/$/, "");
  const allowed = new Set([requestOrigin, ...(configured ? [configured] : [])]);
  for (const value of [input.origin, input.referer]) {
    if (!value) continue;
    try { return allowed.has(new URL(value).origin); }
    catch { return false; }
  }
  return false;
}

