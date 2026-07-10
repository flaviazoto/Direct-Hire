// backend/src/controllers/unsubscribe.controller.ts
// Public (no auth) — reached by clicking the "Unsubscribe" link in the
// footer of a non-transactional email. Returns a minimal, self-contained
// HTML confirmation page directly (no separate frontend route/JS bundle) —
// reachable at https://directhire.cc/api/unsubscribe?token=... through the
// existing /api/* rewrite (frontend/next.config.js), same as every other
// backend endpoint.

import { Request, Response } from "express";
import prisma from "../lib/prisma";

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title} — DirectHire</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FF;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="max-width:440px;width:90%;background:#fff;border-radius:20px;border:1px solid #E2E8F0;padding:40px;text-align:center;">
    <span style="font-size:20px;font-weight:800;color:#08142A;letter-spacing:-0.5px;">DirectHire</span>
    <h1 style="font-size:20px;color:#0f172a;margin:24px 0 12px;">${title}</h1>
    <div style="font-size:14px;color:#475569;line-height:1.7;">${body}</div>
  </div>
</body>
</html>`;
}

export async function unsubscribe(req: Request, res: Response) {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;

  if (!token) {
    return res.status(400).send(page("Invalid link", "No unsubscribe token was provided."));
  }

  const user = await prisma.user.findUnique({
    where:  { unsubscribeToken: token },
    select: { id: true, email: true, emailUnsubscribedAt: true },
  });

  if (!user) {
    return res.status(404).send(page("Invalid or expired link", "This unsubscribe link is no longer valid."));
  }

  if (!user.emailUnsubscribedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data:  { emailUnsubscribedAt: new Date() },
    });
  }

  return res.status(200).send(page(
    "You've been unsubscribed",
    `${user.email} will no longer receive reminder emails from DirectHire.<br/><br/>
     You'll still receive essential account, application-status, and security emails — those aren't affected by this preference.`,
  ));
}
