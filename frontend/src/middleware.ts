// frontend/src/middleware.ts
// Auth is handled client-side via AuthContext + localStorage.
// Middleware only blocks static assets and passes everything else through.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/", "/login", "/register", "/about", "/contact", "/pricing",
  "/for-workers", "/for-employers", "/terms", "/privacy", "/cookies",
  "/forgot-password", "/reset-password", "/auth",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes always pass through
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Public paths pass through
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (isPublic) return NextResponse.next();

  // Protected routes — let through; AuthContext handles redirect client-side
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
