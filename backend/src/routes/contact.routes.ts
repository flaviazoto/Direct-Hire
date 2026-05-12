// backend/src/routes/contact.routes.ts
import { Router, Request, Response } from "express";
import { submitContact } from "../controllers/contact.controller";
import { sendEmail, OWNER_EMAIL, FROM_NO_REPLY } from "../services/email";

export const contactRouter = Router();

contactRouter.post("/", submitContact);

// ── TEST ENDPOINT — delete after confirming email works ───────
// Visit: GET /api/test-email
// Sends a test email to OWNER_EMAIL and returns { ok: true } if successful.
contactRouter.get("/test-email", async (_req: Request, res: Response) => {
  try {
    await sendEmail({
      to:        OWNER_EMAIL,
      from:      FROM_NO_REPLY,
      emailType: "GENERAL",
      subject:   "DirectHire email test — working!",
      html:      `<p>Email system is working correctly.</p><p>Sent at: ${new Date().toISOString()}</p>`,
      text:      "Email system is working correctly.",
    });
    res.json({ ok: true, message: `Test email sent to ${OWNER_EMAIL}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});
