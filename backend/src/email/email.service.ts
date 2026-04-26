// src/email/email.service.ts
import nodemailer from "nodemailer";
import prisma from "../lib/prisma";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

const APP_NAME    = "Direct Hire";
const BRAND_COLOR = "#1848CC";
const BRAND_BG    = "#08142A";

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host:   process.env.EMAIL_HOST ?? "localhost",
      port:   parseInt(process.env.EMAIL_PORT ?? "587"),
      secure: process.env.EMAIL_PORT === "465",
      auth:
        process.env.EMAIL_USER
          ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
          : undefined,
    });
  }

  async sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
    const logRecord = await prisma.emailLog.create({
      data: {
        toAddress:  to,
        emailType:  "EMAIL_VERIFICATION",
        subject,
        templateId: "email_verification",
        status:     "QUEUED",
      },
    });

    const DELAYS = [1000, 2000, 4000];
    let lastErr: unknown;

    for (let attempt = 0; attempt < DELAYS.length; attempt++) {
      try {
        await this.transporter.sendMail({
          from:    process.env.EMAIL_FROM ?? `"${APP_NAME}" <noreply@directhire.io>`,
          to,
          subject,
          html,
        });

        await prisma.emailLog.update({
          where: { id: logRecord.id },
          data:  { status: "SENT", sentAt: new Date() },
        });
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < DELAYS.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAYS[attempt]));
        }
      }
    }

    await prisma.emailLog.update({
      where: { id: logRecord.id },
      data: {
        status:       "FAILED",
        errorMessage: lastErr instanceof Error ? lastErr.message : "Unknown error",
      },
    });
    console.error("[EmailService] send failed after 3 attempts:", lastErr);
  }

  async sendVerificationCode(
    to: string,
    code: string,
    expiresMinutes: number
  ): Promise<void> {
    const subject = "Your DirectHire verification code";
    const html    = this.buildOtpHtml(code, expiresMinutes);
    await this.sendEmail({ to, subject, html });
  }

  private buildOtpHtml(code: string, expiresMinutes: number): string {
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${APP_NAME} Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FF;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FF;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #E2E8F0;">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND_BG};padding:28px 40px;">
            <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${APP_NAME}</span>
            <span style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:700;letter-spacing:1px;margin-left:8px;">AI GLOBAL</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 8px;display:inline-block;background:${BRAND_COLOR}15;color:${BRAND_COLOR};
                      font-size:12px;font-weight:700;padding:4px 12px;border-radius:99px;letter-spacing:0.5px;">
              EMAIL VERIFICATION
            </p>
            <br/><br/>
            <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#08142A;
                       letter-spacing:-0.5px;line-height:1.2;">
              Your verification code
            </h1>
            <p style="margin:0 0 28px;font-size:15px;color:#334155;line-height:1.7;">
              Use the code below to verify your email address. Do not share this code with anyone.
            </p>

            <!-- OTP box -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td style="background:#F7F9FF;border:2px solid #E2E8F0;border-radius:16px;padding:24px 48px;text-align:center;">
                  <span style="font-family:'Courier New',Courier,monospace;font-size:42px;font-weight:800;
                               color:#08142A;letter-spacing:10px;display:block;">
                    ${code}
                  </span>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.7;">
              This code expires in <strong>${expiresMinutes} minutes.</strong>
            </p>
            <p style="margin:0;font-size:14px;color:#64748B;line-height:1.7;">
              If you did not request this, ignore this email. Your account will remain unchanged.
            </p>

            <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0;" />
            <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
              For security, never share this code with anyone — ${APP_NAME} staff will never ask for it.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F7F9FF;padding:24px 40px;border-top:1px solid #E2E8F0;">
            <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;line-height:1.6;">
              &copy; ${year} ${APP_NAME}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}

export const emailService = new EmailService();
