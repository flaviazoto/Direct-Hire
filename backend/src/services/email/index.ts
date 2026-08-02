// src/services/email/index.ts
import type { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import type { EmailType } from "../../types";
import { isSuppressible, isUnsubscribed } from "../../lib/unsubscribe";

// ── Constants ─────────────────────────────────────────────────
export const OWNER_EMAIL   = process.env.OWNER_EMAIL   ?? "directhire1977@gmail.com";
export const FROM_NO_REPLY = "DirectHire <noreply@directhire.cc>";
export const FROM_HELLO    = "DirectHire <hello@directhire.cc>";
export const FROM_SUPPORT  = "DirectHire Support <support@directhire.cc>";

// ── Boot-time fail-fast ───────────────────────────────────────
// Previously a missing RESEND_API_KEY only surfaced as a per-email runtime
// failure (logged + EmailLog FAILED, request unaffected) — silent enough
// that a misconfigured deploy could run for a while before anyone noticed
// no email was actually sending. This module loads as part of the route
// import graph at server startup, so throwing here stops the process
// immediately with a clear cause instead of degrading silently.
if (process.env.EMAIL_PROVIDER === "resend" && !process.env.RESEND_API_KEY) {
  throw new Error(
    "[services/email] EMAIL_PROVIDER=resend but RESEND_API_KEY is not set. " +
    "Set RESEND_API_KEY in the environment, or change EMAIL_PROVIDER to use a different provider.",
  );
}

// ── Provider interface ────────────────────────────────────────
export interface EmailAttachment {
  filename: string;
  content:  Buffer;
}

interface SendParams {
  from?:        string;
  to:           string;
  replyTo?:     string;
  subject:      string;
  html:         string;
  text?:        string;
  attachments?: EmailAttachment[];
}

interface EmailProvider {
  send(params: SendParams): Promise<{ messageId?: string }>;
}

// ── SMTP / Nodemailer provider ────────────────────────────────
class SmtpProvider implements EmailProvider {
  async send(params: SendParams) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST ?? "localhost",
      port:   parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    const info = await transporter.sendMail({
      from:    params.from ?? FROM_NO_REPLY,
      to:      params.to,
      replyTo: params.replyTo,
      subject: params.subject,
      html:    params.html,
      text:    params.text,
      attachments: params.attachments?.map(a => ({ filename: a.filename, content: a.content })),
    });
    return { messageId: info.messageId };
  }
}

// ── Resend provider ───────────────────────────────────────────
class ResendProvider implements EmailProvider {
  async send(params: SendParams) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { data, error } = await resend.emails.send({
      from:     params.from ?? FROM_NO_REPLY,
      to:       params.to,
      reply_to: params.replyTo,
      subject:  params.subject,
      html:     params.html,
      ...(params.attachments?.length
        ? { attachments: params.attachments.map(a => ({ filename: a.filename, content: a.content })) }
        : {}),
    });
    if (error) throw new Error(error.message);
    return { messageId: data?.id };
  }
}

// ── Console provider (dev / CI) ───────────────────────────────
class ConsoleProvider implements EmailProvider {
  async send(params: SendParams) {
    console.log("📧 [EMAIL]", {
      from:        params.from ?? FROM_NO_REPLY,
      to:          params.to,
      subject:     params.subject,
      preview:     params.text?.slice(0, 120) ?? "(html only)",
      attachments: params.attachments?.map(a => a.filename),
    });
    return { messageId: `console-${Date.now()}` };
  }
}

function getProvider(): EmailProvider {
  switch (process.env.EMAIL_PROVIDER) {
    case "resend": return new ResendProvider();
    case "smtp":   return new SmtpProvider();
    default:       return new ConsoleProvider();
  }
}

// ── Main send function ────────────────────────────────────────
export interface SendEmailOptions {
  userId?:      string;
  from?:        string;
  to:           string;
  replyTo?:     string;
  emailType:    EmailType;
  subject:      string;
  html:         string;
  text?:        string;
  templateId?:  string;
  variables?:   Record<string, unknown>;
  attachments?: EmailAttachment[];
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  // Central suppression gate — the ONLY place unsubscribe is enforced.
  // Only checks the DB for email types that are actually suppressible (see
  // lib/unsubscribe.ts's classification), so the 15 transactional types
  // never pay this extra query. userId-less sends (owner/admin notifications,
  // contact-form replies) have nothing to suppress against.
  if (opts.userId && isSuppressible(opts.emailType) && await isUnsubscribed(opts.userId)) {
    console.log(`[sendEmail] Suppressed "${opts.subject}" → ${opts.to} (unsubscribed, type ${opts.emailType})`);
    return;
  }

  let logId: string | undefined;
  try {
    const logRecord = await prisma.emailLog.create({
      data: {
        userId:     opts.userId,
        emailType:  opts.emailType,
        toAddress:  opts.to,
        subject:    opts.subject,
        templateId: opts.templateId,
        variables:  (opts.variables ?? {}) as Prisma.InputJsonValue,
        status:     "QUEUED",
      },
    });
    logId = logRecord.id;
  } catch (logErr) {
    console.error("[sendEmail] Failed to create email log:", logErr instanceof Error ? logErr.message : logErr);
  }

  try {
    const provider = getProvider();
    const result   = await provider.send({
      from:        opts.from,
      to:          opts.to,
      replyTo:     opts.replyTo,
      subject:     opts.subject,
      html:        opts.html,
      text:        opts.text,
      attachments: opts.attachments,
    });
    console.log(`[Email sent] "${opts.subject}" → ${opts.to}`);
    if (logId) {
      await prisma.emailLog.update({
        where: { id: logId },
        data:  { status: "SENT", providerMsgId: result.messageId, sentAt: new Date() },
      }).catch((e: Error) => console.error("[sendEmail] Failed to update log to SENT:", e.message));
    }
  } catch (error) {
    console.error(`[Email failed] "${opts.subject}" → ${opts.to}:`, error instanceof Error ? error.message : error);
    if (logId) {
      await prisma.emailLog.update({
        where: { id: logId },
        data:  { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Unknown error" },
      }).catch((e: Error) => console.error("[sendEmail] Failed to update log to FAILED:", e.message));
    }
    // Don't rethrow — email failure must not crash the request
  }
}

// ── Internal helper — notify the site owner ───────────────────
async function notifyOwner(subject: string, html: string, text?: string): Promise<void> {
  await sendEmail({ to: OWNER_EMAIL, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text });
}

// ── Auth / verification emails ────────────────────────────────

export async function sendOtpVerification(
  userId: string, to: string, code: string, expiresMinutes: number,
) {
  const { otpVerificationTemplate } = await import("./templates");
  const { subject, html, text } = otpVerificationTemplate({ code, expiresMinutes });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "EMAIL_VERIFICATION", subject, html, text });
}

export async function sendWelcomeEmail(
  userId: string, to: string, firstName: string, role: "WORKER" | "EMPLOYER",
) {
  const { welcomeTemplate } = await import("./templates");
  const { subject, html, text } = welcomeTemplate({ firstName, role });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "WELCOME", subject, html, text });
  // Notify owner of every new registration
  notifyOwner(
    `New registration: ${firstName} (${role})`,
    `<p>New ${role.toLowerCase()} registered on DirectHire.</p>
     <p><strong>Name:</strong> ${firstName}<br/><strong>Email:</strong> ${to}<br/><strong>Role:</strong> ${role}</p>`,
    `New ${role} registered: ${firstName} <${to}>`,
  ).catch(() => {});
}

export async function sendPasswordReset(userId: string, to: string, resetUrl: string) {
  const { passwordResetTemplate } = await import("./templates");
  const { subject, html, text } = passwordResetTemplate({ resetUrl });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "PASSWORD_RESET", subject, html, text });
}

export async function sendEmailVerified(
  userId: string, to: string, firstName: string, role: "WORKER" | "EMPLOYER",
) {
  const { emailVerifiedTemplate } = await import("./templates");
  const { subject, html, text } = emailVerifiedTemplate({ firstName, role });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text });
}

// ── Account lifecycle emails ──────────────────────────────────

export async function sendOnboardingSubmitted(
  userId: string, to: string, name: string, role: "WORKER" | "EMPLOYER",
) {
  const { onboardingSubmittedTemplate } = await import("./templates");
  const { subject, html, text } = onboardingSubmittedTemplate({ name, role });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "ONBOARDING_SUBMITTED", subject, html, text });
}

export async function sendAccountApproved(
  userId: string, to: string, firstName: string, role: "WORKER" | "EMPLOYER",
) {
  const { accountApprovedTemplate } = await import("./templates");
  const { subject, html, text } = accountApprovedTemplate({ firstName, role });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "ACCOUNT_APPROVED", subject, html, text,
    templateId: "account_approved", variables: { firstName, role } });
  // Notify owner
  notifyOwner(
    `Account approved: ${firstName} (${role})`,
    `<p>You approved <strong>${firstName}</strong> (${role.toLowerCase()}) &lt;${to}&gt;.</p>`,
    `Account approved: ${firstName} (${role}) <${to}>`,
  ).catch(() => {});
}

export async function sendAccountRejected(
  userId: string, to: string, firstName: string, reason: string,
) {
  const { accountRejectedTemplate } = await import("./templates");
  const { subject, html, text } = accountRejectedTemplate({ firstName, reason });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "ACCOUNT_REJECTED", subject, html, text,
    templateId: "account_rejected", variables: { firstName } });
}

export async function sendAccountSuspended(userId: string, to: string, firstName: string) {
  const { accountSuspendedTemplate } = await import("./templates");
  const { subject, html, text } = accountSuspendedTemplate({ firstName });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "account_suspended", variables: { firstName } });
}

export async function sendAccountReinstated(userId: string, to: string, firstName: string) {
  const { accountReinstatedTemplate } = await import("./templates");
  const { subject, html, text } = accountReinstatedTemplate({ firstName });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "account_reinstated", variables: { firstName } });
}

export async function sendNeedsChanges(userId: string, to: string, name: string, changes: string) {
  const { needsChangesTemplate } = await import("./templates");
  const { subject, html, text } = needsChangesTemplate({ name, changes });
  await sendEmail({ userId, to, from: FROM_SUPPORT, emailType: "ACCOUNT_NEEDS_CHANGES", subject, html, text });
}

export async function sendAdminNewSubmission(
  submitterEmail: string, submitterRole: string, submitterName: string,
) {
  const appUrl = process.env.FRONTEND_URL ?? "https://directhire.cc";
  const { adminNewSubmissionTemplate } = await import("./templates");
  const { subject, html, text } = adminNewSubmissionTemplate({
    submitterEmail, submitterRole, submitterName,
    adminUrl: `${appUrl}/admin/approvals`,
  });
  await sendEmail({ to: OWNER_EMAIL, from: FROM_NO_REPLY, emailType: "ADMIN_NEW_SUBMISSION", subject, html, text });
}

// ── Job emails ────────────────────────────────────────────────

export async function sendJobSubmittedEmail(
  userId: string, to: string, employerName: string, jobTitle: string,
) {
  const { jobSubmittedTemplate } = await import("./templates");
  const { subject, html, text } = jobSubmittedTemplate({ employerName, jobTitle });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "job_submitted", variables: { employerName, jobTitle } });
}

export async function sendJobApprovedEmail(
  userId: string, to: string, firstName: string, jobTitle: string, jobId: string,
) {
  const { jobApprovedTemplate } = await import("./templates");
  const { subject, html, text } = jobApprovedTemplate({ firstName, jobTitle, jobId });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "job_approved", variables: { firstName, jobTitle, jobId } });
}

export async function sendJobRejectedEmail(
  userId: string, to: string, jobTitle: string, jobId: string, reason: string,
) {
  const { jobRejectedTemplate } = await import("./templates");
  const { subject, html, text } = jobRejectedTemplate({ jobTitle, jobId, reason });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "job_rejected", variables: { jobTitle, jobId } });
}

export async function sendJobChangesRequestedEmail(
  userId: string, to: string, jobTitle: string, jobId: string, notes: string,
) {
  const { jobChangesRequestedTemplate } = await import("./templates");
  const { subject, html, text } = jobChangesRequestedTemplate({ jobTitle, jobId, notes });
  await sendEmail({ userId, to, from: FROM_SUPPORT, emailType: "GENERAL", subject, html, text,
    templateId: "job_changes_requested", variables: { jobTitle, jobId } });
}

export async function sendJobResubmittedNotification(
  employerName: string, company: string, jobTitle: string, notes: string,
) {
  const { jobResubmittedNotificationTemplate } = await import("./templates");
  const { subject, html, text } = jobResubmittedNotificationTemplate({ employerName, company, jobTitle, notes });
  await sendEmail({ to: OWNER_EMAIL, from: FROM_NO_REPLY, emailType: "ADMIN_NEW_SUBMISSION", subject, html, text,
    templateId: "job_resubmitted_notification", variables: { employerName, company, jobTitle } });
}

// ── Application emails ────────────────────────────────────────

export async function sendNewApplicationEmail(
  employerUserId: string, to: string, jobTitle: string, companyName: string,
  applicationId: string, jobId: string,
) {
  const { newApplicationTemplate } = await import("./templates");
  const { subject, html, text } = newApplicationTemplate({ jobTitle, companyName, applicationId, jobId });
  await sendEmail({ userId: employerUserId, to, from: FROM_HELLO, emailType: "APPLICATION_RECEIVED", subject, html, text,
    templateId: "new_application", variables: { jobTitle, companyName, applicationId, jobId } });
}

export async function sendApplicationConfirmationEmail(data: {
  workerUserId:    string;
  workerEmail:     string;
  workerFirstName: string;
  jobTitle:        string;
  companyName:     string;
  applicationId:   string;
}) {
  const { applicationConfirmationTemplate } = await import("./templates");
  const { subject, html, text } = applicationConfirmationTemplate({
    firstName:     data.workerFirstName,
    jobTitle:      data.jobTitle,
    companyName:   data.companyName,
    applicationId: data.applicationId,
  });
  await sendEmail({
    userId:     data.workerUserId,
    to:         data.workerEmail,
    from:       FROM_HELLO,
    emailType:  "APPLICATION_RECEIVED",
    subject, html, text,
    templateId: "application_confirmation",
    variables:  { jobTitle: data.jobTitle, companyName: data.companyName, applicationId: data.applicationId },
  });
}

export async function sendApplicationWithdrawnEmail(
  employerUserId: string, to: string, workerName: string, jobTitle: string, companyName: string,
) {
  const { applicationWithdrawnTemplate } = await import("./templates");
  const { subject, html, text } = applicationWithdrawnTemplate({ workerName, jobTitle, companyName });
  await sendEmail({ userId: employerUserId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "application_withdrawn", variables: { workerName, jobTitle, companyName } });
}

export async function sendApplicationShortlistedEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
) {
  const { applicationShortlistedTemplate } = await import("./templates");
  const { subject, html, text } = applicationShortlistedTemplate({ firstName, jobTitle, companyName });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "APPLICATION_SHORTLISTED", subject, html, text,
    templateId: "application_shortlisted", variables: { firstName, jobTitle, companyName } });
}

export async function sendApplicationInterviewedEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
  applicationId: string, interviewInstructions?: string,
) {
  const { applicationInterviewedTemplate } = await import("./templates");
  const { subject, html, text } = applicationInterviewedTemplate({
    firstName, jobTitle, companyName, applicationId, interviewInstructions,
  });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "APPLICATION_INTERVIEW_REQUESTED", subject, html, text,
    templateId: "application_interviewed", variables: { firstName, jobTitle, companyName, applicationId } });
}

export async function sendApplicationAcceptedWorkerEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
) {
  const { applicationAcceptedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = applicationAcceptedWorkerTemplate({ firstName, jobTitle, companyName });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "APPLICATION_ACCEPTED", subject, html, text,
    templateId: "application_accepted_worker", variables: { firstName, jobTitle, companyName } });
}

// Reuses the generic GENERAL email type rather than adding a new EmailType
// enum member (which would need its own migration) — same convention already
// used by messageWorker's employer-facing message email.
export async function sendInterviewResponseEmployerEmail(
  employerUserId: string, to: string, workerName: string, jobTitle: string,
  response: "ACCEPTED" | "DECLINED", message: string | undefined, jobId: string,
) {
  const { interviewResponseTemplate } = await import("./templates");
  const { subject, html, text } = interviewResponseTemplate({ workerName, jobTitle, response, message, jobId });
  await sendEmail({ userId: employerUserId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "interview_response", variables: { workerName, jobTitle, response } });
}

export async function sendHireConfirmationEmployerEmail(data: {
  employerUserId:   string;
  employerEmail:    string;
  employerName:     string;
  workerName:       string;
  jobTitle:         string;
  startDate?:       string;
  contractType?:    string;
  offeredSalary?:   string;
  offeredCurrency?: string;
}) {
  const { hireConfirmationEmployerTemplate } = await import("./templates");
  const { subject, html, text } = hireConfirmationEmployerTemplate({
    employerName:    data.employerName,
    workerName:      data.workerName,
    jobTitle:        data.jobTitle,
    startDate:       data.startDate,
    contractType:    data.contractType,
    offeredSalary:   data.offeredSalary,
    offeredCurrency: data.offeredCurrency,
  });
  await sendEmail({
    userId:     data.employerUserId,
    to:         data.employerEmail,
    from:       FROM_HELLO,
    emailType:  "APPLICATION_ACCEPTED",
    subject, html, text,
    templateId: "hire_confirmation_employer",
    variables:  { workerName: data.workerName, jobTitle: data.jobTitle },
  });
}

export async function sendApplicationRejectedWorkerEmail(
  userId: string, to: string, jobTitle: string, companyName: string,
) {
  const { applicationRejectedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = applicationRejectedWorkerTemplate({ jobTitle, companyName });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "APPLICATION_REJECTED", subject, html, text,
    templateId: "application_rejected_worker", variables: { jobTitle, companyName } });
}

// ── Admin-mediated hiring workflow (Phase 2, sub-step 6) ───────
// None of these have a dedicated EmailType — GENERAL is reused for the same
// reason sendPostingRightsRevokedEmail/sendWorkerLockedWorkerEmail do (no new
// enum member, no migration). The interview-scheduled pair reuses
// APPLICATION_INTERVIEW_REQUESTED for both worker and employer sides, mirroring
// how sendHireConfirmationEmployerEmail already reuses APPLICATION_ACCEPTED
// for its (employer-facing) side of that same event.

export async function sendApplicationApprovedQueuedEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
) {
  const { applicationApprovedQueuedTemplate } = await import("./templates");
  const { subject, html, text } = applicationApprovedQueuedTemplate({ firstName, jobTitle, companyName });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "application_approved_queued", variables: { firstName, jobTitle, companyName } });
}

export async function sendApplicationDocumentRequestedEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string, documentType: string,
) {
  const { applicationDocumentRequestedTemplate } = await import("./templates");
  const { subject, html, text } = applicationDocumentRequestedTemplate({ firstName, jobTitle, companyName, documentType });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "application_document_requested", variables: { firstName, jobTitle, companyName, documentType } });
}

export async function sendAdminFeeDueEmail(
  userId: string, to: string, firstName: string, amountUsd: string,
) {
  const { adminFeeDueTemplate } = await import("./templates");
  const { subject, html, text } = adminFeeDueTemplate({ firstName, amountUsd });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "admin_fee_due", variables: { firstName, amountUsd } });
}

export async function sendClearedForEmployerEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
) {
  const { clearedForEmployerTemplate } = await import("./templates");
  const { subject, html, text } = clearedForEmployerTemplate({ firstName, jobTitle, companyName });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "cleared_for_employer", variables: { firstName, jobTitle, companyName } });
}

// sendInterviewScheduledWorkerEmail/sendInterviewScheduledEmployerEmail
// (the old date/type/notes-shared-with-both-parties model) removed — Part B
// replaced that flow entirely. sendApplicationInterviewInProgressEmail below
// is the new worker-facing equivalent; there's no employer-facing interview
// email anymore since the employer only requests and later receives the
// outcome off-platform, never a scheduling notice.

export async function sendBulkQuoteReadyEmail(
  userId: string, to: string, contactName: string, quoteAmountUsd: string, quoteNotes?: string,
) {
  const { bulkQuoteReadyTemplate } = await import("./templates");
  const { subject, html, text } = bulkQuoteReadyTemplate({ contactName, quoteAmountUsd, quoteNotes });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "bulk_quote_ready", variables: { contactName, quoteAmountUsd } });
}

// ── Posting rights emails ─────────────────────────────────────

export async function sendPostingRightsRevokedEmail(userId: string, to: string) {
  const { postingRightsRevokedTemplate } = await import("./templates");
  const { subject, html, text } = postingRightsRevokedTemplate();
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "posting_rights_revoked" });
}

export async function sendPostingRightsRestoredEmail(userId: string, to: string) {
  const { postingRightsRestoredTemplate } = await import("./templates");
  const { subject, html, text } = postingRightsRestoredTemplate();
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "posting_rights_restored" });
}

// ── Onboarding reminder ───────────────────────────────────────

export async function sendOnboardingReminder(
  userId: string, to: string, firstName: string, continueUrl: string, completionPct: number,
) {
  const { getOrCreateUnsubscribeToken, buildUnsubscribeUrl } = await import("../../lib/unsubscribe");
  const unsubscribeUrl = buildUnsubscribeUrl(await getOrCreateUnsubscribeToken(userId));

  const { onboardingReminderTemplate } = await import("./templates");
  const { subject, html, text } = onboardingReminderTemplate({ firstName, continueUrl, completionPct, unsubscribeUrl });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "ONBOARDING_REMINDER", subject, html, text });
}

// ── Worker lock emails ────────────────────────────────────────

export async function sendWorkerLockedWorkerEmail(
  userId: string, to: string, firstName: string, lockExpiryDate: Date,
) {
  const { workerLockedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockedWorkerTemplate({ firstName, lockExpiryDate });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "worker_locked_worker" });
}

export async function sendWorkerLockedEmployerEmail(
  userId: string, to: string, workerFirstName: string, workerName: string,
  lockStartDate: Date, lockExpiryDate: Date, dailyFee: number, currency: string, lockDays: number,
) {
  const { workerLockedEmployerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockedEmployerTemplate({
    workerFirstName, workerName, lockStartDate, lockExpiryDate, dailyFee, currency, lockDays,
  });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "worker_locked_employer" });
}

export async function sendWorkerLockExtendedWorkerEmail(
  userId: string, to: string, firstName: string, newExpiryDate: Date,
) {
  const { workerLockExtendedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockExtendedWorkerTemplate({ firstName, newExpiryDate });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "worker_lock_extended_worker" });
}

export async function sendWorkerLockExtendedEmployerEmail(
  userId: string, to: string, workerFirstName: string, workerName: string,
  newExpiryDate: Date, dailyFee: number, currency: string, newTotalDays: number,
) {
  const { workerLockExtendedEmployerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockExtendedEmployerTemplate({
    workerFirstName, workerName, newExpiryDate, dailyFee, currency, newTotalDays,
  });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "worker_lock_extended_employer" });
}

export async function sendWorkerLockReleasedWorkerEmail(userId: string, to: string, firstName: string) {
  const { workerLockReleasedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockReleasedWorkerTemplate({ firstName });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "worker_lock_released_worker" });
}

export async function sendWorkerLockReleasedEmployerEmail(
  userId: string, to: string, workerName: string, totalBilled: number, currency: string, totalDaysBilled: number,
) {
  const { workerLockReleasedEmployerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockReleasedEmployerTemplate({
    workerName, totalBilled, currency, totalDaysBilled,
  });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "worker_lock_released_employer" });
}

export async function sendLockExpiryWarningEmail(
  userId: string, to: string, workerFirstName: string, lockExpiryDate: Date, lockId: string,
) {
  const { lockExpiryWarningTemplate } = await import("./templates");
  const { subject, html, text } = lockExpiryWarningTemplate({ workerFirstName, lockExpiryDate, lockId });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "lock_expiry_warning" });
}

export async function sendLockExpiredWorkerEmail(userId: string, to: string, firstName: string) {
  const { lockExpiredWorkerTemplate } = await import("./templates");
  const { subject, html, text } = lockExpiredWorkerTemplate({ firstName });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "lock_expired_worker" });
}

export async function sendLockExpiredEmployerEmail(
  userId: string, to: string, workerName: string, totalBilled: number, currency: string, totalDaysBilled: number,
) {
  const { lockExpiredEmployerTemplate } = await import("./templates");
  const { subject, html, text } = lockExpiredEmployerTemplate({
    workerName, totalBilled, currency, totalDaysBilled,
  });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "lock_expired_employer" });
}

// ── Contact form ──────────────────────────────────────────────

export async function sendContactFormEmail(
  senderName: string, senderEmail: string, subject: string, message: string,
) {
  const { contactFormTemplate } = await import("./templates");
  const tpl = contactFormTemplate({ name: senderName, email: senderEmail, subject, message });
  await sendEmail({
    to:         OWNER_EMAIL,
    from:       FROM_HELLO,
    replyTo:    senderEmail,
    emailType:  "GENERAL",
    subject:    tpl.subject,
    html:       tpl.html,
    text:       tpl.text,
    templateId: "contact_form",
  });
}

export async function sendContactConfirmationEmail(to: string, name: string) {
  const { contactConfirmationTemplate } = await import("./templates");
  const { subject, html, text } = contactConfirmationTemplate({ name });
  await sendEmail({ to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "contact_confirmation" });
}

// ── Subscription lifecycle ────────────────────────────────────

export async function sendSubscriptionCanceledEmail(userId: string, to: string, name: string, accessUntil: Date) {
  const { subscriptionCanceledTemplate } = await import("./templates");
  const { subject, html, text } = subscriptionCanceledTemplate({ name, accessUntil });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "subscription_canceled", variables: { accessUntil: accessUntil.toISOString() } });
}

export async function sendSubscriptionExpiryWarningEmail(userId: string, to: string, name: string, accessUntil: Date) {
  const { subscriptionExpiryWarningTemplate } = await import("./templates");
  const { subject, html, text } = subscriptionExpiryWarningTemplate({ name, accessUntil });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "GENERAL", subject, html, text,
    templateId: "subscription_expiry_warning", variables: { accessUntil: accessUntil.toISOString() } });
}

// ── Job archived → pending applicants ─────────────────────────

export async function sendJobClosedApplicantEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
) {
  const { jobClosedApplicantTemplate } = await import("./templates");
  const { subject, html, text } = jobClosedApplicantTemplate({ firstName, jobTitle, companyName });
  await sendEmail({ userId, to, from: FROM_NO_REPLY, emailType: "GENERAL", subject, html, text,
    templateId: "job_closed_applicant", variables: { jobTitle, companyName } });
}

// ── Job match recommendation (SUPPRESSIBLE — see lib/unsubscribe.ts) ──────────

export async function sendJobMatchEmail(
  userId: string, to: string, firstName: string, jobTitle: string, matchPct: number,
) {
  const { getOrCreateUnsubscribeToken, buildUnsubscribeUrl } = await import("../../lib/unsubscribe");
  const unsubscribeUrl = buildUnsubscribeUrl(await getOrCreateUnsubscribeToken(userId));

  const appUrl = process.env.FRONTEND_URL ?? "https://directhire.cc";
  // No ?open=<jobId> deep-link — checked frontend/src/app/(app)/worker/jobs/page.tsx,
  // it doesn't read that query param (never implemented), so this links to the
  // plain feed rather than a URL that silently does nothing.
  const { jobMatchTemplate } = await import("./templates");
  const { subject, html, text } = jobMatchTemplate({
    firstName, jobTitle, matchPct, jobsUrl: `${appUrl}/worker/jobs`, unsubscribeUrl,
  });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "JOB_MATCH", subject, html, text,
    templateId: "job_match", variables: { jobTitle, matchPct } });
}

// ── Invoice receipt (TRANSACTIONAL — never suppressible, see lib/unsubscribe.ts) ──

export async function sendInvoiceReceiptEmail(opts: {
  userId:        string;
  to:            string;
  firstName:     string;
  invoiceNumber: string;
  amountDisplay: string;
  description:   string;
  isCredit:      boolean;
  pdfBuffer:     Buffer;
  paymentsPath:  string; // e.g. "/worker/payments" or "/employer/subscription"
}) {
  const appUrl = process.env.FRONTEND_URL ?? "https://directhire.cc";
  const { invoiceReceiptTemplate } = await import("./templates");
  const { subject, html, text } = invoiceReceiptTemplate({
    firstName:     opts.firstName,
    invoiceNumber: opts.invoiceNumber,
    amountDisplay: opts.amountDisplay,
    description:   opts.description,
    isCredit:      opts.isCredit,
    paymentsUrl:   `${appUrl}${opts.paymentsPath}`,
  });
  await sendEmail({
    userId:      opts.userId,
    to:          opts.to,
    from:        FROM_NO_REPLY,
    emailType:   "INVOICE_RECEIPT",
    subject, html, text,
    templateId:  "invoice_receipt",
    variables:   { invoiceNumber: opts.invoiceNumber, isCredit: opts.isCredit },
    attachments: [{ filename: `${opts.invoiceNumber}.pdf`, content: opts.pdfBuffer }],
  });
}

// ── Health check alert / recovery (TRANSACTIONAL — never suppressible, see lib/unsubscribe.ts) ──
// No userId — these go to OWNER_EMAIL (site operator), same as ADMIN_NEW_SUBMISSION.

export async function sendHealthCheckAlertEmail(checkName: string, error: string, timestamp: string) {
  const { healthCheckAlertTemplate } = await import("./templates");
  const { subject, html, text } = healthCheckAlertTemplate({ checkName, error, timestamp });
  await sendEmail({ to: OWNER_EMAIL, from: FROM_NO_REPLY, emailType: "SYSTEM_HEALTH_ALERT", subject, html, text,
    templateId: "health_check_alert", variables: { check: checkName, kind: "alert" } });
}

export async function sendHealthCheckRecoveryEmail(checkName: string, timestamp: string) {
  const { healthCheckRecoveryTemplate } = await import("./templates");
  const { subject, html, text } = healthCheckRecoveryTemplate({ checkName, timestamp });
  await sendEmail({ to: OWNER_EMAIL, from: FROM_NO_REPLY, emailType: "SYSTEM_HEALTH_ALERT", subject, html, text,
    templateId: "health_check_recovery", variables: { check: checkName, kind: "recovery" } });
}

// ── Part B — admin-mediated screening interview ─────────────────────────────
// "Not selected" reuses sendApplicationRejectedWorkerEmail as-is (Phase 2) —
// its wording ("we will not be moving forward with your application at this
// time") is already generic enough to fit this outcome without a new
// template. "You've been hired" already exists too
// (sendApplicationAcceptedWorkerEmail, fired by confirmHire, unchanged).

export async function sendApplicationInterviewInProgressEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
) {
  const { applicationInterviewInProgressTemplate } = await import("./templates");
  const { subject, html, text } = applicationInterviewInProgressTemplate({ firstName, jobTitle, companyName });
  await sendEmail({ userId, to, from: FROM_HELLO, emailType: "APPLICATION_INTERVIEW_REQUESTED", subject, html, text,
    templateId: "application_interview_in_progress", variables: { firstName, jobTitle, companyName } });
}
