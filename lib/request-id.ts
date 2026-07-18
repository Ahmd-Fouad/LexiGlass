const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

/** Reuse a safe upstream correlation ID, otherwise create one locally. */
export function requestId(headers: Headers): string {
  const incoming = headers.get("x-request-id");
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
}
