// backend/src/controllers/worker-notifications.controller.ts
import { Request, Response, NextFunction } from "express";
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

// GET /api/worker/messages
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
            },
          },
        },
      }),
      prisma.message.count({ where }),
    ]);

    const enriched = rows.map(m => ({
      id:         m.id,
      body:       m.body,
      isRead:     m.isRead,
      createdAt:  m.createdAt,
      senderId:   m.sender.id,
      senderName: m.sender.employerProfile?.contactPersonName
                  ?? m.sender.employerProfile?.companyName
                  ?? "Employer",
    }));

    return paginated(res, enriched, total, page, limit);
  } catch (e) { next(e); }
}

// PATCH /api/worker/messages/:id/read
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
