// backend/src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  _req: Request,
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

  // Generic error
  const message = err instanceof Error ? err.message : "An unexpected error occurred";
  console.error("[Server Error]", err);
  return res.status(500).json({ success: false, error: message });
}
