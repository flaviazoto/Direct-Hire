// backend/src/stripe/webhook.controller.ts
// Stripe webhook — no JWT auth, raw body required for signature verification.
import { Request, Response } from "express";
import stripe from "../config/stripe.config";
import prisma from "../lib/prisma";
import { sendEmail, escapeHtml, FROM_NO_REPLY } from "../services/email";

export async function stripeWebhook(req: Request, res: Response): Promise<Response> {
  const sig = req.headers["stripe-signature"];

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: "Missing stripe-signature or STRIPE_WEBHOOK_SECRET" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (e) {
    console.error("[stripe-webhook] signature verification failed:", (e as Error).message);
    return res.status(400).json({ error: "Webhook signature verification failed" });
  }

  console.log(`[stripe-webhook] ${event.type}`);

  try {
    switch (event.type) {

      // ── invoice.payment_succeeded ────────────────────────────────────────────
      case "invoice.payment_succeeded": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = event.data.object as any;
        if (!inv.subscription) break;

        const stripeSubId: string = typeof inv.subscription === "string"
          ? inv.subscription
          : inv.subscription.id;

        const sub = await prisma.subscription.findUnique({
          where: { stripe_sub_id: stripeSubId },
        });

        if (!sub) {
          console.warn(`[stripe-webhook] invoice.payment_succeeded — no Subscription for stripe_sub_id=${stripeSubId}`);
          break;
        }

        const periodStart: Date = inv.period_start
          ? new Date((inv.period_start as number) * 1000)
          : sub.current_period_start;
        const periodEnd: Date = inv.period_end
          ? new Date((inv.period_end as number) * 1000)
          : sub.current_period_end;

        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status:               "ACTIVE",
            current_period_start: periodStart,
            current_period_end:   periodEnd,
          },
        });
        await prisma.employerProfile.update({
          where: { id: sub.employer_id },
          data:  { subscriptionStatus: "ACTIVE" },
        });

        console.log(`[stripe-webhook] invoice.payment_succeeded — subscription=${sub.id} → ACTIVE`);
        break;
      }

      // ── invoice.payment_failed ────────────────────────────────────────────────
      case "invoice.payment_failed": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = event.data.object as any;
        if (!inv.subscription) break;

        const stripeSubId: string = typeof inv.subscription === "string"
          ? inv.subscription
          : inv.subscription.id;

        const sub = await prisma.subscription.findUnique({
          where: { stripe_sub_id: stripeSubId },
          include: {
            employer: {
              select: {
                contactPersonName: true,
                user: { select: { id: true, email: true } },
              },
            },
          },
        });

        if (!sub) {
          console.warn(`[stripe-webhook] invoice.payment_failed — no Subscription for stripe_sub_id=${stripeSubId}`);
          break;
        }

        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { status: "PAST_DUE" },
        });
        await prisma.employerProfile.update({
          where: { id: sub.employer_id },
          data:  { subscriptionStatus: "INACTIVE" },
        });

        const { user, contactPersonName } = sub.employer;
        const firstName = contactPersonName?.split(" ")[0] ?? "there";
        await sendEmail({
          userId:    user.id,
          to:        user.email,
          from:      FROM_NO_REPLY,
          emailType: "GENERAL",
          subject:   "Payment failed — update your billing",
          html:      paymentFailedHtml(firstName),
          text:      `Hi ${firstName}, your DirectHire subscription payment failed. Please update your payment method to keep your account active.`,
        }).catch(e => console.error("[stripe-webhook] payment-failed email:", e));

        console.log(`[stripe-webhook] invoice.payment_failed — subscription=${sub.id} → PAST_DUE, email sent to user=${user.id}`);
        break;
      }

      // ── customer.subscription.deleted ────────────────────────────────────────
      case "customer.subscription.deleted": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stripeSub = event.data.object as any;

        const sub = await prisma.subscription.findUnique({
          where: { stripe_sub_id: stripeSub.id },
        });

        if (!sub) {
          console.warn(`[stripe-webhook] customer.subscription.deleted — no Subscription for stripe_sub_id=${stripeSub.id}`);
          break;
        }

        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { status: "CANCELLED" },
        });
        await prisma.employerProfile.update({
          where: { id: sub.employer_id },
          data:  { subscriptionStatus: "INACTIVE" },
        });

        console.log(`[stripe-webhook] customer.subscription.deleted — subscription=${sub.id} → CANCELLED`);
        break;
      }

      // ── payment_intent.succeeded ──────────────────────────────────────────────
      case "payment_intent.succeeded": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pi = event.data.object as any;

        const payment = await prisma.payment.findUnique({
          where: { stripe_payment_intent_id: pi.id },
        });

        if (!payment) {
          console.warn(`[stripe-webhook] payment_intent.succeeded — no Payment for pi=${pi.id}`);
          break;
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data:  { status: "SUCCEEDED" },
        });

        if (payment.entity_type === "WORKER_LOCK") {
          await prisma.workerLock.update({
            where: { id: payment.entity_id },
            data:  { lockStatus: "ACTIVE" },
          });
          console.log(`[stripe-webhook] payment_intent.succeeded — WorkerLock=${payment.entity_id} → ACTIVE`);
        } else if (payment.entity_type === "APPLICATION_FEE") {
          await prisma.application.update({
            where: { id: payment.entity_id },
            data:  { applicationFeePaid: true },
          });
          console.log(`[stripe-webhook] payment_intent.succeeded — Application=${payment.entity_id} fee marked paid`);
        }

        break;
      }

      // ── payment_intent.payment_failed ─────────────────────────────────────────
      case "payment_intent.payment_failed": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pi = event.data.object as any;

        const payment = await prisma.payment.findUnique({
          where: { stripe_payment_intent_id: pi.id },
        });

        if (!payment) {
          console.warn(`[stripe-webhook] payment_intent.payment_failed — no Payment for pi=${pi.id}`);
          break;
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data:  { status: "FAILED" },
        });

        if (payment.entity_type === "WORKER_LOCK") {
          await prisma.workerLock.update({
            where: { id: payment.entity_id },
            data:  { lockStatus: "EXPIRED" },
          });
          console.log(`[stripe-webhook] payment_intent.payment_failed — WorkerLock=${payment.entity_id} → EXPIRED`);
        }

        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
    // Still return 200 — Stripe retries on non-2xx, treating that as our bug
  }

  return res.status(200).json({ received: true });
}

// ── Email template ─────────────────────────────────────────────────────────────

function paymentFailedHtml(name: string): string {
  const safeName = escapeHtml(name);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f7f9ff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#08142a;padding:24px 32px;">
          <span style="font-size:18px;font-weight:800;color:#fff;">DirectHire</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;">Action required</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Hi ${safeName}, payment failed</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
            We were unable to process your DirectHire subscription payment. Please update your payment method to keep your account active.
          </p>
          <p style="margin:0;font-size:13px;color:#64748b;">
            Log in to your account and visit the <strong>Billing</strong> page to update your payment details.
          </p>
        </td></tr>
        <tr><td style="background:#f7f9ff;padding:20px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
            &copy; ${new Date().getFullYear()} DirectHire
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
