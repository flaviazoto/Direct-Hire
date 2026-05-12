// backend/src/controllers/contact.controller.ts
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ok, err } from "../lib/response";
import { sendContactFormEmail, sendContactConfirmationEmail } from "../services/email";

const ContactSchema = z.object({
  name:    z.string().trim().min(1).max(120),
  email:   z.string().email(),
  subject: z.string().trim().max(200).default("General enquiry"),
  message: z.string().trim().min(1).max(5000),
});

const CONTACT_INBOX = process.env.CONTACT_EMAIL ?? process.env.EMAIL_FROM_ADDRESS ?? "hello@directhire.io";

export async function submitContact(req: Request, res: Response, next: NextFunction) {
  try {
    const input = ContactSchema.parse(req.body);

    // Send internal notification to the team (fire-and-forget)
    sendContactFormEmail(CONTACT_INBOX, input.name, input.email, input.subject, input.message)
      .catch((e) => console.error("[contact] internal email error:", e));

    // Send auto-reply confirmation to the sender (fire-and-forget)
    sendContactConfirmationEmail(input.email, input.name)
      .catch((e) => console.error("[contact] confirmation email error:", e));

    return ok(res, null, "Message received. We'll be in touch within 24 hours.");
  } catch (e) { next(e); }
}
