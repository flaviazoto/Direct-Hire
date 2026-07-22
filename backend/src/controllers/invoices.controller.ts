// backend/src/controllers/invoices.controller.ts
// Invoice download — shared across worker/employer/admin (an invoice's payer
// can be either role), so this is gated by requireAnyAuth + an ownership
// check in the handler rather than a role-specific middleware.
import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";
import { getSignedUrlForPath } from "../services/storage";

// ── GET /invoices/:invoiceId/url ───────────────────────────────────────────────
export async function getInvoiceUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;
    const { invoiceId } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where:  { id: invoiceId },
      select: { id: true, userId: true, filePath: true, invoiceNumber: true },
    });
    if (!invoice) return err(res, "Invoice not found", 404);

    if (invoice.userId !== userId && role !== "ADMIN") {
      return err(res, "Forbidden", 403);
    }

    const url = await getSignedUrlForPath(invoice.filePath);
    return ok(res, { url, invoiceNumber: invoice.invoiceNumber });
  } catch (e) { next(e); }
}
