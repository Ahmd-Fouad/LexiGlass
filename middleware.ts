import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isTrustedRequestOrigin } from "@/lib/request-security";

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

  // API authentication remains in route handlers, but all browser mutations
  // cross this centralized same-origin gate before any body is processed.
  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isTrustedRequestOrigin({
      requestUrl: req.url,
      origin: req.headers.get("origin"),
      referer: req.headers.get("referer"),
      configuredOrigin: process.env.APP_ORIGIN,
    })) {
      return NextResponse.json({ error: "Untrusted request origin" }, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  // The offline fallback page must be reachable (and precacheable by the
  // service worker) without a session; it renders no user data itself.
  if (pathname === "/offline") return NextResponse.next();

  const authed = await isAuthenticated(req);

  if (PUBLIC_PATHS.includes(pathname)) {
    // The server page performs the version-aware session lookup. Middleware
    // only knows the JWT signature and must not redirect a revoked token into
    // a login/dashboard loop.
    return NextResponse.next();
  }

  if (!authed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect all pages; API routes handle auth themselves (401 instead of
  // redirect). PWA files (service worker, manifest, icons) must load without
  // a session or installation breaks.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons).*)",
  ],
};
