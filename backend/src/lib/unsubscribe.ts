// backend/src/lib/unsubscribe.ts
// Email suppression — one central place both the send path (services/email)
// and the public unsubscribe endpoint (controllers/unsubscribe.controller.ts)
// import from.
//
// Classification (per EmailType — see prisma/schema.prisma):
//   NON-TRANSACTIONAL (suppressible — user can opt out):
//     ONBOARDING_REMINDER, JOB_MATCH, EMPLOYER_OUTREACH
//   TRANSACTIONAL (always sent, never suppressed):
//     WELCOME, EMAIL_VERIFICATION, PASSWORD_RESET, ONBOARDING_SUBMITTED,
//     ACCOUNT_APPROVED, ACCOUNT_REJECTED, ACCOUNT_NEEDS_CHANGES,
//     SUBSCRIPTION_CONFIRMED, ADMIN_NEW_SUBMISSION, APPLICATION_RECEIVED,
//     APPLICATION_SHORTLISTED, APPLICATION_INTERVIEW_REQUESTED,
//     APPLICATION_ACCEPTED, APPLICATION_REJECTED, INVOICE_RECEIPT,
//     SYSTEM_HEALTH_ALERT, GENERAL
//
// JOB_MATCH is recommendation/digest-class (a scored suggestion, not a
// status change the user is owed) — added as its own EmailType instead of
// reusing GENERAL specifically so it could be classified suppressible here
// without dragging every other GENERAL call site along with it.
//
// EMPLOYER_OUTREACH (added ahead of the Employer Acquisition Agent — see
// docs/ARCHITECTURE.md §11) is the same reasoning as JOB_MATCH: growth-agent
// re-engagement/outreach to employers is marketing-class, not a status
// change anyone is owed, so it needs to be suppressible — kept as its own
// type for the same reason JOB_MATCH is, rather than reusing GENERAL. Not
// wired to any send call site yet; this pass only adds the classification.
//
// GENERAL is a catch-all reused across job-moderation outcomes, worker-lock
// lifecycle, posting-rights changes, contact-form receipts, and direct
// employer<->worker messages — every current call site is tied to a specific
// status change or receipt the user needs regardless of marketing
// preference, so it's classified transactional. It is NOT semantically safe
// by type alone: if a genuinely promotional/behavioral email is ever added
// under GENERAL, that call site needs its own suppression check — this
// allowlist can only gate by EmailType, and GENERAL is overloaded.
//
// ADMIN_NEW_SUBMISSION goes to OWNER_EMAIL (site operator), never a
// platform user's own address, so it's not a candidate for user-level
// suppression at all regardless of classification.

import prisma from "./prisma";
import { generateSecureToken } from "./auth";
import type { EmailType } from "../types";

const NON_TRANSACTIONAL_EMAIL_TYPES: ReadonlySet<EmailType> = new Set<EmailType>([
  "ONBOARDING_REMINDER",
  "JOB_MATCH",
  "EMPLOYER_OUTREACH",
]);

export function isSuppressible(emailType: EmailType): boolean {
  return NON_TRANSACTIONAL_EMAIL_TYPES.has(emailType);
}

export async function isUnsubscribed(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { emailUnsubscribedAt: true },
  });
  return user?.emailUnsubscribedAt != null;
}

// Lazily generates + persists a token the first time one is needed, so
// existing (pre-migration) users get one automatically on their next
// non-transactional send — no backfill script required.
export async function getOrCreateUnsubscribeToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { unsubscribeToken: true },
  });
  if (user?.unsubscribeToken) return user.unsubscribeToken;

  const token = generateSecureToken();
  await prisma.user.update({
    where: { id: userId },
    data:  { unsubscribeToken: token },
  });
  return token;
}

export function buildUnsubscribeUrl(token: string): string {
  const appUrl = process.env.FRONTEND_URL ?? "https://directhire.cc";
  return `${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}
