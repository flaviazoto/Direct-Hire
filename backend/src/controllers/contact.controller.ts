// backend/src/controllers/contact.controller.ts
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { sendContactFormEmail, sendContactConfirmationEmail } from "../services/email";

// The confirmation email goes to whatever address is typed in, so the form
// could be used to send DirectHire-branded mail to strangers. Defences:
// per-IP rate limit (contact.routes.ts), a honeypot field, no links or markup
// in the name, at most one confirmation per address per day, and Cloudflare
// Turnstile when TURNSTILE_SECRET_KEY is configured.
const NO_LINKS = /(https?:|www\.|:\/\/|<|>)/i;

const ContactSchema = z.object({
  name:    z.string().trim().min(1).max(120).refine((v) => !NO_LINKS.test(v), "Please enter just your name."),
  email:   z.string().trim().toLowerCase().pipe(z.string().email()),
  subject: z.string().trim().max(200).default("General enquiry"),
  message: z.string().trim().min(1).max(5000),
  // Honeypot: hidden from people by the form, so only bots fill it.
  website: z.string().optional(),
  captchaToken: z.string().max(4096).optional(),
});

const CONFIRMATION_COOLDOWN_MS = 24 * 3600 * 1000;

async function verifyTurnstile(token: string | undefined, ip: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = await r.json() as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function submitContact(req: Request, res: Response, next: NextFunction) {
  try {
    const input = ContactSchema.parse(req.body);
    const accepted = () => ok(res, null, "Message received. We'll be in touch within 24 hours.");

    // Bots get the normal success response, so they learn nothing.
    if (input.website) return accepted();

    if (!(await verifyTurnstile(input.captchaToken, req.ip))) {
      return err(res, "Please complete the verification and try again.", 400, { code: "CAPTCHA_FAILED" });
    }

    // Sends to OWNER_EMAIL with replyTo set — hit Reply in Gmail to respond directly
    sendContactFormEmail(input.name, input.email, input.subject, input.message)
      .catch((e) => console.error("[contact] notification error:", e));

    // Auto-reply: at most once per address per day.
    const recent = await prisma.emailLog.count({
      where: {
        templateId: "contact_confirmation",
        toAddress:  { equals: input.email, mode: "insensitive" },
        createdAt:  { gte: new Date(Date.now() - CONFIRMATION_COOLDOWN_MS) },
      },
    });
    if (recent === 0) {
      sendContactConfirmationEmail(input.email, input.name)
        .catch((e) => console.error("[contact] confirmation error:", e));
    }

    return accepted();
  } catch (e) { next(e); }
}
