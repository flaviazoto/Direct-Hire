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

// ── Visual design tokens ───────────────────────────────────────────────────────
// Three document "roles": employer (invoices), worker (receipts), and credit
// notes (always employer-billed refunds in practice — see the five call
// sites in generateInvoice's callers — but styled by isCredit regardless of
// role, per design spec). Fonts: Inter/IBM Plex Mono are NOT embedded — no
// .ttf/.otf files exist anywhere in this repo or its installed packages (the
// frontend's next/font files are hashed build artifacts, not stable static
// assets a backend service should depend on), so this uses pdfkit's built-in
// standard-14 fonts: Helvetica/Helvetica-Bold as the Inter substitute,
// Courier/Courier-Bold as the IBM Plex Mono substitute (true monospace, so
// numeric columns still align).
const PAGE_W = 612, PAGE_H = 792; // US Letter, points
const MARGIN_X = 56, MARGIN_TOP = 48, MARGIN_BOTTOM = 48;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 500

const INK    = "#0B1120";
const BODY   = "#334155";
const MUTED  = "#64748B";
const FAINT  = "#94A3B8";
const LINE   = "#E2E8F0";
const PANEL_BG = "#F8FAFC";
const PANEL_BORDER = "#F1F5F9";

const ROLE_ACCENT: Record<"employer" | "worker", string> = {
  employer: "#7C3AED", // violet-600
  worker:   "#0D9488", // teal-600
};
const CREDIT_ACCENT = "#EA580C"; // warning/amber-600

const TOTAL_TINT: Record<"employer" | "worker" | "credit", { bg: string; text: string }> = {
  employer: { bg: "#F5F3FF", text: "#6D28D9" }, // violet-50 / violet-700
  worker:   { bg: "#F0FDFA", text: "#0F766E" }, // teal-50 / teal-700
  credit:   { bg: "#FFF7ED", text: "#EA580C" }, // amber-50 / warning
};

const STATUS_TINT = {
  paid:     { bg: "#F0FDF4", text: "#16A34A" }, // success
  refunded: { bg: "#FFF7ED", text: "#EA580C" }, // warning
};

function fmtAmount(amountCents: number, currency: string, negative: boolean): string {
  const abs = Math.abs(amountCents) / 100;
  return `${negative ? "-" : ""}${currency.toUpperCase()} ${abs.toFixed(2)}`;
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
  /** Mirrors Payment.type — used only to pick the role tint (worker receipt
   *  vs. employer invoice), not stored or queried anew. */
  role:          "employer" | "worker";
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_X, right: MARGIN_X },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const accentColor = opts.isCredit ? CREDIT_ACCENT : ROLE_ACCENT[opts.role];
    const totalTint    = opts.isCredit ? TOTAL_TINT.credit : TOTAL_TINT[opts.role];
    const statusTint   = opts.isCredit ? STATUS_TINT.refunded : STATUS_TINT.paid;
    const statusLabel  = opts.isCredit ? "Refunded" : "Paid";
    const documentTitle = opts.isCredit ? "CREDIT NOTE" : opts.role === "worker" ? "RECEIPT" : "INVOICE";
    const amountDisplay = fmtAmount(opts.amountCents, opts.currency, opts.isCredit);
    const issuedAtDisplay = opts.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    // ── 6pt accent top bar (full bleed, ignores margins) ──────────────────────
    doc.rect(0, 0, PAGE_W, 6).fill(accentColor);

    // ── Header: DirectHire wordmark (left) + title/number/status (right) ─────
    doc.fontSize(20).fillColor(INK).font("Helvetica-Bold").text("DirectHire", MARGIN_X, MARGIN_TOP);
    doc.fontSize(9).fillColor(MUTED).font("Helvetica").text("directhire.cc", MARGIN_X, MARGIN_TOP + 24);

    const rightColW = 220;
    const rightColX = MARGIN_X + CONTENT_W - rightColW;
    doc.fontSize(30).fillColor(INK).font("Helvetica-Bold")
      .text(documentTitle, rightColX, MARGIN_TOP - 4, { width: rightColW, align: "right" });
    doc.fontSize(10).fillColor(BODY).font("Courier")
      .text(opts.invoiceNumber, rightColX, MARGIN_TOP + 30, { width: rightColW, align: "right" });

    // Status pill — tinted rounded rect, sized to its own label
    doc.fontSize(9).font("Helvetica-Bold");
    const pillPadX = 10, pillH = 18;
    const pillTextW = doc.widthOfString(statusLabel);
    const pillW = pillTextW + pillPadX * 2;
    const pillX = MARGIN_X + CONTENT_W - pillW;
    const pillY = MARGIN_TOP + 48;
    doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2).fill(statusTint.bg);
    doc.fillColor(statusTint.text).font("Helvetica-Bold").fontSize(9)
      .text(statusLabel, pillX, pillY + 5, { width: pillW, align: "center" });

    let y = MARGIN_TOP + 88;
    doc.moveTo(MARGIN_X, y).lineTo(MARGIN_X + CONTENT_W, y).lineWidth(1).strokeColor(LINE).stroke();
    y += 22;

    // ── Meta strip: light 3-column panel — issue date / payment ref / currency
    const metaH = 50;
    doc.roundedRect(MARGIN_X, y, CONTENT_W, metaH, 8).fillAndStroke(PANEL_BG, PANEL_BORDER);
    const metaCols: { label: string; value: string }[] = [
      { label: "ISSUE DATE",         value: issuedAtDisplay },
      { label: "PAYMENT REFERENCE",  value: opts.stripeReference ?? "—" },
      { label: "CURRENCY",           value: opts.currency.toUpperCase() },
    ];
    const metaColW = CONTENT_W / 3;
    metaCols.forEach((col, i) => {
      const cx = MARGIN_X + i * metaColW + 18;
      const cw = metaColW - 28;
      doc.fontSize(8).fillColor(FAINT).font("Helvetica-Bold")
        .text(col.label, cx, y + 11, { width: cw, characterSpacing: 0.5 });
      doc.fontSize(11).fillColor(INK).font("Courier")
        .text(col.value, cx, y + 26, { width: cw, height: 13, ellipsis: true });
    });
    y += metaH + 30;

    // ── Bill-to block ──────────────────────────────────────────────────────────
    doc.fontSize(11).fillColor(MUTED).font("Helvetica-Bold")
      .text("BILLED TO", MARGIN_X, y, { characterSpacing: 1 });
    y += 18;
    doc.fontSize(16).fillColor(INK).font("Helvetica-Bold").text(opts.payer.name, MARGIN_X, y);
    y += 22;
    if (opts.payer.nipt) {
      doc.fontSize(13).fillColor(MUTED).font("Helvetica").text(`NIPT: ${opts.payer.nipt}`, MARGIN_X, y);
      y += 20;
    }
    y += 16;

    // ── Line-item table (single row — one Payment per document) ──────────────
    doc.fontSize(11).fillColor(MUTED).font("Helvetica-Bold")
      .text("DESCRIPTION", MARGIN_X, y, { characterSpacing: 0.5 })
      .text("AMOUNT", MARGIN_X, y, { width: CONTENT_W, align: "right", characterSpacing: 0.5 });
    y += 20;
    doc.moveTo(MARGIN_X, y).lineTo(MARGIN_X + CONTENT_W, y).lineWidth(2).strokeColor(INK).stroke();
    y += 16;

    doc.fontSize(12).fillColor(BODY).font("Helvetica")
      .text(opts.description, MARGIN_X, y, { width: CONTENT_W - 160 });
    doc.fontSize(12).fillColor(INK).font("Courier")
      .text(amountDisplay, MARGIN_X, y, { width: CONTENT_W, align: "right" });
    y += 28;
    doc.moveTo(MARGIN_X, y).lineTo(MARGIN_X + CONTENT_W, y).lineWidth(1).strokeColor(LINE).stroke();
    y += 28;

    // ── Total — role/warning-tinted box, right-aligned ────────────────────────
    const totalBoxW = 220, totalBoxH = 60;
    const totalBoxX = MARGIN_X + CONTENT_W - totalBoxW;
    doc.roundedRect(totalBoxX, y, totalBoxW, totalBoxH, 10).fill(totalTint.bg);
    doc.fontSize(10).fillColor(totalTint.text).font("Helvetica-Bold")
      .text(opts.isCredit ? "TOTAL CREDIT" : "TOTAL", totalBoxX + 18, y + 13, { characterSpacing: 0.5 });
    doc.fontSize(22).fillColor(totalTint.text).font("Courier-Bold")
      .text(amountDisplay, totalBoxX, y + 30, { width: totalBoxW - 18, align: "right" });

    // ── Footer (fixed near the bottom — single-item documents never reach it
    //    while flowing, so an absolute position is safe) ──────────────────────
    let footerY = PAGE_H - MARGIN_BOTTOM - 96;
    if (OPERATOR_LEGAL_DETAILS.registrationNo) {
      doc.fontSize(9).fillColor(MUTED).font("Helvetica")
        .text(OPERATOR_LEGAL_DETAILS.legalName, MARGIN_X, footerY)
        .text(`Reg. No: ${OPERATOR_LEGAL_DETAILS.registrationNo}`, MARGIN_X, footerY + 12)
        .text(OPERATOR_LEGAL_DETAILS.registeredAddress ?? "", MARGIN_X, footerY + 24)
        .text(OPERATOR_LEGAL_DETAILS.vatNumber ? `VAT: ${OPERATOR_LEGAL_DETAILS.vatNumber}` : "", MARGIN_X, footerY + 36);
      footerY += 52;
    } else {
      doc.fontSize(8).fillColor(FAINT).font("Helvetica-Oblique")
        .text("[Operator legal registration details not yet configured — see OPERATOR_LEGAL_DETAILS in services/invoices/index.ts]", MARGIN_X, footerY, { width: CONTENT_W });
      footerY += 28;
    }

    if (opts.stripeReference) {
      doc.fontSize(13).fillColor(MUTED).font("Helvetica")
        .text("Payment reference: ", MARGIN_X, footerY, { continued: true })
        .font("Courier").text(opts.stripeReference);
      footerY += 20;
    }

    doc.fontSize(9).fillColor(FAINT).font("Helvetica")
      .text(
        opts.isCredit
          ? "This credit note confirms a refund issued to your original payment method."
          : opts.role === "worker"
            ? "Thank you for using DirectHire. This receipt was generated automatically."
            : "Thank you for your business. This invoice was generated automatically by DirectHire.",
        MARGIN_X, PAGE_H - MARGIN_BOTTOM - 16, { width: CONTENT_W, align: "center" },
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
    // WORKER_LOCK/SUBSCRIPTION Payment rows are always billed to the employer;
    // APPLICATION_FEE rows are always billed to the worker (see the five call
    // sites) — same derivation the receipt email path below already uses.
    const role         = input.type === "APPLICATION_FEE" ? "worker" as const : "employer" as const;
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
      role,
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
