-- Invoice generation: one Invoice row per Payment row, plus a small atomic
-- per-year counter table backing the sequential "DH-2026-00001" numbering
-- scheme (services/invoices/index.ts). Purely additive — two new tables,
-- nothing existing is touched.

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id"            TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "paymentId"     TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "amountCents"   INTEGER NOT NULL,
    "currency"      TEXT NOT NULL,
    "description"   TEXT NOT NULL,
    "filePath"      TEXT NOT NULL,
    "issuedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_paymentId_key"     ON "Invoice"("paymentId");
CREATE INDEX IF NOT EXISTS "Invoice_userId_idx"                ON "Invoice"("userId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "InvoiceCounter" (
    "year"       INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);
