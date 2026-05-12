// backend/src/routes/inboundEmail.routes.ts
// Receives inbound emails forwarded by Resend and forwards them to your personal inbox.
// Set up: Resend Dashboard → Inbound → Add route → POST https://yourapi.com/api/inbound-email
import { Router, Request, Response } from "express";
import { Resend } from "resend";

export const inboundEmailRouter = Router();

const PERSONAL_EMAIL = process.env.PERSONAL_EMAIL ?? process.env.ADMIN_SEED_EMAIL ?? "hello@directhire.io";

const INBOX_MAP: Record<string, string> = {
  "hello@directhire.cc":   PERSONAL_EMAIL,
  "sales@directhire.cc":   PERSONAL_EMAIL,
  "support@directhire.cc": PERSONAL_EMAIL,
};

inboundEmailRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { to, from, subject, html, text } = req.body;

    const recipient  = Array.isArray(to) ? to[0] : (to ?? "");
    const forwardTo  = INBOX_MAP[recipient] ?? PERSONAL_EMAIL;

    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from:    `DirectHire Inbox <noreply@directhire.cc>`,
      to:      forwardTo,
      replyTo: from,
      subject: `[${recipient}] ${subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;color:#334155;">
          <p><strong>From:</strong> ${from}</p>
          <p><strong>Sent to:</strong> ${recipient}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr style="margin:20px 0;border:none;border-top:1px solid #E2E8F0;"/>
          ${html || `<p>${text ?? ""}</p>`}
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[inbound-email] error:", err);
    res.status(500).json({ ok: false });
  }
});
