-- Add INVOICE_RECEIPT to EmailType — the transactional receipt sent as a
-- PDF-attachment email alongside every generated Invoice (see
-- services/invoices/index.ts). Not suppressible — deliberately left out of
-- lib/unsubscribe.ts's NON_TRANSACTIONAL_EMAIL_TYPES set, same as every
-- other payment-confirmation email in this codebase.
--
-- Additive only — same ALTER TYPE ... ADD VALUE IF NOT EXISTS pattern as
-- 20260719190000_add_job_match_email_type, kept as its own migration for the
-- same reason that one was: a newly-added enum value can't safely be used in
-- the same transaction that adds it, so the tables that reference it
-- (added in 20260722010000_add_invoices) are a separate, sequenced migration.

ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'INVOICE_RECEIPT';
