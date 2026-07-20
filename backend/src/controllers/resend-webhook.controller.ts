// backend/src/controllers/resend-webhook.controller.ts
// Resend webhook handler — no auth middleware, uses raw body for Svix
// signature verification (Resend delivers webhooks via Svix — see
// https://resend.com/docs/dashboard/webhooks/verify-webhook-requests).
//
// Only handles email.bounced / email.complained, updating the matching
// EmailLog row to BOUNCED. Every other event type (sent/delivered/opened/
// clicked/delivery_delayed/etc.) is acknowledged but not tracked — nothing
// in this codebase reads those yet.
//
// Matches EmailLog via providerMsgId === payload.data.email_id. sendEmail()
// (services/email/index.ts) already stores Resend's returned id there on
// every successful send — no schema change needed for this endpoint.
//
// NOTE: this must be registered as a webhook endpoint in the Resend
// dashboard before it will ever receive anything — see the deploy note in
// this session's output.

import { Request, Response } from "express";
import { Webhook } from "svix";
import prisma from "../lib/prisma";

export async function resendWebhook(req: Request, res: Response) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set — rejecting");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  const svixId        = req.headers["svix-id"];
  const svixTimestamp = req.headers["svix-timestamp"];
  const svixSignature = req.headers["svix-signature"];

  if (typeof svixId !== "string" || typeof svixTimestamp !== "string" || typeof svixSignature !== "string") {
    return res.status(400).json({ error: "Missing svix headers" });
  }

  let event: { type: string; data?: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    event = wh.verify((req.body as Buffer).toString("utf8"), {
      "svix-id":        svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as { type: string; data?: Record<string, unknown> };
  } catch (e) {
    console.error("[resend-webhook] signature verification failed:", (e as Error).message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    switch (event.type) {
      case "email.bounced":
      case "email.complained": {
        const emailId = event.data?.email_id;
        if (typeof emailId !== "string") {
          console.warn(`[resend-webhook] ${event.type} event with no data.email_id — skipping`);
          break;
        }

        const bounceInfo = event.data?.bounce as { message?: string } | undefined;
        const errorMessage = event.type === "email.complained"
          ? "Recipient marked this email as spam (complaint)"
          : bounceInfo?.message ?? "Bounced";

        const updated = await prisma.emailLog.updateMany({
          where: { providerMsgId: emailId },
          data:  { status: "BOUNCED", errorMessage },
        });

        if (updated.count === 0) {
          console.warn(`[resend-webhook] ${event.type}: no EmailLog row found for provider message id ${emailId}`);
        } else {
          console.log(`[resend-webhook] ${event.type}: marked EmailLog BOUNCED for provider message id ${emailId}`);
        }
        break;
      }
      default:
        // Unhandled event type — acknowledged, not tracked.
        break;
    }
  } catch (e) {
    console.error("[resend-webhook] handler error:", e);
    // Still return 200 — Resend/Svix will retry on non-2xx, but a handler
    // error here is our problem to fix, not something the sender should
    // keep retrying (same stance as the Stripe webhook handler).
  }

  return res.json({ received: true });
}
