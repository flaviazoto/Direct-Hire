// backend/src/lib/audit.ts
import prisma from './prisma';
import crypto from 'crypto';

// ── General audit log (AuditLog model — free-form string actions) ─────────────

export interface AuditEntry {
  actorId:   string;
  targetId:  string;
  action:    string;
  entity?:   string;
  entityId?: string;
  reason?:   string;
  metadata?: Record<string, unknown>;
}

export async function insertAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId:  entry.actorId,
      userId:   entry.targetId,
      action:   entry.action,
      entity:   entry.entity   ?? "System",
      entityId: entry.entityId ?? null,
      newValue: (entry.reason !== undefined || entry.metadata !== undefined)
        ? { ...(entry.reason !== undefined ? { reason: entry.reason } : {}), ...entry.metadata }
        : undefined,
    },
  });
}

// ── Admin audit log (AdminAuditLog table — AuditAction enum, strict FKs) ──────

export interface AdminAuditEntry {
  actorId:   string;
  targetId:  string;
  action:    string;
  notes?:    string | null;
  metadata?: Record<string, unknown> | null;
}

export async function insertAdminAuditLog(entry: AdminAuditEntry): Promise<void> {
  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "audit_log" (id, admin_id, action, target_user_id, notes, metadata, created_at)
     VALUES ($1, $2, $3::"AuditAction", $4, $5, $6::jsonb, NOW())`,
    id,
    entry.actorId,
    entry.action,
    entry.targetId,
    entry.notes    ?? null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
  );
}

// ── Sensitive-data access trail ───────────────────────────────────────────────
// Every time staff are shown private worker documents or decrypted identity
// data, record who, what and from where. Written to the free-form AuditLog
// (no enum migration needed). A logging failure is reported but never blocks
// the reviewer.

export interface SensitiveItem {
  kind: string;  // e.g. an Upload fileType, "PASSPORT_NUMBER", "APPLICATION_DOCUMENT"
  id?:  string;
}

export async function recordSensitiveAccess(
  actor: { sub: string } | undefined,
  targetUserId: string,
  items: SensitiveItem[],
  context: string,
  ip?: string,
): Promise<void> {
  if (!actor || items.length === 0) return;
  await insertAuditLog({
    actorId:  actor.sub,
    targetId: targetUserId,
    action:   "SENSITIVE_DATA_VIEWED",
    entity:   "User",
    entityId: targetUserId,
    metadata: { context, items, ip: ip ?? null },
  }).catch((e) => console.error("[audit] sensitive access log failed:", e instanceof Error ? e.message : e));
}
