// backend/scripts/backfill-invoices.ts
// Retroactive invoice generation for Payment rows created before the invoice
// feature existed (services/invoices/index.ts). As of writing there are 6
// such rows, all type WORKER_LOCK (reservation charges/extensions/refunds
// from the confirmLock/confirmExtendLock/releaseLock flows) — no
// SUBSCRIPTION or APPLICATION_FEE rows exist yet in production.
//
// Unlike the other scripts/backfill-*.ts scripts, this one goes through
// Prisma (not raw pg over DIRECT_URL) and calls the real generateInvoice()
// service function directly. That function's PDF render + Supabase upload +
// atomic invoice-number allocation + transactional email send isn't
// something worth reimplementing in raw SQL for a one-off script — reusing
// the exact same code path the live money-event sites use is the safer bet.
//
// generateInvoice() is already idempotent (it looks up any existing
// Invoice.paymentId before doing anything), so re-running this script is
// always safe — already-backfilled or already-live-generated rows are
// skipped automatically.
//
// Run:
//   npm run backfill:invoices              (dry run — lists rows, no writes/emails)
//   npm run backfill:invoices -- --execute (generates + uploads + emails invoices)

import "dotenv/config";
import prisma from "../src/lib/prisma";
import { generateInvoice } from "../src/services/invoices";

const EXECUTE = process.argv.includes("--execute") || process.argv.includes("--apply");

async function main() {
  console.log(`[backfill-invoices] mode: ${EXECUTE ? "EXECUTE (will generate, upload, email)" : "DRY RUN (no writes)"}`);

  const payments = await prisma.payment.findMany({
    where:   { status: { in: ["SUCCEEDED", "REFUNDED"] }, invoice: null },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          email: true,
          employerProfile: { select: { companyName: true, contactPersonName: true, nipt: true } },
          workerProfile:    { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  console.log(`[backfill-invoices] found ${payments.length} Payment row(s) without an Invoice`);

  let done = 0;
  const failures: { id: string; error: string }[] = [];

  for (const payment of payments) {
    const payer = payment.type === "APPLICATION_FEE"
      ? { name: [payment.user.workerProfile?.firstName, payment.user.workerProfile?.lastName].filter(Boolean).join(" ") || "Worker", nipt: null }
      : { name: payment.user.employerProfile?.companyName ?? payment.user.employerProfile?.contactPersonName ?? "Employer", nipt: payment.user.employerProfile?.nipt ?? null };

    console.log(
      `[backfill-invoices] ${EXECUTE ? "GENERATING" : "WOULD GENERATE"} ${payment.id} — ` +
      `${payment.type}, ${payment.currency.toUpperCase()} ${(payment.amount / 100).toFixed(2)}, payer: ${payer.name}`,
    );

    if (!EXECUTE) continue;

    try {
      await generateInvoice({
        paymentId:       payment.id,
        userId:          payment.userId,
        type:            payment.type,
        amountCents:     payment.amount,
        currency:        payment.currency,
        description:     payment.description ?? payment.type,
        stripeReference: payment.stripePaymentId,
        payer,
      });
      done++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failures.push({ id: payment.id, error: message });
      console.error(`[backfill-invoices] FAIL ${payment.id} — ${message}`);
    }
  }

  console.log("");
  console.log(
    `[backfill-invoices] ${EXECUTE ? "done" : "dry run complete"} — ` +
    `${EXECUTE ? `generated: ${done}, ` : ""}total: ${payments.length}, failed: ${failures.length}`,
  );

  if (failures.length > 0) {
    console.log(`[backfill-invoices] failed payment ids: ${failures.map(f => f.id).join(", ")}`);
  }

  await prisma.$disconnect();
  if (failures.length > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("[backfill-invoices] FATAL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
