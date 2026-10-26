// backend/src/middleware/request-id.middleware.ts
// Gives every request an ID, returned as X-Request-Id and written to the
// access and error logs, so a user-reported failure can be found in the logs.

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

const VALID_INCOMING = /^[A-Za-z0-9-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers["x-request-id"];
  req.id = typeof incoming === "string" && VALID_INCOMING.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
