// src/services/email/index.ts
// Email service with multi-provider support: Resend | SendGrid | SMTP
// Logs every send attempt to the database.

import type { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import type { EmailType } from "../../types";

// ── Provider interface ────────────────────────────────────────
interface SendParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface EmailProvider {
  send(params: SendParams): Promise<{ messageId?: string }>;
}

// ── SMTP / Nodemailer provider ────────────────────────────────
class SmtpProvider implements EmailProvider {
  async send(params: SendParams) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST    ?? "localhost",
      port:   parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    const info = await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
      to:      params.to,
      replyTo: params.replyTo,
      subject: params.subject,
      html:    params.html,
      text:    params.text,
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
      from:    `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>`,
      to:      params.to,
      replyTo: params.replyTo,
      subject: params.subject,
      html:    params.html,
    });
    if (error) throw new Error(error.message);
    return { messageId: data?.id };
  }
}

// ── Console provider (tests / CI) ─────────────────────────────
class ConsoleProvider implements EmailProvider {
  async send(params: SendParams) {
    console.log("📧 [EMAIL]", {
      to:      params.to,
      subject: params.subject,
      preview: params.text?.slice(0, 120) ?? "(html only)",
    });
    return { messageId: `console-${Date.now()}` };
  }
}

function getProvider(): EmailProvider {
  switch (process.env.EMAIL_PROVIDER) {
    case "resend":   return new ResendProvider();
    case "smtp":     return new SmtpProvider();
    default:         return new ConsoleProvider();
  }
}

// ── Main send function ────────────────────────────────────────
export interface SendEmailOptions {
  userId?:     string;
  to:          string;
  replyTo?:    string;
  emailType:   EmailType;
  subject:     string;
  html:        string;
  text?:       string;
  templateId?: string;
  variables?:  Record<string, unknown>;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  // DB logging is best-effort — if the Prisma client doesn't have emailLog (e.g. after
  // a --no-engine generate), we still want the email to be sent and the request to succeed.
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
      to:      opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html:    opts.html,
      text:    opts.text,
    });

    if (logId) {
      await prisma.emailLog.update({
        where: { id: logId },
        data: { status: "SENT", providerMsgId: result.messageId, sentAt: new Date() },
      }).catch((e: Error) => console.error("[sendEmail] Failed to update log to SENT:", e.message));
    }
  } catch (error) {
    if (logId) {
      await prisma.emailLog.update({
        where: { id: logId },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Unknown error" },
      }).catch((e: Error) => console.error("[sendEmail] Failed to update log to FAILED:", e.message));
    }
    console.error("[Email send failed]", error);
    // Don't rethrow — email failure should not crash request
  }
}

// ── Template-based email helpers ──────────────────────────────
// Importable send functions for each email type

export async function sendOtpVerification(
  userId: string,
  to: string,
  code: string,
  expiresMinutes: number
) {
  const { otpVerificationTemplate } = await import("./templates");
  const { subject, html, text } = otpVerificationTemplate({ code, expiresMinutes });
  await sendEmail({ userId, to, emailType: "EMAIL_VERIFICATION", subject, html, text });
}

export async function sendWelcomeEmail(
  userId: string,
  to: string,
  firstName: string,
  role: "WORKER" | "EMPLOYER"
) {
  const { welcomeTemplate } = await import("./templates");
  const { subject, html, text } = welcomeTemplate({ firstName, role });
  await sendEmail({ userId, to, emailType: "WELCOME", subject, html, text });
}

export async function sendEmailVerification(
  userId: string,
  to: string,
  verifyUrl: string
) {
  const { emailVerificationTemplate } = await import("./templates");
  const { subject, html, text } = emailVerificationTemplate({ verifyUrl });
  await sendEmail({ userId, to, emailType: "EMAIL_VERIFICATION", subject, html, text });
}

export async function sendPasswordReset(
  userId: string,
  to: string,
  resetUrl: string
) {
  const { passwordResetTemplate } = await import("./templates");
  const { subject, html, text } = passwordResetTemplate({ resetUrl });
  await sendEmail({ userId, to, emailType: "PASSWORD_RESET", subject, html, text });
}

export async function sendEmailVerified(
  userId: string,
  to: string,
  firstName: string,
  role: "WORKER" | "EMPLOYER"
) {
  const { emailVerifiedTemplate } = await import("./templates");
  const { subject, html, text } = emailVerifiedTemplate({ firstName, role });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text });
}

export async function sendOnboardingSubmitted(
  userId: string,
  to: string,
  name: string,
  role: "WORKER" | "EMPLOYER"
) {
  const { onboardingSubmittedTemplate } = await import("./templates");
  const { subject, html, text } = onboardingSubmittedTemplate({ name, role });
  await sendEmail({ userId, to, emailType: "ONBOARDING_SUBMITTED", subject, html, text });
}

export async function sendAccountApproved(
  userId: string,
  to: string,
  firstName: string,
  role: "WORKER" | "EMPLOYER"
) {
  const { accountApprovedTemplate } = await import("./templates");
  const { subject, html, text } = accountApprovedTemplate({ firstName, role });
  await sendEmail({ userId, to, emailType: "ACCOUNT_APPROVED", subject, html, text,
    templateId: "account_approved", variables: { firstName, role } });
}

export async function sendAccountRejected(
  userId: string,
  to: string,
  firstName: string,
  reason: string
) {
  const { accountRejectedTemplate } = await import("./templates");
  const { subject, html, text } = accountRejectedTemplate({ firstName, reason });
  await sendEmail({ userId, to, emailType: "ACCOUNT_REJECTED", subject, html, text,
    templateId: "account_rejected", variables: { firstName } });
}

export async function sendAccountSuspended(
  userId: string,
  to: string,
  firstName: string
) {
  const { accountSuspendedTemplate } = await import("./templates");
  const { subject, html, text } = accountSuspendedTemplate({ firstName });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "account_suspended", variables: { firstName } });
}

export async function sendAccountReinstated(
  userId: string,
  to: string,
  firstName: string
) {
  const { accountReinstatedTemplate } = await import("./templates");
  const { subject, html, text } = accountReinstatedTemplate({ firstName });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "account_reinstated", variables: { firstName } });
}

export async function sendNeedsChanges(
  userId: string,
  to: string,
  name: string,
  changes: string
) {
  const { needsChangesTemplate } = await import("./templates");
  const { subject, html, text } = needsChangesTemplate({ name, changes });
  await sendEmail({ userId, to, emailType: "ACCOUNT_NEEDS_CHANGES", subject, html, text });
}

export async function sendAdminNewSubmission(
  submitterEmail: string,
  submitterRole: string,
  submitterName: string
) {
  const adminEmail = process.env.ADMIN_SEED_EMAIL!;
  const appUrl     = process.env.FRONTEND_URL ?? "https://directhire.io";
  const { adminNewSubmissionTemplate } = await import("./templates");
  const { subject, html, text } = adminNewSubmissionTemplate({
    submitterEmail,
    submitterRole,
    submitterName,
    adminUrl: `${appUrl}/admin/approvals`,
  });
  await sendEmail({
    to: adminEmail,
    emailType: "ADMIN_NEW_SUBMISSION",
    subject,
    html,
    text,
  });
}

export async function sendJobSubmittedEmail(
  userId: string,
  to: string,
  employerName: string,
  jobTitle: string
) {
  const { jobSubmittedTemplate } = await import("./templates");
  const { subject, html, text } = jobSubmittedTemplate({ employerName, jobTitle });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "job_submitted", variables: { employerName, jobTitle } });
}

export async function sendJobApprovedEmail(
  userId: string,
  to: string,
  firstName: string,
  jobTitle: string,
  jobId: string,
) {
  const { jobApprovedTemplate } = await import("./templates");
  const { subject, html, text } = jobApprovedTemplate({ firstName, jobTitle, jobId });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "job_approved", variables: { firstName, jobTitle, jobId } });
}

export async function sendJobRejectedEmail(
  userId: string,
  to: string,
  jobTitle: string,
  jobId: string,
  reason: string,
) {
  const { jobRejectedTemplate } = await import("./templates");
  const { subject, html, text } = jobRejectedTemplate({ jobTitle, jobId, reason });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "job_rejected", variables: { jobTitle, jobId } });
}

export async function sendJobChangesRequestedEmail(
  userId: string,
  to: string,
  jobTitle: string,
  jobId: string,
  notes: string,
) {
  const { jobChangesRequestedTemplate } = await import("./templates");
  const { subject, html, text } = jobChangesRequestedTemplate({ jobTitle, jobId, notes });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "job_changes_requested", variables: { jobTitle, jobId } });
}

export async function sendNewApplicationEmail(
  employerUserId: string,
  to: string,
  jobTitle: string,
  companyName: string,
  applicationId: string,
  jobId: string,
) {
  const { newApplicationTemplate } = await import("./templates");
  const { subject, html, text } = newApplicationTemplate({ jobTitle, companyName, applicationId, jobId });
  await sendEmail({ userId: employerUserId, to, emailType: "APPLICATION_RECEIVED", subject, html, text,
    templateId: "new_application", variables: { jobTitle, companyName, applicationId, jobId } });
}

export async function sendApplicationConfirmationEmail(data: {
  workerUserId:   string;
  workerEmail:    string;
  workerFirstName: string;
  jobTitle:       string;
  companyName:    string;
  applicationId:  string;
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
    emailType:  "APPLICATION_RECEIVED",
    subject,
    html,
    text,
    templateId: "application_confirmation",
    variables:  { jobTitle: data.jobTitle, companyName: data.companyName, applicationId: data.applicationId },
  });
}

export async function sendApplicationWithdrawnEmail(
  employerUserId: string,
  to: string,
  workerName: string,
  jobTitle: string,
  companyName: string,
) {
  const { applicationWithdrawnTemplate } = await import("./templates");
  const { subject, html, text } = applicationWithdrawnTemplate({ workerName, jobTitle, companyName });
  await sendEmail({ userId: employerUserId, to, emailType: "GENERAL", subject, html, text,
    templateId: "application_withdrawn", variables: { workerName, jobTitle, companyName } });
}

export async function sendApplicationShortlistedEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
) {
  const { applicationShortlistedTemplate } = await import("./templates");
  const { subject, html, text } = applicationShortlistedTemplate({ firstName, jobTitle, companyName });
  await sendEmail({ userId, to, emailType: "APPLICATION_SHORTLISTED", subject, html, text,
    templateId: "application_shortlisted", variables: { firstName, jobTitle, companyName } });
}

export async function sendApplicationInterviewedEmail(
  userId: string,
  to: string,
  firstName: string,
  jobTitle: string,
  companyName: string,
  applicationId: string,
  interviewInstructions?: string,
) {
  const { applicationInterviewedTemplate } = await import("./templates");
  const { subject, html, text } = applicationInterviewedTemplate({
    firstName, jobTitle, companyName, applicationId, interviewInstructions,
  });
  await sendEmail({ userId, to, emailType: "APPLICATION_INTERVIEW_REQUESTED", subject, html, text,
    templateId: "application_interviewed", variables: { firstName, jobTitle, companyName, applicationId } });
}

export async function sendApplicationAcceptedWorkerEmail(
  userId: string, to: string, firstName: string, jobTitle: string, companyName: string,
) {
  const { applicationAcceptedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = applicationAcceptedWorkerTemplate({ firstName, jobTitle, companyName });
  await sendEmail({ userId, to, emailType: "APPLICATION_ACCEPTED", subject, html, text,
    templateId: "application_accepted_worker", variables: { firstName, jobTitle, companyName } });
}

export async function sendApplicationAcceptedEmployerEmail(
  userId: string, to: string, workerName: string,
) {
  const { applicationAcceptedEmployerTemplate } = await import("./templates");
  const { subject, html, text } = applicationAcceptedEmployerTemplate({ workerName });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "application_accepted_employer", variables: { workerName } });
}

export async function sendHireConfirmationEmployerEmail(data: {
  employerUserId:  string;
  employerEmail:   string;
  employerName:    string;
  workerName:      string;
  jobTitle:        string;
  startDate?:      string;
  contractType?:   string;
  offeredSalary?:  string;
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
    emailType:  "APPLICATION_ACCEPTED",
    subject,
    html,
    text,
    templateId: "hire_confirmation_employer",
    variables:  { workerName: data.workerName, jobTitle: data.jobTitle },
  });
}

export async function sendApplicationRejectedWorkerEmail(
  userId: string, to: string, jobTitle: string, companyName: string,
) {
  const { applicationRejectedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = applicationRejectedWorkerTemplate({ jobTitle, companyName });
  await sendEmail({ userId, to, emailType: "APPLICATION_REJECTED", subject, html, text,
    templateId: "application_rejected_worker", variables: { jobTitle, companyName } });
}

export async function sendJobResubmittedNotification(
  employerName: string,
  company: string,
  jobTitle: string,
  notes: string,
) {
  const adminEmail = process.env.ADMIN_SEED_EMAIL!;
  const { jobResubmittedNotificationTemplate } = await import("./templates");
  const { subject, html, text } = jobResubmittedNotificationTemplate({
    employerName, company, jobTitle, notes,
  });
  await sendEmail({
    to:           adminEmail,
    emailType:    "ADMIN_NEW_SUBMISSION",
    subject,
    html,
    text,
    templateId:   "job_resubmitted_notification",
    variables:    { employerName, company, jobTitle },
  });
}

export async function sendPostingRightsRevokedEmail(
  userId: string,
  to: string,
) {
  const { postingRightsRevokedTemplate } = await import("./templates");
  const { subject, html, text } = postingRightsRevokedTemplate();
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "posting_rights_revoked" });
}

export async function sendPostingRightsRestoredEmail(
  userId: string,
  to: string,
) {
  const { postingRightsRestoredTemplate } = await import("./templates");
  const { subject, html, text } = postingRightsRestoredTemplate();
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "posting_rights_restored" });
}

export async function sendOnboardingReminder(
  userId: string,
  to: string,
  firstName: string,
  continueUrl: string,
  completionPct: number
) {
  const { onboardingReminderTemplate } = await import("./templates");
  const { subject, html, text } = onboardingReminderTemplate({
    firstName,
    continueUrl,
    completionPct,
  });
  await sendEmail({ userId, to, emailType: "ONBOARDING_REMINDER", subject, html, text });
}

// ── Worker Lock Emails ────────────────────────────────────────────────────────

export async function sendWorkerLockedWorkerEmail(
  userId: string,
  to: string,
  firstName: string,
  lockExpiryDate: Date,
) {
  const { workerLockedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockedWorkerTemplate({ firstName, lockExpiryDate });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "worker_locked_worker" });
}

export async function sendWorkerLockedEmployerEmail(
  userId: string,
  to: string,
  workerFirstName: string,
  workerName: string,
  lockStartDate: Date,
  lockExpiryDate: Date,
  dailyFee: number,
  currency: string,
  lockDays: number,
) {
  const { workerLockedEmployerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockedEmployerTemplate({
    workerFirstName, workerName, lockStartDate, lockExpiryDate, dailyFee, currency, lockDays,
  });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "worker_locked_employer" });
}

export async function sendWorkerLockExtendedWorkerEmail(
  userId: string,
  to: string,
  firstName: string,
  newExpiryDate: Date,
) {
  const { workerLockExtendedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockExtendedWorkerTemplate({ firstName, newExpiryDate });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "worker_lock_extended_worker" });
}

export async function sendWorkerLockExtendedEmployerEmail(
  userId: string,
  to: string,
  workerFirstName: string,
  workerName: string,
  newExpiryDate: Date,
  dailyFee: number,
  currency: string,
  newTotalDays: number,
) {
  const { workerLockExtendedEmployerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockExtendedEmployerTemplate({
    workerFirstName, workerName, newExpiryDate, dailyFee, currency, newTotalDays,
  });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "worker_lock_extended_employer" });
}

export async function sendWorkerLockReleasedWorkerEmail(
  userId: string,
  to: string,
  firstName: string,
) {
  const { workerLockReleasedWorkerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockReleasedWorkerTemplate({ firstName });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "worker_lock_released_worker" });
}

export async function sendWorkerLockReleasedEmployerEmail(
  userId: string,
  to: string,
  workerName: string,
  totalBilled: number,
  currency: string,
  totalDaysBilled: number,
) {
  const { workerLockReleasedEmployerTemplate } = await import("./templates");
  const { subject, html, text } = workerLockReleasedEmployerTemplate({
    workerName, totalBilled, currency, totalDaysBilled,
  });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "worker_lock_released_employer" });
}

export async function sendLockExpiryWarningEmail(
  userId: string,
  to: string,
  workerFirstName: string,
  lockExpiryDate: Date,
  lockId: string,
) {
  const { lockExpiryWarningTemplate } = await import("./templates");
  const { subject, html, text } = lockExpiryWarningTemplate({
    workerFirstName, lockExpiryDate, lockId,
  });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "lock_expiry_warning" });
}

export async function sendLockExpiredWorkerEmail(
  userId: string,
  to: string,
  firstName: string,
) {
  const { lockExpiredWorkerTemplate } = await import("./templates");
  const { subject, html, text } = lockExpiredWorkerTemplate({ firstName });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "lock_expired_worker" });
}

export async function sendLockExpiredEmployerEmail(
  userId: string,
  to: string,
  workerName: string,
  totalBilled: number,
  currency: string,
  totalDaysBilled: number,
) {
  const { lockExpiredEmployerTemplate } = await import("./templates");
  const { subject, html, text } = lockExpiredEmployerTemplate({
    workerName, totalBilled, currency, totalDaysBilled,
  });
  await sendEmail({ userId, to, emailType: "GENERAL", subject, html, text,
    templateId: "lock_expired_employer" });
}

// ── Contact form ──────────────────────────────────────────────

export async function sendContactFormEmail(
  adminTo: string,
  senderName: string,
  senderEmail: string,
  subject: string,
  message: string,
) {
  const { contactFormTemplate } = await import("./templates");
  const tpl = contactFormTemplate({ name: senderName, email: senderEmail, subject, message });
  await sendEmail({
    to:         adminTo,
    replyTo:    senderEmail,
    emailType:  "GENERAL",
    subject:    tpl.subject,
    html:       tpl.html,
    text:       tpl.text,
    templateId: "contact_form",
  });
}

export async function sendContactConfirmationEmail(
  to: string,
  name: string,
) {
  const { contactConfirmationTemplate } = await import("./templates");
  const { subject, html, text } = contactConfirmationTemplate({ name });
  await sendEmail({ to, emailType: "GENERAL", subject, html, text,
    templateId: "contact_confirmation" });
}
