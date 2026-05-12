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

// All contact types land in your personal inbox.
// Set PERSONAL_EMAIL in .env to your real Gmail / personal address.
const PERSONAL_EMAIL = process.env.PERSONAL_EMAIL!;

export async function submitContact(req: Request, res: Response, next: NextFunction) {
  try {
    const input = ContactSchema.parse(req.body);

    // Notification to your inbox — replyTo lets you hit Reply and go straight to the sender
    sendContactFormEmail(PERSONAL_EMAIL, input.name, input.email, input.subject, input.message)
      .catch((e) => console.error("[contact] notification email error:", e));

    // Auto-reply confirmation to the sender
    sendContactConfirmationEmail(input.email, input.name)
      .catch((e) => console.error("[contact] confirmation email error:", e));

    return ok(res, null, "Message received. We'll be in touch within 24 hours.");
  } catch (e) { next(e); }
}
