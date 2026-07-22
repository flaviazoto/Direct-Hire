// backend/src/services/invoices/index.ts
// Generates a one-page PDF invoice (or credit note) for a single Payment
// row, stores it in the private bucket, records an Invoice row, and emails
// it as an attachment. Called non-fatally from the five money-event sites
// (subscription webhook, lock confirm, lock extension confirm, lock release
// refund, application-fee confirm) — a failure here must never affect the
// payment flow that triggered it, so every caller wraps this in its own
// try/catch (or just relies on the internal one below) and callers should
// never `await` this in a way that blocks the HTTP response.

import PDFDocument from "pdfkit";
import prisma from "../../lib/prisma";
import { uploadRawBuffer } from "../storage";
import { sendInvoiceReceiptEmail } from "../email";

// ── Buyer-configurable operator legal details ────────────────────────────────
// Left blank on purpose — this codebase has no real registered business
// entity behind it yet (see docs/DEPLOYMENT_OPERATIONS.md's Stripe section:
// Albania isn't a Stripe-supported country, an EU entity such as one set up
// via Estonian e-Residency is the documented path forward). Fabricating a
// registration/VAT number on a real financial document would be actively
// wrong, not just a placeholder — so the PDF prints an explicit, clearly
// labeled "not yet registered" block instead of inventing one. Fill these in
// the moment a real entity exists; nothing else in this file needs to change.
export const OPERATOR_LEGAL_DETAILS: {
  legalName:         string;
  registrationNo:    string | null;
  registeredAddress: string | null;
  vatNumber:         string | null;
} = {
  legalName:         "DirectHire",
  registrationNo:    null,
  registeredAddress: null,
  vatNumber:         null,
};

export interface InvoicePayer {
  /** Company name for employers, full name for workers. */
  name: string;
  /** Employer-only — NIPT (Albanian business registration number). */
  nipt?: string | null;
}

export interface GenerateInvoiceInput {
  paymentId:       string;
  userId:          string;
  /** Mirrors Payment.type verbatim (WORKER_LOCK | SUBSCRIPTION | APPLICATION_FEE). */
  type:            string;
  /** Signed, smallest currency unit — negative means refund/credit note. */
  amountCents:     number;
  currency:        string;
  description:     string;
  /** Stripe PaymentIntent/charge/refund id, whichever the site has. */
  stripeReference: string | null;
  payer:           InvoicePayer;
}

// ── Sequential numbering ──────────────────────────────────────────────────────
// Atomic per-year counter — a single INSERT ... ON CONFLICT DO UPDATE ...
// RETURNING serializes concurrent callers via Postgres's row lock on the
// year's row, so two invoices generated in the same instant can never
// collide. A "SELECT MAX(...) + 1" approach would race under concurrent
// writes; this doesn't.
async function nextInvoiceNumber(year: number): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "InvoiceCounter" ("year", "lastNumber")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "lastNumber" = "InvoiceCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  const n = rows[0]?.lastNumber ?? 1;
  return `DH-${year}-${String(n).padStart(5, "0")}`;
}

// ── PDF rendering ─────────────────────────────────────────────────────────────
function renderInvoicePdf(opts: {
  invoiceNumber: string;
  issuedAt:      Date;
  payer:         InvoicePayer;
  description:   string;
  amountCents:   number; // signed
  currency:      string;
  stripeReference: string | null;
  isCredit:      boolean;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const documentTitle = opts.isCredit ? "CREDIT NOTE" : "INVOICE";
    const amountAbs     = Math.abs(opts.amountCents) / 100;
    const amountDisplay = `${opts.isCredit ? "-" : ""}${opts.currency.toUpperCase()} ${amountAbs.toFixed(2)}`;

    // ── Header: DirectHire brand block (left) + document title/number (right) ──
    doc.fontSize(20).fillColor("#08142A").font("Helvetica-Bold").text("DirectHire", 50, 50);
    doc.fontSize(10).fillColor("#64748B").font("Helvetica").text("directhire.cc", 50, 74);

    doc.fontSize(18).fillColor(opts.isCredit ? "#B45309" : "#08142A").font("Helvetica-Bold")
      .text(documentTitle, 300, 50, { width: 245, align: "right" });
    doc.fontSize(10).fillColor("#334155").font("Helvetica")
      .text(opts.invoiceNumber, 300, 74, { width: 245, align: "right" })
      .text(opts.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), 300, 88, { width: 245, align: "right" });

    doc.moveTo(50, 115).lineTo(545, 115).strokeColor("#E2E8F0").stroke();

    // ── Operator legal details — real once OPERATOR_LEGAL_DETAILS is filled in,
    //    an explicit placeholder block until then (never a fabricated number) ──
    let y = 130;
    if (OPERATOR_LEGAL_DETAILS.registrationNo) {
      doc.fontSize(9).fillColor("#64748B").font("Helvetica")
        .text(OPERATOR_LEGAL_DETAILS.legalName, 50, y)
        .text(`Reg. No: ${OPERATOR_LEGAL_DETAILS.registrationNo}`, 50, y + 12)
        .text(OPERATOR_LEGAL_DETAILS.registeredAddress ?? "", 50, y + 24)
        .text(OPERATOR_LEGAL_DETAILS.vatNumber ? `VAT: ${OPERATOR_LEGAL_DETAILS.vatNumber}` : "", 50, y + 36);
      y += 55;
    } else {
      doc.fontSize(8).fillColor("#94A3B8").font("Helvetica-Oblique")
        .text("[Operator legal registration details not yet configured — see OPERATOR_LEGAL_DETAILS in services/invoices/index.ts]", 50, y, { width: 495 });
      y += 30;
    }

    // ── Payer ─────────────────────────────────────────────────────────────────
    doc.fontSize(10).fillColor("#94A3B8").font("Helvetica").text("BILLED TO", 50, y);
    y += 14;
    doc.fontSize(12).fillColor("#08142A").font("Helvetica-Bold").text(opts.payer.name, 50, y);
    y += 16;
    if (opts.payer.nipt) {
      doc.fontSize(10).fillColor("#334155").font("Helvetica").text(`NIPT: ${opts.payer.nipt}`, 50, y);
      y += 16;
    }
    y += 20;

    // ── Line item table ───────────────────────────────────────────────────────
    doc.rect(50, y, 495, 24).fill("#F7F9FF");
    doc.fontSize(10).fillColor("#64748B").font("Helvetica-Bold")
      .text("DESCRIPTION", 60, y + 7)
      .text("AMOUNT", 300, y + 7, { width: 235, align: "right" });
    y += 24;

    doc.moveTo(50, y).lineTo(545, y).strokeColor("#E2E8F0").stroke();
    y += 14;
    doc.fontSize(11).fillColor("#334155").font("Helvetica")
      .text(opts.description, 60, y, { width: 235 })
      .text(amountDisplay, 300, y, { width: 235, align: "right" });
    y += 30;

    doc.moveTo(50, y).lineTo(545, y).strokeColor("#E2E8F0").stroke();
    y += 14;
    doc.fontSize(13).fillColor("#08142A").font("Helvetica-Bold")
      .text("Total", 60, y)
      .text(amountDisplay, 300, y, { width: 235, align: "right" });
    y += 40;

    // ── Payment reference ─────────────────────────────────────────────────────
    if (opts.stripeReference) {
      doc.fontSize(9).fillColor("#94A3B8").font("Helvetica")
        .text(`Payment reference: ${opts.stripeReference}`, 50, y);
      y += 20;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.fontSize(9).fillColor("#94A3B8").font("Helvetica")
      .text(
        opts.isCredit
          ? "This credit note confirms a partial refund issued to your original payment method."
          : "Thank you for your business. This receipt was generated automatically by DirectHire.",
        50, 760, { width: 495, align: "center" },
      );

    doc.end();
  });
}

// ── Public entry point ────────────────────────────────────────────────────────
// Never throws — every failure is caught and logged. Callers should invoke
// this fire-and-forget (`.catch(console.error)` or just don't await it before
// responding) so a slow PDF render/upload/email never adds latency to the
// payment flow itself.
export async function generateInvoice(input: GenerateInvoiceInput): Promise<void> {
  try {
    // Idempotent — a retry or double-call for the same Payment must not mint
    // a second invoice number or send a second email.
    const existing = await prisma.invoice.findUnique({ where: { paymentId: input.paymentId } });
    if (existing) {
      console.log(`[generateInvoice] Invoice already exists for payment ${input.paymentId} (${existing.invoiceNumber}) — skipping`);
      return;
    }

    const isCredit     = input.amountCents < 0;
    const issuedAt     = new Date();
    const year         = issuedAt.getFullYear();
    const invoiceNumber = await nextInvoiceNumber(year);

    const pdfBuffer = await renderInvoicePdf({
      invoiceNumber,
      issuedAt,
      payer:           input.payer,
      description:     input.description,
      amountCents:     input.amountCents,
      currency:        input.currency,
      stripeReference: input.stripeReference,
      isCredit,
    });

    const filePath = `invoices/${input.userId}/${invoiceNumber}.pdf`;
    await uploadRawBuffer(filePath, pdfBuffer, "application/pdf", true);

    await prisma.invoice.create({
      data: {
        invoiceNumber,
        paymentId:   input.paymentId,
        userId:      input.userId,
        type:        input.type,
        amountCents: input.amountCents,
        currency:    input.currency,
        description: input.description,
        filePath,
        issuedAt,
      },
    });

    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    if (user) {
      const amountDisplay = `${isCredit ? "-" : ""}${input.currency.toUpperCase()} ${(Math.abs(input.amountCents) / 100).toFixed(2)}`;
      // WORKER_LOCK/SUBSCRIPTION Payment rows are always billed to the
      // employer (userId = employerId); APPLICATION_FEE rows are always
      // billed to the worker (userId = workerId) — see the five call sites.
      // Derived from type rather than threading an explicit role through
      // every caller.
      const paymentsPath = input.type === "APPLICATION_FEE" ? "/worker/payments" : "/employer/subscription";
      await sendInvoiceReceiptEmail({
        userId:        input.userId,
        to:            user.email,
        firstName:     input.payer.name.split(" ")[0] || input.payer.name,
        invoiceNumber,
        amountDisplay,
        description:   input.description,
        isCredit,
        pdfBuffer,
        paymentsPath,
      });
    }

    console.log(`[generateInvoice] ${invoiceNumber} generated for payment ${input.paymentId}`);
  } catch (e) {
    console.error(`[generateInvoice] Failed for payment ${input.paymentId}:`, e);
  }
}
