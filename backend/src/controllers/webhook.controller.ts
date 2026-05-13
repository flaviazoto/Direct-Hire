// backend/src/controllers/webhook.controller.ts
// Stripe webhook handler — no auth middleware, uses raw body for signature verification
import { Request, Response } from "express";
import Stripe from "stripe";
import stripe, { mapStripeStatus } from "../services/stripe";
import prisma from "../lib/prisma";
import { escapeHtml, sendEmail } from "../services/email";

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"];

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: "Missing stripe signature or webhook secret" });
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (e) {
    console.error("[stripe-webhook] signature verification failed:", (e as Error).message);
    return res.status(400).json({ error: `Webhook signature verification failed` });
  }

  console.log(`[stripe-webhook] ${event.type}`);

  try {
    switch (event.type) {

      // ── Subscription lifecycle ───────────────────────────────────────────────

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub      = event.data.object as any;
        const userId   = sub.metadata?.userId;
        if (!userId) { console.warn("[stripe-webhook] no userId in subscription metadata"); break; }

        const status   = mapStripeStatus(sub.status);
        const periodEnd = new Date(sub.current_period_end * 1000);

        await prisma.employerProfile.updateMany({
          where: { userId },
          data: {
            stripeSubscriptionId:        sub.id,
            subscriptionStatus:          status,
            subscriptionPlan:            "EMPLOYER_MONTHLY",
            subscriptionCurrentPeriodEnd: periodEnd,
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub    = event.data.object as any;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await prisma.employerProfile.updateMany({
          where: { userId },
          data: {
            subscriptionStatus:           "INACTIVE",
            stripeSubscriptionId:         null,
            subscriptionCurrentPeriodEnd: null,
          },
        });
        break;
      }

      // ── Payment succeeded ────────────────────────────────────────────────────

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        // Only process subscription renewals (not the first payment which may be $0)
        if (!invoice.subscription) break;

        // Retrieve sub to get userId from metadata
        const sub    = await stripe.subscriptions.retrieve((invoice as any).subscription as string);
        const userId = sub.metadata?.userId;
        if (!userId) break;

        // Upsert payment record (ignore duplicate invoice)
        await prisma.$executeRaw`
          INSERT INTO "Payment"
            ("id","userId","stripePaymentId","stripeInvoiceId","amount","currency","status","type","description","createdAt")
          VALUES (
            gen_random_uuid()::text, ${userId},
            ${(invoice.payment_intent as string) ?? null}, ${invoice.id},
            ${invoice.amount_paid}, ${invoice.currency.toUpperCase()},
            'SUCCEEDED', 'SUBSCRIPTION', 'Monthly subscription renewal', NOW()
          )
          ON CONFLICT ("stripeInvoiceId") DO NOTHING
        `;

        // Send confirmation email
        const user = await prisma.user.findUnique({
          where:   { id: userId },
          include: { employerProfile: { select: { contactPersonName: true } } },
        });
        if (user) {
          const name = user.employerProfile?.contactPersonName?.split(" ")[0] ?? "there";
          const amt  = `${(invoice.amount_paid / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`;
          await sendEmail({
            userId,
            to:        user.email,
            emailType: "SUBSCRIPTION_CONFIRMED",
            subject:   "Payment confirmed — DirectHire subscription",
            html: confirmEmail(name, amt),
            text: `Hi ${name}, your DirectHire subscription payment of ${amt} was successful.`,
          }).catch(e => console.error("[stripe-webhook] email failed:", e));
        }
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────────

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        if (!invoice.subscription) break;

        const sub    = await stripe.subscriptions.retrieve((invoice as any).subscription as string);
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await prisma.employerProfile.updateMany({
          where: { userId },
          data:  { subscriptionStatus: "PAST_DUE" },
        });

        const user = await prisma.user.findUnique({
          where:   { id: userId },
          include: { employerProfile: { select: { contactPersonName: true } } },
        });
        if (user) {
          const name = user.employerProfile?.contactPersonName?.split(" ")[0] ?? "there";
          await sendEmail({
            userId,
            to:        user.email,
            emailType: "GENERAL",
            subject:   "Payment failed — action required",
            html: failEmail(name),
            text: `Hi ${name}, your DirectHire subscription payment failed. Please update your payment method.`,
          }).catch(e => console.error("[stripe-webhook] email failed:", e));
        }
        break;
      }

      default:
        // Unhandled event type — ignore silently
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
    // Return 200 anyway — Stripe will retry on non-2xx, but handler errors are our problem
  }

  return res.json({ received: true });
}

// ── Email templates ────────────────────────────────────────────────────────────

function confirmEmail(name: string, amount: string): string {
  const safeName = escapeHtml(name);
  const safeAmount = escapeHtml(amount);
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
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0d9488;text-transform:uppercase;">Payment confirmed</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Hi ${safeName} ✓</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
            Your DirectHire Employer subscription payment of <strong>${safeAmount}</strong> was successful.
          </p>
          <p style="margin:0;font-size:13px;color:#64748b;">
            Your access is active and uninterrupted. Log in anytime to find and connect with workers.
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

function failEmail(name: string): string {
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
            Log in to your account and visit the Subscription page to update your payment details.
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
