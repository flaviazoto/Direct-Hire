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

export async function submitContact(req: Request, res: Response, next: NextFunction) {
  try {
    const input = ContactSchema.parse(req.body);

    // Sends to OWNER_EMAIL with replyTo set — hit Reply in Gmail to respond directly
    sendContactFormEmail(input.name, input.email, input.subject, input.message)
      .catch((e) => console.error("[contact] notification error:", e));

    // Auto-reply confirmation to the sender
    sendContactConfirmationEmail(input.email, input.name)
      .catch((e) => console.error("[contact] confirmation error:", e));

    return ok(res, null, "Message received. We'll be in touch within 24 hours.");
  } catch (e) { next(e); }
}
