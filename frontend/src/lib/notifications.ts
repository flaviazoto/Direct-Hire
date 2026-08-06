// frontend/src/lib/notifications.ts
// Shared helpers for the worker/employer/admin notification pages and the
// DashboardHeader dropdown — icon-per-type mapping and date-grouping.
//
// Icon map is built from the real NotificationType values actually written
// by the backend (grepped every prisma.notification.create/createMany call
// site — the notifications-UI audit), not the ~6 previously mapped on the
// worker page, and not any invented categories. PROFILE_APPROVED/
// PROFILE_REJECTED are declared in the enum with zero real call sites today
// but are included for correctness if that ever changes.
//
// new_job_pending/lock_overridden were the two lowercase legacy values —
// normalized to NEW_JOB_PENDING/LOCK_OVERRIDDEN via a schema migration
// (confirmed zero real rows used either lowercase value first, so this is a
// clean Postgres ALTER TYPE RENAME VALUE, not a data backfill — no dual-value
// lookup needed here since the old string can no longer exist in the DB).

export interface NotifItem {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

const NOTIFICATION_ICONS: Record<string, string> = {
  MESSAGE_RECEIVED:     "✉️",
  APPLICATION_SUBMITTED: "📝",
  APPLICATION_UPDATE:   "📋",
  JOB_MATCH:            "🎯",

  // Lock family — shares a lock/key visual language
  WORKER_LOCKED:        "🔒",
  WORKER_LOCK_EXTENDED: "🔒",
  WORKER_LOCK_RELEASED: "🔓",
  LOCK_EXPIRY_WARNING:  "⏰",
  LOCK_EXPIRED:         "⌛",
  LOCK_OVERRIDDEN:      "🔑",

  // Document family
  DOCUMENT_PENDING:  "📄",
  DOCUMENT_APPROVED: "✅",
  DOCUMENT_REJECTED: "❌",

  // Application-review outcomes
  REVIEW_APPROVED:      "✅",
  REVIEW_REJECTED:      "❌",
  REVIEW_NEEDS_CHANGES: "✏️",

  // Account status family
  ACCOUNT_APPROVED:   "✅",
  ACCOUNT_REJECTED:   "❌",
  ACCOUNT_SUSPENDED:  "⛔",
  ACCOUNT_REINSTATED: "🔄",

  // Legacy profile-review type — no real call sites today, kept for
  // correctness/future-proofing per the audit.
  PROFILE_APPROVED: "✅",
  PROFILE_REJECTED: "❌",

  ADMIN_JOB_MODERATION: "🛠️",
  NEW_JOB_PENDING:      "🆕",

  GENERAL: "🔔",
};

export function getNotificationIcon(type: string): string {
  return NOTIFICATION_ICONS[type] ?? "🔔";
}

export type DateGroupLabel = "Today" | "Yesterday" | "This week" | "Older";
const GROUP_ORDER: DateGroupLabel[] = ["Today", "Yesterday", "This week", "Older"];

function dateGroupFor(iso: string): DateGroupLabel {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  if (d >= startOfToday) return "Today";
  if (d >= startOfYesterday) return "Yesterday";
  if (d >= startOfWeek) return "This week";
  return "Older";
}

// Buckets are mutually exclusive and emitted in a fixed order, skipping any
// empty bucket. Assumes the input is already sorted newest-first (every
// notifications endpoint orders by createdAt desc), which is preserved
// within each bucket since items are only ever appended.
export function groupNotificationsByDate<T extends { createdAt: string }>(
  notifs: T[],
): { group: DateGroupLabel; items: T[] }[] {
  const buckets = new Map<DateGroupLabel, T[]>();
  for (const n of notifs) {
    const g = dateGroupFor(n.createdAt);
    const bucket = buckets.get(g);
    if (bucket) bucket.push(n);
    else buckets.set(g, [n]);
  }
  return GROUP_ORDER.filter(g => buckets.has(g)).map(g => ({ group: g, items: buckets.get(g)! }));
}

export function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
