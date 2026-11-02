// backend/src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Zod validation error
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    err.errors.forEach((e) => {
      const path = e.path.join(".");
      if (path) fieldErrors[path] = e.message;
    });
    return res.status(422).json({
      success:     false,
      error:       "Validation failed",
      code:        "VALIDATION_ERROR",
      fieldErrors,
    });
  }

  // Prisma unique constraint
  if (
    err instanceof Error &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  ) {
    return res.status(409).json({
      success: false,
      error:   "A record with those details already exists",
      code:    "CONFLICT",
    });
  }

  // Upload too large / malformed multipart
  if (err instanceof MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({
      success: false,
      error:   err.code === "LIMIT_FILE_SIZE" ? "File too large" : "Invalid upload",
      code:    err.code,
    });
  }

  // Disallowed CORS origin (thrown by the cors origin callback in server.ts)
  if (err instanceof Error && err.message.startsWith("CORS:")) {
    return res.status(403).json({ success: false, error: "Origin not allowed", code: "CORS_FORBIDDEN" });
  }

  // Client errors raised by Express/body-parser (malformed JSON, body too
  // large, …) carry a 4xx status and a safe message.
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const type = (err as { type?: string }).type;
    const error = type === "entity.parse.failed" ? "Malformed JSON body"
      : type === "entity.too.large" ? "Request body too large"
      : "Bad request";
    return res.status(status).json({ success: false, error });
  }

  // Unexpected error: full details stay in the server log; the client gets a
  // generic message plus the request ID to quote to support.
  console.error(`[Server Error] requestId=${req.id ?? "-"} ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({
    success:   false,
    error:     "Something went wrong. Please try again.",
    code:      "INTERNAL_ERROR",
    requestId: req.id,
  });
}
