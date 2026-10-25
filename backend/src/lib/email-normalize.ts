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

/** Case-insensitive User lookup by email: prisma.user.findFirst({ where: userEmailWhere(email) }). */
export function userEmailWhere(email: string): Prisma.UserWhereInput {
  return { email: { equals: normalizeEmail(email), mode: "insensitive" } };
}
