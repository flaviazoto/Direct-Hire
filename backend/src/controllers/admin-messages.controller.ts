// backend/src/controllers/admin-messages.controller.ts
// Phase 5, Step 2 — admin read access to the Message model. Flat sender/
// recipient, no conversation/thread concept (confirmed in Phase 1's audit).
// Read-only: no delete/edit from the admin side in this task — a separate,
// explicit follow-up if moderation actions are wanted later.

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { ok, err } from "../lib/response";

const PARTICIPANT_SELECT = {
  id: true, email: true, role: true,
  employerProfile: { select: { companyName: true, contactPersonName: true } },
  workerProfile:   { select: { firstName: true, lastName: true } },
} as const;

// ── GET /admin/messages?userId=X&otherUserId=Y ────────────────────────────────
// userId is required — this is meant to be reached starting from a specific
// user (an application's worker/employer, or a user profile), not by
// browsing all messages platform-wide with no starting point. otherUserId is
// optional and narrows to just that pair's history — e.g. investigating a
// specific worker/employer relationship rather than everything userId ever sent.
export async function getMessagesForUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, otherUserId } = req.query as Record<string, string>;
    if (!userId) return err(res, "userId is required", 422);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return err(res, "User not found", 404);

    const where = otherUserId
      ? {
          OR: [
            { senderId: userId, recipientId: otherUserId },
            { senderId: otherUserId, recipientId: userId },
          ],
        }
      : { OR: [{ senderId: userId }, { recipientId: userId }] };

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, body: true, isRead: true, createdAt: true,
        sender:    { select: PARTICIPANT_SELECT },
        recipient: { select: PARTICIPANT_SELECT },
      },
    });

    const displayName = (p: { email: string; role: string; employerProfile: { companyName: string | null; contactPersonName: string | null } | null; workerProfile: { firstName: string | null; lastName: string | null } | null }) => {
      if (p.role === "EMPLOYER") return p.employerProfile?.contactPersonName ?? p.employerProfile?.companyName ?? p.email;
      const name = [p.workerProfile?.firstName, p.workerProfile?.lastName].filter(Boolean).join(" ");
      return name || p.email;
    };

    return ok(res, messages.map(m => ({
      id: m.id, body: m.body, isRead: m.isRead, createdAt: m.createdAt,
      senderId: m.sender.id, senderName: displayName(m.sender), senderRole: m.sender.role,
      recipientId: m.recipient.id, recipientName: displayName(m.recipient), recipientRole: m.recipient.role,
    })));
  } catch (e) { next(e); }
}
