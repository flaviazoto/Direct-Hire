// backend/src/lib/email-normalize.ts
// Emails are stored lowercased and trimmed so "Ana@x.com" and "ana@x.com"
// cannot become two accounts. Lookups stay case-insensitive because rows
// created before normalization may still contain uppercase letters.

import { z } from "zod";
import type { Prisma } from "@prisma/client";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** zod email field that normalizes before validating. */
export const zEmail = () => z.string().trim().toLowerCase().pipe(z.string().email());

/**
 * Case-insensitive User lookup by email: prisma.user.findFirst({ where: userEmailWhere(email) }).
 * Prisma compiles insensitive equals to ILIKE without escaping, so % and _ in
 * the input would act as wildcards ("a_b@x" matching "axb@x"). Escape them so
 * this is an exact, case-insensitive comparison.
 */
export function userEmailWhere(email: string): Prisma.UserWhereInput {
  const literal = normalizeEmail(email).replace(/[\\%_]/g, (c) => "\\" + c);
  return { email: { equals: literal, mode: "insensitive" } };
}
