// frontend/src/middleware.ts
// Edge middleware — reads the JWT access cookie and enforces role-based routing.
// The actual token verification happens on the backend. This middleware just reads
// the decoded payload to decide which page to serve — it does not verify the signature.

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/", "/for-workers", "/for-employers", "/pricing", "/about",
  "/contact", "/terms", "/privacy",
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email",
];

const ROLE_PREFIXES: Record<string, string> = {
  "/worker":   "WORKER",
  "/employer": "EMPLOYER",
  "/admin":    "ADMIN",
};
const VALID_ROLES = new Set(["WORKER", "EMPLOYER", "ADMIN"]);

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/static/")) return true;
  if (/\.(ico|png|svg|jpg|jpeg|css|js|woff2?)$/.test(pathname))          return true;
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
}

function decodeJwtPayload(token: string): { role?: string; exp?: number } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get("dh_access")?.value;

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const payload = decodeJwtPayload(token);

  // Expired token
  if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("session", "expired");
    const res = NextResponse.redirect(url);
    res.cookies.delete("dh_access");
    return res;
  }

  if (!payload.role || !VALID_ROLES.has(payload.role)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("session", "expired");
    const res = NextResponse.redirect(url);
    res.cookies.delete("dh_access");
    return res;
  }

  // Role check
  const requiredRole = Object.entries(ROLE_PREFIXES).find(([prefix]) =>
    pathname.startsWith(prefix)
  )?.[1];

  if (requiredRole && payload.role !== requiredRole) {
    const url       = req.nextUrl.clone();
    url.pathname    = `/${payload.role.toLowerCase()}/dashboard`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
