// src/services/email/templates.ts
// Production-quality HTML email templates
// Each returns { subject, html, text }

interface TemplateResult {
  subject: string;
  html: string;
  text: string;
}

const APP_NAME    = process.env.APP_NAME    ?? "Direct Hire";
const APP_URL     = process.env.FRONTEND_URL ?? "https://directhire.io";
const BRAND_COLOR = "#1848CC";
const BRAND_BG    = "#08142A";

// ── Base layout ───────────────────────────────────────────────
// unsubscribeUrl is only ever passed by templates for non-transactional
// EmailTypes (currently just onboardingReminderTemplate — see
// lib/unsubscribe.ts's classification) — every other template call site
// omits it and gets the plain footer, unchanged.
function layout(body: string, opts?: { unsubscribeUrl?: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FF;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FF;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #E2E8F0;">
      <!-- Header -->
      <tr>
        <td style="background:${BRAND_BG};padding:28px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${APP_NAME}</span>
                <span style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:700;letter-spacing:1px;margin-left:8px;">AI GLOBAL</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Body -->
      <tr><td style="padding:40px;">${body}</td></tr>
      <!-- Footer -->
      <tr>
        <td style="background:#F7F9FF;padding:24px 40px;border-top:1px solid #E2E8F0;">
          <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;line-height:1.6;">
            © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.<br/>
            <a href="${APP_URL}/privacy" style="color:#1848CC;text-decoration:none;">Privacy Policy</a> ·
            <a href="${APP_URL}/terms" style="color:#1848CC;text-decoration:none;">Terms of Service</a>${opts?.unsubscribeUrl ? ` ·
            <a href="${opts.unsubscribeUrl}" style="color:#1848CC;text-decoration:none;">Unsubscribe</a>` : ""}
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function btn(url: string, label: string, color = BRAND_COLOR): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr>
      <td style="background:${color};border-radius:12px;">
        <a href="${url}" style="display:inline-block;padding:14px 32px;color:#fff;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:0.2px;">${label} →</a>
      </td>
    </tr>
  </table>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#08142A;letter-spacing:-0.5px;line-height:1.2;">${text}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7;">${text}</p>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0;" />`;
}

function badge(text: string, color = BRAND_COLOR): string {
  return `<span style="display:inline-block;background:${color}15;color:${color};font-size:12px;font-weight:700;padding:4px 12px;border-radius:99px;letter-spacing:0.5px;">${text}</span>`;
}

// ── Templates ─────────────────────────────────────────────────

export function welcomeTemplate(vars: {
  firstName: string;
  role: "WORKER" | "EMPLOYER";
}): TemplateResult {
  const isWorker = vars.role === "WORKER";
  const html = layout(`
    ${badge(isWorker ? "WORKER REGISTRATION" : "EMPLOYER REGISTRATION")}
    <br/><br/>
    ${h1(`Welcome to ${APP_NAME}, ${vars.firstName}!`)}
    ${p(`We're excited to have you on board. You've successfully created your ${isWorker ? "worker" : "employer"} account.`)}
    ${p(isWorker
      ? "Complete your profile to get matched with top global employers. The more complete your profile, the higher your AI match score."
      : "Complete your company profile to start accessing AI-ranked global talent and post your first job."
    )}
    ${btn(`${APP_URL}/${isWorker ? "worker" : "employer"}/onboarding`, "Complete Your Profile")}
    ${divider()}
    ${p(`Need help? Reply to this email or visit our <a href="${APP_URL}/support" style="color:${BRAND_COLOR};">support centre</a>.`)}
  `);
  return {
    subject: `Welcome to ${APP_NAME} — Let's get you set up, ${vars.firstName}`,
    html,
    text: `Welcome to ${APP_NAME}, ${vars.firstName}! Complete your profile at ${APP_URL}/${isWorker ? "worker" : "employer"}/onboarding`,
  };
}

export function otpVerificationTemplate(vars: { code: string; expiresMinutes: number }): TemplateResult {
  const html = layout(`
    ${badge("EMAIL VERIFICATION")}
    <br/><br/>
    ${h1("Your verification code")}
    ${p("Use the code below to verify your email address. Do not share this code with anyone.")}
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td style="background:#F7F9FF;border:2px solid #E2E8F0;border-radius:16px;padding:24px 48px;text-align:center;">
          <span style="font-family:'Courier New',Courier,monospace;font-size:42px;font-weight:800;color:#08142A;letter-spacing:10px;display:block;">${vars.code}</span>
        </td>
      </tr>
    </table>
    ${p(`This code expires in <strong>${vars.expiresMinutes} minutes.</strong>`)}
    ${p("If you did not request this, ignore this email. Your account will remain unchanged.")}
    ${divider()}
    ${p("For security, never share this code with anyone — Direct Hire staff will never ask for it.")}
  `);
  return {
    subject: "Your DirectHire verification code",
    html,
    text: `Your DirectHire verification code is: ${vars.code}\n\nExpires in ${vars.expiresMinutes} minutes. Do not share this code.`,
  };
}

export function passwordResetTemplate(vars: { resetUrl: string }): TemplateResult {
  const html = layout(`
    ${badge("PASSWORD RESET")}
    <br/><br/>
    ${h1("Reset your password")}
    ${p("We received a request to reset your password. Click the button below to create a new password.")}
    ${p("<strong>This link expires in 1 hour.</strong>")}
    ${btn(vars.resetUrl, "Reset Password", "#DC2626")}
    ${divider()}
    ${p("If you didn't request a password reset, please ignore this email. Your password will not be changed.")}
  `);
  return {
    subject: `Reset your ${APP_NAME} password`,
    html,
    text: `Reset your password: ${vars.resetUrl}`,
  };
}

export function onboardingSubmittedTemplate(vars: {
  name: string;
  role: "WORKER" | "EMPLOYER";
}): TemplateResult {
  const html = layout(`
    ${badge("APPLICATION SUBMITTED")}
    <br/><br/>
    ${h1("Your application has been submitted!")}
    ${p(`Hi ${vars.name}, we've received your ${vars.role === "WORKER" ? "worker profile" : "company registration"} and it is now under review.`)}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#F7F9FF;border-radius:12px;margin:20px 0;">
      <tr>
        <td>
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">What happens next</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">✅ &nbsp;Application received and logged</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">🔍 &nbsp;Manual review by our team (24–48 hrs)</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">📧 &nbsp;You'll receive an approval or feedback email</p>
          <p style="margin:0;font-size:14px;color:#334155;">🚀 &nbsp;Profile goes live upon approval</p>
        </td>
      </tr>
    </table>
    ${btn(`${APP_URL}/${vars.role === "WORKER" ? "worker" : "employer"}/dashboard`, "View Your Dashboard")}
  `);
  return {
    subject: `Application submitted — we're reviewing it now`,
    html,
    text: `Hi ${vars.name}, your application has been submitted and is under review.`,
  };
}

export function emailVerifiedTemplate(vars: {
  firstName: string;
  role: "WORKER" | "EMPLOYER";
}): TemplateResult {
  const dashboardUrl = `${APP_URL}/${vars.role === "WORKER" ? "worker" : "employer"}/dashboard`;
  const html = layout(`
    ${badge("✓ EMAIL VERIFIED", "#059669")}
    <br/><br/>
    ${h1("Your email is verified!")}
    ${p(`Hi ${vars.firstName}, your email address has been confirmed. Your account is now under review by our team.`)}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#F7F9FF;border-radius:12px;margin:20px 0;">
      <tr>
        <td>
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">What's next</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">🔍 &nbsp;Our team reviews your application (24–48 hrs)</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">📋 &nbsp;Complete your profile while you wait</p>
          <p style="margin:0;font-size:14px;color:#334155;">📧 &nbsp;We'll email you once your account is approved</p>
        </td>
      </tr>
    </table>
    ${btn(dashboardUrl, "Go to Dashboard")}
  `);
  return {
    subject: `Email verified — your account is under review`,
    html,
    text: `Hi ${vars.firstName}, your email has been verified. Your account is now under review. We'll notify you once approved.`,
  };
}

export function accountApprovedTemplate(vars: {
  firstName: string;
  role: "WORKER" | "EMPLOYER";
}): TemplateResult {
  const isWorker = vars.role === "WORKER";
  const loginUrl = `${APP_URL}/login`;
  const html = layout(`
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="width:52px;height:52px;background:#D1FAE5;border-radius:50%;text-align:center;vertical-align:middle;">
          <span style="font-size:26px;line-height:52px;">✓</span>
        </td>
      </tr>
    </table>
    ${badge("✓ ACCOUNT APPROVED", "#059669")}
    <br/><br/>
    ${h1(`Welcome, ${vars.firstName}! Your account is approved.`)}
    ${p("Your account has been reviewed and <strong>approved</strong>. You now have full access to the DirectHire platform.")}
    ${p(isWorker
      ? "Complete your profile to appear in search results and get matched with top global employers."
      : "You can now post jobs and search for qualified candidates from our global talent pool."
    )}
    ${btn(loginUrl, "Log in to DirectHire", "#059669")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your DirectHire account is approved`,
    html,
    text: `Welcome, ${vars.firstName}! Your account has been approved. Log in at: ${loginUrl}`,
  };
}

export function accountRejectedTemplate(vars: {
  firstName: string;
  reason: string;
}): TemplateResult {
  const html = layout(`
    ${badge("APPLICATION UPDATE", "#64748B")}
    <br/><br/>
    ${h1(`Hi ${vars.firstName}, we've reviewed your application`)}
    ${p("We appreciate you taking the time to apply to DirectHire.")}
    ${p("After careful review, we're unable to approve your account at this time.")}
    ${p(`If you have questions or believe this decision was made in error, please reach out to us directly at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>.`)}
    ${divider()}
    ${p(`<small>You are welcome to re-apply in the future.</small>`)}
  `);
  return {
    subject: `Update on your DirectHire application`,
    html,
    text: `Hi ${vars.firstName}, we've reviewed your application and are unable to approve it at this time. Reason: ${vars.reason}. Questions? Contact support@directhire.cc`,
  };
}

export function accountSuspendedTemplate(vars: {
  firstName: string;
}): TemplateResult {
  const html = layout(`
    ${badge("ACCOUNT NOTICE", "#64748B")}
    <br/><br/>
    ${h1(`Hi ${vars.firstName}, your account has been suspended`)}
    ${p("Your access to DirectHire has been temporarily suspended pending a review of your account.")}
    ${p("If you believe this is an error, please reach out to our support team and we will look into it as quickly as possible.")}
    ${btn("mailto:support@directhire.cc", "Contact Support", "#64748B")}
    ${divider()}
    ${p(`Email us directly at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your DirectHire account has been suspended`,
    html,
    text: `Hi ${vars.firstName}, your DirectHire account has been temporarily suspended. If you believe this is an error, contact support@directhire.cc`,
  };
}

export function accountReinstatedTemplate(vars: {
  firstName: string;
}): TemplateResult {
  const loginUrl = `${APP_URL}/login`;
  const html = layout(`
    ${badge("✓ ACCOUNT REINSTATED", "#0090FF")}
    <br/><br/>
    ${h1(`Welcome back, ${vars.firstName}!`)}
    ${p("Your DirectHire account is active again. You can now log in and access all platform features.")}
    ${btn(loginUrl, "Log in to DirectHire", "#0090FF")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your DirectHire account has been reinstated`,
    html,
    text: `Hi ${vars.firstName}, your DirectHire account is active again. Log in at: ${loginUrl}`,
  };
}

export function needsChangesTemplate(vars: {
  name: string;
  changes: string;
}): TemplateResult {
  const html = layout(`
    ${badge("ACTION REQUIRED", "#D97706")}
    <br/><br/>
    ${h1(`Hi ${vars.name}, your profile needs a few updates`)}
    ${p("Our review team has requested the following changes before your account can be approved:")}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#FFFBEB;border-radius:12px;border-left:4px solid #D97706;margin:20px 0;">
      <tr><td>
        <p style="margin:0;font-size:14px;color:#78350F;line-height:1.7;">${vars.changes}</p>
      </td></tr>
    </table>
    ${btn(`${APP_URL}/worker/onboarding`, "Update My Profile", "#D97706")}
    ${p("Once you've made the changes, re-submit your profile for review.")}
  `);
  return {
    subject: `Action required: Updates needed for your ${APP_NAME} profile`,
    html,
    text: `Hi ${vars.name}, your profile needs updates: ${vars.changes}`,
  };
}

export function adminNewSubmissionTemplate(vars: {
  submitterEmail: string;
  submitterRole: string;
  submitterName: string;
  adminUrl: string;
}): TemplateResult {
  const html = layout(`
    ${badge("NEW SUBMISSION", "#7C3AED")}
    <br/><br/>
    ${h1("New application requires review")}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#F7F9FF;border-radius:12px;margin:20px 0;">
      <tr><td>
        <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Name:</strong> ${vars.submitterName}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Email:</strong> ${vars.submitterEmail}</p>
        <p style="margin:0;font-size:14px;color:#334155;"><strong>Role:</strong> ${vars.submitterRole}</p>
      </td></tr>
    </table>
    ${btn(vars.adminUrl, "Review in Admin Panel", "#7C3AED")}
  `);
  return {
    subject: `[Admin] New ${vars.submitterRole} application — ${vars.submitterName}`,
    html,
    text: `New ${vars.submitterRole} application from ${vars.submitterName} (${vars.submitterEmail}). Review at: ${vars.adminUrl}`,
  };
}

export function jobSubmittedTemplate(vars: {
  employerName: string;
  jobTitle: string;
}): TemplateResult {
  const html = layout(`
    ${badge("JOB POST SUBMITTED", "#7C3AED")}
    <br/><br/>
    ${h1(`Your job post has been submitted, ${vars.employerName}!`)}
    ${p(`<strong>"${vars.jobTitle}"</strong> has been submitted for review. Our moderation team will check it and get back to you shortly.`)}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#F7F9FF;border-radius:12px;margin:20px 0;">
      <tr>
        <td>
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">What happens next</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">🔍 &nbsp;Our team reviews the job post (usually within 24 hours)</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">✅ &nbsp;Once approved, it goes live and workers can apply</p>
          <p style="margin:0;font-size:14px;color:#334155;">📧 &nbsp;You'll receive an email when the review is complete</p>
        </td>
      </tr>
    </table>
    ${btn(`${APP_URL}/employer/jobs`, "View My Jobs", "#7C3AED")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Job post submitted for review — "${vars.jobTitle}"`,
    html,
    text: `Hi ${vars.employerName}, your job post "${vars.jobTitle}" has been submitted for review. We'll notify you once it's approved.`,
  };
}

export function onboardingReminderTemplate(vars: {
  firstName: string;
  continueUrl: string;
  completionPct: number;
  unsubscribeUrl: string;
}): TemplateResult {
  const html = layout(`
    ${badge("REMINDER")}
    <br/><br/>
    ${h1(`${vars.firstName}, your profile is ${vars.completionPct}% complete`)}
    ${p(`You started your ${APP_NAME} registration but haven't finished yet. Complete your profile to start getting AI-matched to opportunities.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:#E2E8F0;border-radius:99px;height:8px;overflow:hidden;">
          <div style="background:${BRAND_COLOR};width:${vars.completionPct}%;height:8px;border-radius:99px;"></div>
        </td>
      </tr>
    </table>
    <p style="font-size:14px;color:#64748B;text-align:right;margin:8px 0 20px;">${vars.completionPct}% complete</p>
    ${btn(vars.continueUrl, "Continue Registration")}
    ${p("It only takes a few more minutes. Verified profiles get 3× more employer views.")}
  `, { unsubscribeUrl: vars.unsubscribeUrl });
  return {
    subject: `Don't miss out — your profile is ${vars.completionPct}% complete`,
    html,
    text: `Your profile is ${vars.completionPct}% complete. Continue at: ${vars.continueUrl}\n\nUnsubscribe from these reminders: ${vars.unsubscribeUrl}`,
  };
}

// ── Job moderation templates ───────────────────────────────────

export function jobApprovedTemplate(vars: {
  firstName: string;
  jobTitle: string;
  jobId: string;
}): TemplateResult {
  const jobUrl       = `${APP_URL}/jobs/${vars.jobId}`;
  const dashboardUrl = `${APP_URL}/employer/jobs`;
  const html = layout(`
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="width:52px;height:52px;background:#D1FAE5;border-radius:50%;text-align:center;vertical-align:middle;">
          <span style="font-size:26px;line-height:52px;">✓</span>
        </td>
      </tr>
    </table>
    ${badge("✓ APPROVED", "#16A34A")}
    <br/><br/>
    ${h1(`Great news, ${vars.firstName}!`)}
    ${p(`Your job post <strong>"${vars.jobTitle}"</strong> has been reviewed and approved. It's now live on ${APP_NAME}.`)}
    ${btn(jobUrl, "View live post", "#16A34A")}
    ${p("Workers who match your requirements will be notified automatically. You can manage applications from your dashboard.")}
    ${btn(dashboardUrl, "Go to my dashboard")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your job post '${vars.jobTitle}' is now live`,
    html,
    text: `Great news, ${vars.firstName}! Your job post "${vars.jobTitle}" has been approved and is now live at: ${jobUrl}\nWorkers who match your requirements will be notified automatically.`,
  };
}

export function jobRejectedTemplate(vars: {
  jobTitle: string;
  jobId: string;
  reason: string;
}): TemplateResult {
  const editUrl = `${APP_URL}/employer/jobs/${vars.jobId}/edit`;
  const html = layout(`
    ${badge("JOB POST UPDATE", "#64748B")}
    <br/><br/>
    ${h1(`Update on your job post`)}
    ${p(`We reviewed your job post <strong>"${vars.jobTitle}"</strong> and are unable to approve it at this time.`)}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;margin:20px 0;">
      <tr><td>
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${vars.reason}</p>
      </td></tr>
    </table>
    ${p("You can edit your post and resubmit from your dashboard.")}
    ${btn(editUrl, "Edit and resubmit")}
    ${divider()}
    ${p(`Questions? Contact <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Update on your job post '${vars.jobTitle}'`,
    html,
    text: `We reviewed your job post "${vars.jobTitle}" and are unable to approve it at this time.\nReason: ${vars.reason}\nEdit and resubmit: ${editUrl}\nQuestions? Contact support@directhire.cc`,
  };
}

export function jobChangesRequestedTemplate(vars: {
  jobTitle: string;
  jobId: string;
  notes: string;
}): TemplateResult {
  const editUrl = `${APP_URL}/employer/jobs/${vars.jobId}/edit`;
  const html = layout(`
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="width:52px;height:52px;background:#DBEAFE;border-radius:50%;text-align:center;vertical-align:middle;">
          <span style="font-size:26px;line-height:52px;">ℹ</span>
        </td>
      </tr>
    </table>
    ${badge("FEEDBACK", "#1D4ED8")}
    <br/><br/>
    ${h1(`Feedback on your job post`)}
    ${p(`Our moderation team has reviewed <strong>"${vars.jobTitle}"</strong> and has some feedback.`)}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#EFF6FF;border-radius:12px;border-left:4px solid #3B82F6;margin:20px 0;">
      <tr><td>
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1E40AF;text-transform:uppercase;letter-spacing:0.5px;">Changes needed</p>
        <p style="margin:0;font-size:14px;color:#1E3A8A;line-height:1.7;">${vars.notes}</p>
      </td></tr>
    </table>
    ${p("Please make these updates and resubmit.")}
    ${btn(editUrl, "Edit your post", "#1D4ED8")}
  `);
  return {
    subject: `Feedback on your job post '${vars.jobTitle}'`,
    html,
    text: `Our moderation team reviewed "${vars.jobTitle}" and has some feedback.\nChanges needed: ${vars.notes}\nEdit your post: ${editUrl}`,
  };
}

export function jobResubmittedNotificationTemplate(vars: {
  employerName: string;
  company: string;
  jobTitle: string;
  notes: string;
}): TemplateResult {
  const pendingUrl = `${APP_URL}/admin/jobs/pending`;
  const html = layout(`
    ${badge("JOB RESUBMITTED", "#7C3AED")}
    <br/><br/>
    ${h1(`Job post resubmitted`)}
    ${p(`Job post <strong>"${vars.jobTitle}"</strong> by <strong>${vars.company}</strong> (${vars.employerName}) has been resubmitted after changes.`)}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#F7F9FF;border-radius:12px;margin:20px 0;">
      <tr><td>
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Original rejection reason</p>
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${vars.notes}</p>
      </td></tr>
    </table>
    ${btn(pendingUrl, "Review in Admin Panel", "#7C3AED")}
  `);
  return {
    subject: `${vars.employerName} resubmitted a job post`,
    html,
    text: `Job post "${vars.jobTitle}" by ${vars.company} has been resubmitted after changes.\nOriginal rejection reason: ${vars.notes}\nReview it at: ${pendingUrl}`,
  };
}

// ── Worker application status templates ───────────────────────────────────────

export function applicationShortlistedTemplate(vars: {
  firstName:   string;
  jobTitle:    string;
  companyName: string;
}): TemplateResult {
  const html = layout(`
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="width:52px;height:52px;background:#FEF3C7;border-radius:50%;text-align:center;vertical-align:middle;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#D97706" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </td>
      </tr>
    </table>
    ${badge("⭐ SHORTLISTED", "#D97706")}
    <br/><br/>
    ${h1(`Great news, ${vars.firstName}!`)}
    ${p(`You've been shortlisted by <strong>${vars.companyName}</strong> for the <strong>"${vars.jobTitle}"</strong> role.`)}
    ${p("Our hiring team will be reviewing your profile and will be in touch soon.")}
    ${btn(`${APP_URL}/worker/applications`, "View my applications", "#D97706")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `You've been shortlisted for ${vars.jobTitle}`,
    html,
    text: `Great news, ${vars.firstName}! You've been shortlisted by ${vars.companyName} for the "${vars.jobTitle}" role. Our hiring team will be reviewing your profile and will be in touch soon.`,
  };
}

export function applicationInterviewedTemplate(vars: {
  firstName:             string;
  jobTitle:              string;
  companyName:           string;
  applicationId:         string;
  interviewInstructions?: string;
}): TemplateResult {
  const contactUrl = `${APP_URL}/worker/applications/${vars.applicationId}`;
  const instructionsBlock = vars.interviewInstructions
    ? `<table width="100%" cellpadding="16" cellspacing="0" style="background:#EFF6FF;border-radius:12px;border-left:4px solid #3B82F6;margin:20px 0;">
        <tr><td>
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1E40AF;text-transform:uppercase;letter-spacing:0.5px;">Interview instructions</p>
          <p style="margin:0;font-size:14px;color:#1E3A8A;line-height:1.7;">${vars.interviewInstructions}</p>
        </td></tr>
       </table>`
    : "";
  const html = layout(`
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="width:52px;height:52px;background:#CCFBF1;border-radius:50%;text-align:center;vertical-align:middle;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </td>
      </tr>
    </table>
    ${badge("INTERVIEW INVITATION", "#0D9488")}
    <br/><br/>
    ${h1(`Congratulations, ${vars.firstName}!`)}
    ${p(`<strong>${vars.companyName}</strong> would like to interview you for <strong>"${vars.jobTitle}"</strong>.`)}
    ${p("Your contact details have been shared with the employer, and you can now view their contact information in your DirectHire dashboard to arrange your interview.")}
    ${instructionsBlock}
    ${btn(contactUrl, "View contact details", "#0D9488")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Interview invitation — ${vars.jobTitle} at ${vars.companyName}`,
    html,
    text: `Congratulations, ${vars.firstName}! ${vars.companyName} would like to interview you for "${vars.jobTitle}". View contact details at: ${contactUrl}`,
  };
}

export function interviewResponseTemplate(vars: {
  workerName: string;
  jobTitle:   string;
  response:   "ACCEPTED" | "DECLINED";
  message?:   string;
  jobId:      string;
}): TemplateResult {
  const accepted     = vars.response === "ACCEPTED";
  const accentColor  = accepted ? "#0D9488" : "#DC2626";
  const applicantsUrl = `${APP_URL}/employer/jobs/${vars.jobId}/applicants`;
  const messageBlock = vars.message
    ? `<table width="100%" cellpadding="16" cellspacing="0" style="background:#F8FAFC;border-radius:12px;border-left:4px solid ${accentColor};margin:20px 0;">
        <tr><td>
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;">Message from ${vars.workerName}</p>
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${vars.message}</p>
        </td></tr>
       </table>`
    : "";
  const html = layout(`
    ${badge(accepted ? "INTERVIEW ACCEPTED" : "INTERVIEW DECLINED", accentColor)}
    <br/><br/>
    ${h1(accepted
      ? `${vars.workerName} accepted your interview invitation`
      : `${vars.workerName} declined your interview invitation`)}
    ${p(`This is regarding your job posting <strong>"${vars.jobTitle}"</strong>.`)}
    ${messageBlock}
    ${btn(applicantsUrl, "View applicant", accentColor)}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `${vars.workerName} ${accepted ? "accepted" : "declined"} your interview invitation — ${vars.jobTitle}`,
    html,
    text: `${vars.workerName} ${accepted ? "accepted" : "declined"} your interview invitation for "${vars.jobTitle}".${vars.message ? ` Message: ${vars.message}` : ""} View at: ${applicantsUrl}`,
  };
}

export function applicationAcceptedWorkerTemplate(vars: {
  firstName:   string;
  jobTitle:    string;
  companyName: string;
}): TemplateResult {
  const html = layout(`
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="width:52px;height:52px;background:#D1FAE5;border-radius:50%;text-align:center;vertical-align:middle;">
          <span style="font-size:26px;line-height:52px;">✓</span>
        </td>
      </tr>
    </table>
    ${badge("✓ YOU GOT THE JOB", "#16A34A")}
    <br/><br/>
    ${h1(`Congratulations, ${vars.firstName}!`)}
    ${p(`<strong>${vars.companyName}</strong> has accepted your application for <strong>"${vars.jobTitle}"</strong>.`)}
    ${p("They will be in touch with you directly to discuss next steps.")}
    ${btn(`${APP_URL}/worker/applications`, "View my applications", "#16A34A")}
  `);
  return {
    subject: `You got the job — ${vars.jobTitle} at ${vars.companyName}`,
    html,
    text: `Congratulations, ${vars.firstName}! ${vars.companyName} has accepted your application for "${vars.jobTitle}". They will be in touch directly to discuss next steps.`,
  };
}

export function hireConfirmationEmployerTemplate(vars: {
  employerName:     string;
  workerName:       string;
  jobTitle:         string;
  startDate?:       string;
  contractType?:    string;
  offeredSalary?:   string;
  offeredCurrency?: string;
}): TemplateResult {
  const detailRows = [
    vars.offeredSalary ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:14px;color:#64748B;width:140px;">Offered salary</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:14px;font-weight:600;color:#08142A;">${vars.offeredCurrency ?? "USD"} ${parseFloat(vars.offeredSalary).toLocaleString()}/month</td></tr>` : "",
    vars.startDate    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:14px;color:#64748B;">Start date</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:14px;font-weight:600;color:#08142A;">${new Date(vars.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</td></tr>` : "",
    vars.contractType ? `<tr><td style="padding:10px 0;font-size:14px;color:#64748B;">Contract type</td><td style="padding:10px 0;font-size:14px;font-weight:600;color:#08142A;">${vars.contractType}</td></tr>` : "",
  ].filter(Boolean).join("");

  const detailsBlock = detailRows
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">${detailRows}</table>`
    : "";

  const html = layout(`
    ${badge("✓ HIRE CONFIRMED", "#16A34A")}
    <br/><br/>
    ${h1("Hire confirmed")}
    ${p(`You have successfully hired <strong>${vars.workerName}</strong> for <strong>"${vars.jobTitle}"</strong>.`)}
    ${detailsBlock}
    ${p(`${vars.workerName} has been notified and their profile is now available to other employers. Their full contact details are in your dashboard.`)}
    ${btn(`${APP_URL}/employer/applications`, "View all applications", "#16A34A")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Hire confirmed — ${vars.workerName} for ${vars.jobTitle}`,
    html,
    text: `You have hired ${vars.workerName} for "${vars.jobTitle}". View the application at ${APP_URL}/employer/applications`,
  };
}

export function applicationRejectedWorkerTemplate(vars: {
  jobTitle: string;
  companyName: string;
}): TemplateResult {
  const html = layout(`
    ${badge("APPLICATION UPDATE", "#64748B")}
    <br/><br/>
    ${h1(`Thank you for your interest`)}
    ${p(`Thank you for applying to <strong>"${vars.jobTitle}"</strong> at <strong>${vars.companyName}</strong>.`)}
    ${p("After careful consideration, we will not be moving forward with your application at this time.")}
    ${p("We encourage you to keep applying — new opportunities are added to DirectHire daily.")}
    ${btn(`${APP_URL}/jobs`, "Browse more jobs")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Update on your application — ${vars.jobTitle}`,
    html,
    text: `Thank you for your interest in "${vars.jobTitle}" at ${vars.companyName}. After careful consideration, we will not be moving forward with your application at this time. We encourage you to keep applying.`,
  };
}

export function newApplicationTemplate(vars: {
  jobTitle:      string;
  companyName:   string;
  applicationId: string;
  jobId:         string;
}): TemplateResult {
  const appUrl = `${APP_URL}/employer/jobs/${vars.jobId}/applicants`;
  const html = layout(`
    ${badge("NEW APPLICATION", "#7C3AED")}
    <br/><br/>
    ${h1("New application received")}
    ${p(`A new candidate has applied for your <strong>"${vars.jobTitle}"</strong> position.`)}
    ${p("View their profile and take action from your dashboard.")}
    ${btn(appUrl, "Review applicant", "#7C3AED")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `New application — ${vars.jobTitle}`,
    html,
    text: `A new candidate has applied for your "${vars.jobTitle}" position. Review applicant at: ${appUrl}`,
  };
}

export function applicationWithdrawnTemplate(vars: {
  workerName:  string;
  jobTitle:    string;
  companyName: string;
}): TemplateResult {
  const dashUrl = `${APP_URL}/employer/jobs`;
  const html = layout(`
    ${badge("APPLICATION WITHDRAWN", "#64748B")}
    <br/><br/>
    ${h1("A candidate withdrew their application")}
    ${p(`<strong>${vars.workerName}</strong> has withdrawn their application for <strong>"${vars.jobTitle}"</strong>.`)}
    ${p("Their application has been removed from your applicant list.")}
    ${btn(dashUrl, "View my jobs")}
  `);
  return {
    subject: `A candidate withdrew their application`,
    html,
    text: `${vars.workerName} has withdrawn their application for "${vars.jobTitle}". Their application has been removed from your applicant list.`,
  };
}

export function postingRightsRevokedTemplate(): TemplateResult {
  const html = layout(`
    ${badge("POSTING RIGHTS SUSPENDED", "#DC2626")}
    <br/><br/>
    ${h1(`Your job posting rights have been suspended`)}
    ${p("Your ability to post and submit jobs on DirectHire has been suspended pending a review of your account activity.")}
    ${p("You can still log in, view your existing job posts, and manage applications.")}
    ${p("If you believe this is an error or would like to appeal, please contact our support team.")}
    ${btn("mailto:support@directhire.cc", "Contact Support", "#DC2626")}
    ${divider()}
    ${p(`Email us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a> with your account details.`)}
  `);
  return {
    subject: `Your DirectHire job posting rights have been suspended`,
    html,
    text: `Your ability to post jobs on DirectHire has been suspended. Contact support@directhire.cc to appeal.`,
  };
}

export function postingRightsRestoredTemplate(): TemplateResult {
  const html = layout(`
    ${badge("✓ POSTING RIGHTS RESTORED", "#16A34A")}
    <br/><br/>
    ${h1(`Your job posting rights have been restored`)}
    ${p("Good news — your ability to post and submit jobs on DirectHire has been restored. You can now create and submit new job posts from your dashboard.")}
    ${btn(`${APP_URL}/employer/jobs/new`, "Post a New Job", "#16A34A")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your DirectHire job posting rights have been restored`,
    html,
    text: `Your job posting rights on DirectHire have been restored. You can now create and submit new job posts from your dashboard.`,
  };
}

// ── Worker Lock Templates ──────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function summaryRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 16px;font-size:14px;color:#64748B;border-bottom:1px solid #E2E8F0;">${label}</td>
    <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#08142A;text-align:right;border-bottom:1px solid #E2E8F0;">${value}</td>
  </tr>`;
}

function summaryTable(rows: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;margin:20px 0;">
    <tbody>${rows}</tbody>
  </table>`;
}

export function workerLockedWorkerTemplate(vars: {
  firstName:       string;
  lockExpiryDate:  Date;
}): TemplateResult {
  const expiry = fmtDate(vars.lockExpiryDate);
  const html = layout(`
    ${badge("PROFILE RESERVED")}
    <br/><br/>
    ${h1(`${vars.firstName ? vars.firstName + ", your" : "Your"} profile has been reserved`)}
    ${p(`An employer has reserved your profile until <strong>${expiry}</strong>.`)}
    ${p("Other employers cannot proceed with hiring you during this period. You will be notified when the reservation ends or is released early.")}
    ${summaryTable(
      summaryRow("Reservation ends", expiry),
    )}
    ${p("If you have any concerns, please contact our support team.")}
    ${btn(`${APP_URL}/worker/dashboard`, "View Dashboard")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `You have a new reservation on DirectHire`,
    html,
    text: `An employer has reserved your profile until ${expiry}. Other employers cannot proceed with hiring you during this period.`,
  };
}

export function workerLockedEmployerTemplate(vars: {
  workerFirstName: string;
  workerName:      string;
  lockStartDate:   Date;
  lockExpiryDate:  Date;
  dailyFee:        number;
  currency:        string;
  lockDays:        number;
}): TemplateResult {
  const estTotal = (vars.dailyFee * vars.lockDays).toFixed(2);
  const html = layout(`
    ${badge("✓ RESERVATION CONFIRMED", "#16A34A")}
    <br/><br/>
    ${h1(`Reservation created for ${vars.workerName}`)}
    ${p(`Your profile reservation has been successfully placed. Here is a summary:`)}
    ${summaryTable(
      summaryRow("Worker",        vars.workerName) +
      summaryRow("Start date",    fmtDate(vars.lockStartDate)) +
      summaryRow("Expiry date",   fmtDate(vars.lockExpiryDate)) +
      summaryRow("Daily fee",     `${vars.currency} ${vars.dailyFee.toFixed(2)}`) +
      summaryRow("Duration",      `${vars.lockDays} day${vars.lockDays !== 1 ? "s" : ""}`) +
      summaryRow("Est. total",    `${vars.currency} ${estTotal}`),
    )}
    ${p("You can manage your reservations from your employer dashboard.")}
    ${btn(`${APP_URL}/employer/locks`, "View Reservations")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Reservation confirmed — ${vars.workerFirstName}`,
    html,
    text: `Your reservation for ${vars.workerName} is confirmed. Start: ${fmtDate(vars.lockStartDate)}, Expiry: ${fmtDate(vars.lockExpiryDate)}, Daily fee: ${vars.currency} ${vars.dailyFee.toFixed(2)}, Est. total: ${vars.currency} ${estTotal}.`,
  };
}

export function workerLockExtendedWorkerTemplate(vars: {
  firstName:      string;
  newExpiryDate:  Date;
}): TemplateResult {
  const expiry = fmtDate(vars.newExpiryDate);
  const html = layout(`
    ${badge("RESERVATION EXTENDED")}
    <br/><br/>
    ${h1(`${vars.firstName ? vars.firstName + ", your" : "Your"} reservation has been extended`)}
    ${p(`Your profile reservation has been extended. Your profile will remain reserved until <strong>${expiry}</strong>.`)}
    ${summaryTable(summaryRow("New expiry date", expiry))}
    ${btn(`${APP_URL}/worker/dashboard`, "View Dashboard")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your Direct Hire profile reservation has been extended`,
    html,
    text: `Your profile reservation has been extended until ${expiry}.`,
  };
}

export function workerLockExtendedEmployerTemplate(vars: {
  workerFirstName: string;
  workerName:      string;
  newExpiryDate:   Date;
  dailyFee:        number;
  currency:        string;
  newTotalDays:    number;
}): TemplateResult {
  const expiry    = fmtDate(vars.newExpiryDate);
  const estTotal  = (vars.dailyFee * vars.newTotalDays).toFixed(2);
  const html = layout(`
    ${badge("✓ RESERVATION EXTENDED", "#16A34A")}
    <br/><br/>
    ${h1(`Reservation extended — ${vars.workerName}`)}
    ${p(`The reservation for ${vars.workerName} has been successfully extended.`)}
    ${summaryTable(
      summaryRow("New expiry date",    expiry) +
      summaryRow("Total duration",     `${vars.newTotalDays} day${vars.newTotalDays !== 1 ? "s" : ""}`) +
      summaryRow("Daily fee",          `${vars.currency} ${vars.dailyFee.toFixed(2)}`) +
      summaryRow("Updated est. total", `${vars.currency} ${estTotal}`),
    )}
    ${btn(`${APP_URL}/employer/locks`, "View Reservations")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Reservation extended — ${vars.workerFirstName}`,
    html,
    text: `Your reservation for ${vars.workerName} has been extended until ${expiry}. Updated est. total: ${vars.currency} ${estTotal} over ${vars.newTotalDays} days.`,
  };
}

export function workerLockReleasedWorkerTemplate(vars: {
  firstName: string;
}): TemplateResult {
  const html = layout(`
    ${badge("✓ RESERVATION ENDED", "#16A34A")}
    <br/><br/>
    ${h1(`${vars.firstName ? vars.firstName + ", your" : "Your"} profile is now available`)}
    ${p("Your profile reservation has ended. You are now available to be contacted and hired by other employers on Direct Hire.")}
    ${btn(`${APP_URL}/worker/dashboard`, "View Dashboard")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your reservation has ended`,
    html,
    text: `Your profile reservation has ended. You are now available to other employers on Direct Hire.`,
  };
}

export function workerLockReleasedEmployerTemplate(vars: {
  workerName:      string;
  totalBilled:     number;
  currency:        string;
  totalDaysBilled: number;
}): TemplateResult {
  const html = layout(`
    ${badge("RESERVATION RELEASED")}
    <br/><br/>
    ${h1(`Reservation released — ${vars.workerName}`)}
    ${p(`The reservation for ${vars.workerName} has been released. Here is your billing summary:`)}
    ${summaryTable(
      summaryRow("Worker",         vars.workerName) +
      summaryRow("Days billed",    `${vars.totalDaysBilled}`) +
      summaryRow("Total billed",   `${vars.currency} ${vars.totalBilled.toFixed(2)}`),
    )}
    ${btn(`${APP_URL}/employer/locks`, "View All Reservations")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Reservation released — ${vars.workerName}`,
    html,
    text: `Your reservation for ${vars.workerName} has been released. Total billed: ${vars.currency} ${vars.totalBilled.toFixed(2)} over ${vars.totalDaysBilled} day(s).`,
  };
}

export function lockExpiryWarningTemplate(vars: {
  workerFirstName: string;
  lockExpiryDate:  Date;
  lockId:          string;
}): TemplateResult {
  const expiry = fmtDate(vars.lockExpiryDate);
  const html = layout(`
    ${badge("⚠ RESERVATION EXPIRING SOON", "#D97706")}
    <br/><br/>
    ${h1(`Your reservation for ${vars.workerFirstName} expires in 48 hours`)}
    ${p(`The reservation for <strong>${vars.workerFirstName}</strong> will expire on <strong>${expiry}</strong>.`)}
    ${p("If you would like to continue the reservation, extend it from your dashboard before it expires. Once expired, the worker will become available to other employers.")}
    ${btn(`${APP_URL}/employer/locks`, "Extend Reservation", "#D97706")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Reservation expiring in 48 hours — ${vars.workerFirstName}`,
    html,
    text: `Your reservation for ${vars.workerFirstName} expires on ${expiry}. Extend it at ${APP_URL}/employer/locks before it expires.`,
  };
}

export function lockExpiredWorkerTemplate(vars: {
  firstName: string;
}): TemplateResult {
  const html = layout(`
    ${badge("✓ RESERVATION ENDED", "#16A34A")}
    <br/><br/>
    ${h1(`${vars.firstName ? vars.firstName + ", your" : "Your"} profile is now available`)}
    ${p("Your profile reservation has ended — the reservation period has passed and you are now fully available on Direct Hire.")}
    ${p("Other employers can now contact and proceed with hiring you.")}
    ${btn(`${APP_URL}/worker/dashboard`, "View Dashboard")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your reservation has ended`,
    html,
    text: `Your profile reservation has ended. You are now available to all employers on Direct Hire.`,
  };
}

export function lockExpiredEmployerTemplate(vars: {
  workerName:      string;
  totalBilled:     number;
  currency:        string;
  totalDaysBilled: number;
}): TemplateResult {
  const html = layout(`
    ${badge("RESERVATION EXPIRED")}
    <br/><br/>
    ${h1(`Reservation expired — ${vars.workerName}`)}
    ${p(`The reservation for <strong>${vars.workerName}</strong> has expired. The worker is now available to other employers. Here is your billing summary:`)}
    ${summaryTable(
      summaryRow("Worker",       vars.workerName) +
      summaryRow("Days billed",  `${vars.totalDaysBilled}`) +
      summaryRow("Total billed", `${vars.currency} ${vars.totalBilled.toFixed(2)}`),
    )}
    ${p("You can view your reservation history in your employer dashboard.")}
    ${btn(`${APP_URL}/employer/locks`, "View Reservations")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Reservation expired — ${vars.workerName}`,
    html,
    text: `Your reservation for ${vars.workerName} has expired. Total billed: ${vars.currency} ${vars.totalBilled.toFixed(2)} over ${vars.totalDaysBilled} day(s).`,
  };
}

// ── Admin override templates ───────────────────────────────────────────────────

export function lockOverrideEmployerTemplate(vars: {
  workerName: string;
}): TemplateResult {
  const html = layout(`
    ${badge("RESERVATION ENDED BY DIRECTHIRE", "#64748B")}
    <br/><br/>
    ${h1(`Your reservation on ${vars.workerName} has ended`)}
    ${p(`Your reservation on <strong>${vars.workerName}</strong> has been ended by the DirectHire moderation team.`)}
    ${p("The worker is no longer reserved to your account.")}
    ${p(`If you have questions about this decision, please contact our support team at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>.`)}
    ${btn(`${APP_URL}/employer/locks`, "View My Reservations")}
    ${divider()}
    ${p(`<a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your DirectHire reservation has been ended by our moderation team`,
    html,
    text: `Your reservation on ${vars.workerName} has been ended by the DirectHire moderation team. Contact support@directhire.cc with any questions.`,
  };
}

export function applicationConfirmationTemplate(vars: {
  firstName:     string;
  jobTitle:      string;
  companyName:   string;
  applicationId: string;
}): TemplateResult {
  const trackUrl = `${APP_URL}/worker/reservations`;
  const html = layout(`
    ${badge("APPLICATION SUBMITTED", "#0D9488")}
    <br/><br/>
    ${h1(`Hi ${vars.firstName}, you're in!`)}
    ${p(`Your application for <strong>"${vars.jobTitle}"</strong> at <strong>${vars.companyName}</strong> has been submitted successfully.`)}
    ${p("We will notify you as soon as the employer reviews your profile. In the meantime, you can track all your applications from your dashboard.")}
    ${btn(trackUrl, "Track my applications", "#0D9488")}
    ${divider()}
    ${p(`Questions? Contact us at <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Application submitted — ${vars.jobTitle} at ${vars.companyName}`,
    html,
    text: `Hi ${vars.firstName}, your application for "${vars.jobTitle}" at ${vars.companyName} has been submitted successfully. We will notify you as soon as the employer reviews it. Track your applications at: ${trackUrl}`,
  };
}

// ── Contact form templates ─────────────────────────────────────

export function contactFormTemplate(vars: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): TemplateResult {
  const safeMessage = vars.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = layout(`
    ${badge("📬 NEW CONTACT FORM SUBMISSION")}
    <br/><br/>
    ${h1("New message received")}
    <table width="100%" cellpadding="14" cellspacing="0" style="background:#F7F9FF;border-radius:12px;border:1px solid #E2E8F0;margin:20px 0;">
      <tr style="border-bottom:1px solid #E2E8F0;">
        <td style="border-bottom:1px solid #E2E8F0;padding:14px;">
          <p style="margin:0;font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">From</p>
          <p style="margin:4px 0 0;font-size:15px;color:#334155;font-weight:600;">${vars.name} &lt;${vars.email}&gt;</p>
        </td>
      </tr>
      <tr>
        <td style="border-bottom:1px solid #E2E8F0;padding:14px;">
          <p style="margin:0;font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Subject</p>
          <p style="margin:4px 0 0;font-size:15px;color:#334155;">${vars.subject}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px;">
          <p style="margin:0;font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Message</p>
          <p style="margin:4px 0 0;font-size:15px;color:#334155;white-space:pre-wrap;line-height:1.7;">${safeMessage}</p>
        </td>
      </tr>
    </table>
    ${btn(`mailto:${vars.email}`, `Reply to ${vars.name}`)}
  `);
  return {
    subject: `[Contact] ${vars.subject} — ${vars.name}`,
    html,
    text: `New contact form submission\nFrom: ${vars.name} <${vars.email}>\nSubject: ${vars.subject}\n\n${vars.message}`,
  };
}

export function contactConfirmationTemplate(vars: {
  name: string;
}): TemplateResult {
  const html = layout(`
    ${badge("✓ MESSAGE RECEIVED", "#059669")}
    <br/><br/>
    ${h1("We got your message!")}
    ${p(`Hi ${vars.name}, thanks for reaching out to DirectHire. We've received your message and will get back to you within 24 hours on business days.`)}
    <table width="100%" cellpadding="16" cellspacing="0" style="background:#F7F9FF;border-radius:12px;margin:20px 0;">
      <tr>
        <td>
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">While you wait</p>
          <p style="margin:0 0 8px;font-size:14px;color:#334155;">🌍 &nbsp;Learn how DirectHire connects <a href="${APP_URL}/for-employers" style="color:${BRAND_COLOR};">employers</a> and <a href="${APP_URL}/for-workers" style="color:${BRAND_COLOR};">workers</a> globally</p>
          <p style="margin:0;font-size:14px;color:#334155;">📧 &nbsp;Urgent? Email us directly at <a href="mailto:hello@directhire.cc" style="color:${BRAND_COLOR};">hello@directhire.cc</a></p>
        </td>
      </tr>
    </table>
    ${btn(APP_URL, "Visit DirectHire")}
    ${divider()}
    ${p("If you didn't send this message, you can safely ignore this email.")}
  `);
  return {
    subject: `We received your message — ${APP_NAME}`,
    html,
    text: `Hi ${vars.name}, thanks for reaching out! We've received your message and will get back to you within 24 hours on business days. If urgent, email hello@directhire.cc.`,
  };
}

// ── Subscription lifecycle ───────────────────────────────────

export function subscriptionCanceledTemplate(vars: {
  name:             string;
  accessUntil:      Date;
}): TemplateResult {
  const until = fmtDate(vars.accessUntil);
  const html = layout(`
    ${badge("SUBSCRIPTION CANCELED", "#64748B")}
    <br/><br/>
    ${h1(`Hi ${vars.name}, your subscription is set to cancel`)}
    ${p("We've confirmed your cancellation request. You will not be charged again.")}
    ${summaryTable(
      summaryRow("Access until", until),
    )}
    ${p("You'll keep full access to DirectHire until the date above. After that, your account will move to view-only mode until you resubscribe.")}
    ${btn(`${APP_URL}/employer/subscription`, "Manage Subscription", "#64748B")}
    ${p("Changed your mind? You can resubscribe any time before or after your access ends.")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your DirectHire subscription is set to cancel`,
    html,
    text: `Hi ${vars.name}, your cancellation is confirmed. You'll keep access until ${until}. You will not be charged again. Resubscribe any time at ${APP_URL}/employer/subscription.`,
  };
}

export function subscriptionExpiryWarningTemplate(vars: {
  name:        string;
  accessUntil: Date;
}): TemplateResult {
  const until = fmtDate(vars.accessUntil);
  const html = layout(`
    ${badge("⚠ ACCESS ENDING SOON", "#D97706")}
    <br/><br/>
    ${h1(`Hi ${vars.name}, your access ends in 3 days`)}
    ${p(`Your canceled DirectHire subscription remains active until <strong>${until}</strong>. After that, you'll lose access to candidate search and job posting until you resubscribe.`)}
    ${btn(`${APP_URL}/employer/subscription`, "Resubscribe", "#D97706")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Your DirectHire access ends in 3 days`,
    html,
    text: `Hi ${vars.name}, your canceled subscription remains active until ${until}. Resubscribe at ${APP_URL}/employer/subscription to avoid losing access.`,
  };
}

// ── Job archived → pending applicants ─────────────────────────

export function jobClosedApplicantTemplate(vars: {
  firstName:   string;
  jobTitle:    string;
  companyName: string;
}): TemplateResult {
  const html = layout(`
    ${badge("POSITION CLOSED", "#64748B")}
    <br/><br/>
    ${h1(`Hi ${vars.firstName}, this position has closed`)}
    ${p(`The position you applied for, <strong>${vars.jobTitle}</strong> at ${vars.companyName}, has been closed by the employer.`)}
    ${p("This does not affect your other applications. Browse the job feed for similar opportunities.")}
    ${btn(`${APP_URL}/worker/jobs`, "Browse Jobs")}
    ${divider()}
    ${p(`Questions? <a href="mailto:support@directhire.cc" style="color:${BRAND_COLOR};">support@directhire.cc</a>`)}
  `);
  return {
    subject: `Position closed — ${vars.jobTitle}`,
    html,
    text: `Hi ${vars.firstName}, the position "${vars.jobTitle}" at ${vars.companyName} has been closed by the employer. Browse similar jobs at ${APP_URL}/worker/jobs.`,
  };
}

// ── Job match recommendation (SUPPRESSIBLE — see lib/unsubscribe.ts) ──────────

export function jobMatchTemplate(vars: {
  firstName:      string;
  jobTitle:       string;
  matchPct:       number;
  jobsUrl:        string;
  unsubscribeUrl: string;
}): TemplateResult {
  const html = layout(`
    ${badge(`${vars.matchPct}% MATCH`, "#16A34A")}
    <br/><br/>
    ${h1(`${vars.firstName}, a new job matches your profile`)}
    ${p(`<strong>${vars.jobTitle}</strong> looks like a strong fit for your profile — a ${vars.matchPct}% match based on your skills, experience, and target countries.`)}
    ${btn(vars.jobsUrl, "View Job")}
    ${p("You're receiving this because your profile closely matches a newly-approved job. You can unsubscribe from match recommendations any time.")}
  `, { unsubscribeUrl: vars.unsubscribeUrl });
  return {
    subject: `New job match — ${vars.jobTitle} (${vars.matchPct}%)`,
    html,
    text: `${vars.jobTitle} looks like a strong fit for your profile (${vars.matchPct}% match). View it at ${vars.jobsUrl}\n\nUnsubscribe from match recommendations: ${vars.unsubscribeUrl}`,
  };
}
