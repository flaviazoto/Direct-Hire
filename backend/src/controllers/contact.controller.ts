// backend/src/controllers/contact.controller.ts
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ok } from "../lib/response";
import { sendContactFormEmail, sendContactConfirmationEmail } from "../services/email";

const ContactSchema = z.object({
  name:    z.string().trim().min(1).max(120),
  email:   z.string().email(),
  subject: z.string().trim().max(200).default("General enquiry"),
  message: z.string().trim().min(1).max(5000),
});

// Route each subject type to the right inbox
const SUBJECT_INBOX: Record<string, string> = {
  "Employer / sales question": process.env.SALES_EMAIL    ?? "sales@directhire.cc",
  "Partnership":               process.env.SALES_EMAIL    ?? "sales@directhire.cc",
  "Worker support":            process.env.SUPPORT_EMAIL  ?? "support@directhire.cc",
  "Technical issue":           process.env.SUPPORT_EMAIL  ?? "support@directhire.cc",
};

const DEFAULT_INBOX = process.env.CONTACT_EMAIL ?? "hello@directhire.cc";

function inboxFor(subject: string): string {
  return SUBJECT_INBOX[subject] ?? DEFAULT_INBOX;
}

export async function submitContact(req: Request, res: Response, next: NextFunction) {
  try {
    const input = ContactSchema.parse(req.body);
    const inbox  = inboxFor(input.subject);

    // Send internal notification to the right inbox (fire-and-forget)
    sendContactFormEmail(inbox, input.name, input.email, input.subject, input.message)
      .catch((e) => console.error("[contact] internal email error:", e));

    // Send auto-reply confirmation to the sender (fire-and-forget)
    sendContactConfirmationEmail(input.email, input.name)
      .catch((e) => console.error("[contact] confirmation email error:", e));

    return ok(res, null, "Message received. We'll be in touch within 24 hours.");
  } catch (e) { next(e); }
}
