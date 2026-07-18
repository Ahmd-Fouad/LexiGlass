import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isTrustedRequestOrigin } from "@/lib/request-security";
import { requestId } from "@/lib/request-id";

const PUBLIC_PATHS = ["/login", "/register"];

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("lexiglass_session")?.value;
  if (!token || !process.env.AUTH_SECRET) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const correlationId = requestId(req.headers);

  function proceed(privateResponse = false) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", correlationId);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("X-Request-ID", correlationId);
    if (privateResponse) response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  // API authentication remains in route handlers, but all browser mutations
  // cross this centralized same-origin gate before any body is processed.
  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isTrustedRequestOrigin({
      requestUrl: req.url,
      origin: req.headers.get("origin"),
      referer: req.headers.get("referer"),
      configuredOrigin: process.env.APP_ORIGIN,
    })) {
      return NextResponse.json({ error: "Untrusted request origin", code: "UNTRUSTED_ORIGIN" }, {
        status: 403,
        headers: { "Cache-Control": "no-store", "X-Request-ID": correlationId },
      });
    }
    return proceed(true);
  }

  // The offline fallback page must be reachable (and precacheable by the
  // service worker) without a session; it renders no user data itself.
  if (pathname === "/offline") return proceed();

  const authed = await isAuthenticated(req);

  if (PUBLIC_PATHS.includes(pathname)) {
    // The server page performs the version-aware session lookup. Middleware
    // only knows the JWT signature and must not redirect a revoked token into
    // a login/dashboard loop.
    return proceed();
  }

  if (!authed) {
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-ID", correlationId);
    return response;
  }

  if (pathname === "/") {
    const response = NextResponse.redirect(new URL("/dashboard", req.url));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-ID", correlationId);
    return response;
  }

  return proceed(true);
}

export const config = {
  // Protect all pages; API routes handle auth themselves (401 instead of
  // redirect). PWA files (service worker, manifest, icons) must load without
  // a session or installation breaks.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons).*)",
  ],
};
