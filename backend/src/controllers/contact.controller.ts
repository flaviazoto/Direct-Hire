// backend/src/controllers/contact.controller.ts
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ok, err } from "../lib/response";
import {
  checkEmailRateLimit,
  isValidEmail,
  logEmailRateLimited,
  sendContactFormEmail,
  sendContactConfirmationEmail,
  stripHtml,
} from "../services/email";

const ContactSchema = z.object({
  name:    z.string().trim().min(2).max(100).refine((value) => !/<[^>]*>/.test(value), "HTML is not allowed"),
  email:   z.string().email().refine(isValidEmail, "Invalid email address"),
  subject: z.string().trim().max(200).default("General enquiry"),
  message: z.string().trim().min(10).max(2000),
  type:    z.enum(["general", "sales", "support"]).default("general"),
  website: z.string().optional(),
});

const SPAM_PATTERNS = [/viagra/i, /casino/i, /click here/i, /\$\$\$/];

function getClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0]?.trim();
  const realIp = req.headers["x-real-ip"];
  const cfIp = req.headers["cf-connecting-ip"];

  return forwardedIp
    || (Array.isArray(realIp) ? realIp[0] : realIp)
    || (Array.isArray(cfIp) ? cfIp[0] : cfIp)
    || req.ip
    || req.socket.remoteAddress
    || "unknown";
}

export async function submitContact(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body?.website) return res.json({ ok: true });

    const input = ContactSchema.parse(req.body);
    const ip = getClientIp(req);
    const rateLimitKey = `email_rate:contact:${ip}`;
    const limit = await checkEmailRateLimit(rateLimitKey, 5, 3600);
    if (!limit.allowed) {
      logEmailRateLimited("contact", rateLimitKey);
      return err(res, "Too many messages. Try again later.", 429);
    }

    const sanitized = {
      name: stripHtml(input.name),
      email: input.email,
      subject: stripHtml(input.subject || input.type),
      message: stripHtml(input.message),
    };

    if (SPAM_PATTERNS.some((pattern) => pattern.test(sanitized.message))) {
      console.warn("[Contact] Spam detected from:", ip);
      return res.json({ ok: true });
    }

    // Sends to OWNER_EMAIL with replyTo set — hit Reply in Gmail to respond directly
    sendContactFormEmail(sanitized.name, sanitized.email, sanitized.subject, sanitized.message)
      .catch((e) => console.error("[contact] notification error:", e));

    // Auto-reply confirmation to the sender
    sendContactConfirmationEmail(sanitized.email, sanitized.name)
      .catch((e) => console.error("[contact] confirmation error:", e));

    return ok(res, null, "Message received. We'll be in touch within 24 hours.");
  } catch (e) { next(e); }
}
