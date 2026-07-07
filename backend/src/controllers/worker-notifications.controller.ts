// backend/src/controllers/worker-notifications.controller.ts
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ok, err, paginated, getPagination } from "../lib/response";

// GET /api/worker/notifications
export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);
    const unreadOnly = req.query.unreadOnly === "true";

    const where = { userId, ...(unreadOnly ? { isRead: false } : {}) };

    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id:        true,
          type:      true,
          title:     true,
          body:      true,
          isRead:    true,
          link:      true,
          metadata:  true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
}

// GET /api/worker/notifications/unread-count
export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const count = await prisma.notification.count({ where: { userId, isRead: false } });
    return ok(res, { count });
  } catch (e) { next(e); }
}

// PATCH /api/worker/notifications/:id/read
export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) return err(res, "Notification not found", 404);

    await prisma.notification.update({ where: { id }, data: { isRead: true } });
    return ok(res, null, "Marked as read");
  } catch (e) { next(e); }
}

// PATCH /api/worker/notifications/read-all
export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return ok(res, null, "All marked as read");
  } catch (e) { next(e); }
}

// GET /api/worker/messages or GET /api/employer/messages — role-agnostic:
// returns whatever was sent TO the authenticated user, regardless of role.
// The sender could be either a worker or an employer, so both profile shapes
// are checked when deriving a display name.
export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { page, limit, skip } = getPagination(req.query as Record<string, unknown>);

    const where = { recipientId: userId };

    const [rows, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id:        true,
          body:      true,
          isRead:    true,
          createdAt: true,
          sender: {
            select: {
              id:              true,
              employerProfile: { select: { companyName: true, contactPersonName: true } },
              workerProfile:   { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.message.count({ where }),
    ]);

    const enriched = rows.map(m => {
      const workerName = [m.sender.workerProfile?.firstName, m.sender.workerProfile?.lastName]
        .filter(Boolean).join(" ") || undefined;
      return {
        id:         m.id,
        body:       m.body,
        isRead:     m.isRead,
        createdAt:  m.createdAt,
        senderId:   m.sender.id,
        senderName: m.sender.employerProfile?.contactPersonName
                    ?? m.sender.employerProfile?.companyName
                    ?? workerName
                    ?? "User",
      };
    });

    return paginated(res, enriched, total, page, limit);
  } catch (e) { next(e); }
}

// PATCH/POST .../messages/:id/read — role-agnostic (filters by recipientId).
export async function markMessageRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { id } = req.params;

    const msg = await prisma.message.findFirst({ where: { id, recipientId: userId } });
    if (!msg) return err(res, "Message not found", 404);

    await prisma.message.update({ where: { id }, data: { isRead: true } });
    return ok(res, null, "Marked as read");
  } catch (e) { next(e); }
}

// POST /api/worker/messages/:otherUserId/reply
// Worker replies to whoever sent them a message (an employer). Message model
// is already bidirectional (senderId/recipientId are plain User FKs), so this
// is the same shape as employer.controller.ts's messageWorker, just reversed.
const ReplyMessageSchema = z.object({
  body: z.string().min(1, "Message cannot be empty").max(500, "Message must be 500 characters or fewer"),
});

export async function replyToMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const workerId = req.user!.sub;
    const { otherUserId } = req.params;

    const parsed = ReplyMessageSchema.safeParse(req.body);
    if (!parsed.success) return err(res, parsed.error.errors[0].message, 422);
    const { body } = parsed.data;

    const [recipient, worker] = await Promise.all([
      prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true, role: true } }),
      prisma.user.findUnique({
        where:  { id: workerId },
        select: { workerProfile: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    if (!recipient) return err(res, "Recipient not found", 404);

    const workerName = [worker?.workerProfile?.firstName, worker?.workerProfile?.lastName]
      .filter(Boolean).join(" ") || "A candidate";

    await prisma.message.create({
      data: { senderId: workerId, recipientId: otherUserId, body },
    });

    prisma.notification.create({
      data: {
        userId: otherUserId,
        type:   "MESSAGE_RECEIVED",
        title:  `New message from ${workerName}`,
        body:   body.slice(0, 100) + (body.length > 100 ? "…" : ""),
        link:   "/employer/messages",
      },
    }).catch((e: unknown) => console.error("[replyToMessage notif]", e));

    return ok(res, null, "Reply sent");
  } catch (e) { next(e); }
}
