import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

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
  const authed = await isAuthenticated(req);

  if (PUBLIC_PATHS.includes(pathname)) {
    // Already logged in → go straight to the dashboard.
    if (authed) return NextResponse.redirect(new URL("/dashboard", req.url));
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
  // Protect all pages; API routes handle auth themselves (401 instead of redirect).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
