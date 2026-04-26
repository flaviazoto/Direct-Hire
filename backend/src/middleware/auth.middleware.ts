// backend/src/middleware/auth.middleware.ts
// Express middleware - verifies JWT from cookie, attaches user to req

import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, JwtPayload, Role } from "../lib/auth";
import { COOKIE_ACCESS } from "../lib/auth";
import { err } from "../lib/response";
import prisma from "../lib/prisma";

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// requireAuth middleware
export function requireAuth(allowedRoles?: Role[], options?: { requireVerified?: boolean }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[COOKIE_ACCESS]
      ?? req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return err(res, "Unauthorized - no token provided", 401);
    }

    try {
      const payload = await verifyAccessToken(token);

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { role: true, status: true, accountStatus: true },
      });

      if (!user) {
        return err(res, "Unauthorized - account not found", 401);
      }
      if (user.status === "SUSPENDED" || user.status === "BANNED") {
        return err(res, "Account is not active", 403);
      }

      if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
        return err(res, "Forbidden - insufficient permissions", 403);
      }

      if (options?.requireVerified && user.accountStatus !== "VERIFIED") {
        return err(res, "Account not yet verified — approval required", 403);
      }

      req.user = { ...payload, role: user.role as Role };
      next();
    } catch {
      return err(res, "Unauthorized - invalid or expired token", 401);
    }
  };
}

// Shorthand guards
export const requireWorker   = requireAuth(["WORKER"]);
export const requireEmployer = requireAuth(["EMPLOYER"]);
export const requireAdmin    = requireAuth(["ADMIN"]);
export const requireAnyAuth  = requireAuth();

// Verified-only guards (accountStatus = VERIFIED)
export const requireVerifiedWorker   = requireAuth(["WORKER"],   { requireVerified: true });
export const requireVerifiedEmployer = requireAuth(["EMPLOYER"], { requireVerified: true });
