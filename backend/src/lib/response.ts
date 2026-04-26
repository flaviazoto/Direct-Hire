// backend/src/lib/response.ts
// Typed response helpers for consistent API shape

import { Response } from "express";

export function ok<T>(res: Response, data: T, message?: string, status = 200) {
  return res.status(status).json({ success: true, data, message });
}

export function created<T>(res: Response, data: T, message?: string) {
  return ok(res, data, message, 201);
}

export function err(res: Response, error: string, status = 400, extras?: Record<string, unknown>) {
  return res.status(status).json({ success: false, error, ...extras });
}

export function paginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return res.json({
    success:    true,
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

// ── Pagination parser ─────────────────────────────────────────
export function getPagination(query: Record<string, unknown>) {
  const page  = Math.max(1, parseInt(String(query.page  ?? "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? "20"))));
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
}
