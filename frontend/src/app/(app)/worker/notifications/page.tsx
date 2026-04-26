"use client";
// src/app/(app)/worker/notifications/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { userApi } from "@/lib/api-client";
import {
  LoadingPage, PageHeader, Card, CardContent, Badge, Button,
  EmptyState, ToastDisplay, type ToastData,
} from "@/components/ui";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

const TYPE_ICON: Record<string, string> = {
  REVIEW_APPROVED:     "✅",
  REVIEW_REJECTED:     "❌",
  REVIEW_NEEDS_CHANGES: "✏️",
  APPLICATION_SUBMITTED: "📬",
  APPLICATION_STATUS_CHANGE: "📋",
};

export default function WorkerNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState<ToastData>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    userApi.getNotifications().then(res => {
      if (!res.success) { router.push("/login"); return; }
      setNotifications((res.data as unknown as Notification[]) ?? []);
      setLoading(false);
    });
  }, []);

  const markRead = async (id: string) => {
    await userApi.markNotificationRead(id);
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    await Promise.all(unread.map(n => userApi.markNotificationRead(n.id)));
    setNotifications(ns => ns.map(n => ({ ...n, isRead: true })));
    showToast("All marked as read", "ok");
  };

  if (loading) return <LoadingPage color="blue" />;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <ToastDisplay toast={toast} />
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={
          unreadCount > 0
            ? <Button variant="outline" size="sm" onClick={markAllRead}>Mark all read</Button>
            : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="No notifications"
          description="You're all caught up! Notifications about your profile and applications will appear here."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Card
              key={n.id}
              className={n.isRead ? "opacity-75" : ""}
              onClick={() => {
                if (!n.isRead) markRead(n.id);
                if (n.link) router.push(n.link);
              }}
            >
              <CardContent className="flex items-start gap-4 py-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                  {TYPE_ICON[n.type] ?? "🔔"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">{n.title}</span>
                    {!n.isRead && <Badge variant="blue" dot>New</Badge>}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{n.body}</p>
                  <p className="text-xs text-slate-300 mt-1.5">
                    {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {!n.isRead && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
