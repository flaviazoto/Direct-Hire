"use client";
// src/app/(app)/admin/dashboard/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { LoadingPage } from "@/components/ui";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface Stats {
  users:        { workers: number; employers: number; admins: number; newToday: number };
  verification: { pending: number; approved: number; rejected: number; needsChanges: number };
  uploads:      number;
  emailsToday:  number;
  recentSubmissions: { userId: string; email: string; role: string; submittedAt: string; completionPct: number; name?: string }[];
  monthly:      { month: string; count: number }[];
}

interface PendingUser {
  userId: string;
  email:  string;
  role:   string;
  name:   string;
  completionPct: number;
  submittedAt:   string | null;
  riskScore?:    number;
  country?:      string;
}

interface AuditEntry {
  id:         string;
  adminEmail: string;
  action:     string;
  targetId?:  string;
  targetType?: string;
  createdAt:  string;
}

type ActionStatus = "idle" | "loading" | "done" | "error";

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

function KpiCard({
  label, value, sub, icon, accent,
}: { label: string; value: string | number; sub?: string; icon: string; accent: string }) {
  return (
    <div style={{
      background: "var(--navy-2)",
      border: `1px solid rgba(220,38,38,0.15)`,
      borderRadius: "var(--r-lg)",
      padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        <div style={{
          width: 36, height: 36, borderRadius: "var(--r-sm)",
          background: accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>{icon}</div>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontWeight: 800, fontSize: 28,
        color: "var(--white)",
        lineHeight: 1,
      }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--admin-2)" }}>{sub}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    SUBMITTED:      { label: "Submitted",      color: "#60a5fa", bg: "rgba(59,130,246,0.12)" },
    PENDING_REVIEW: { label: "Pending Review", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
    APPROVED:       { label: "Approved",       color: "#34d399", bg: "rgba(52,211,153,0.12)" },
    REJECTED:       { label: "Rejected",       color: "#f87171", bg: "rgba(248,113,113,0.12)" },
    NEEDS_CHANGES:  { label: "Needs Changes",  color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  };
  const cfg = map[status] ?? { label: status, color: "var(--muted)", bg: "rgba(255,255,255,0.06)" };
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 999, fontSize: 11,
      fontWeight: 700, color: cfg.color, background: cfg.bg,
      letterSpacing: "0.04em",
    }}>{cfg.label}</span>
  );
}

function RiskBadge({ score }: { score: number }) {
  const level = score >= 70 ? "HIGH" : score >= 40 ? "MED" : "LOW";
  const color  = level === "HIGH" ? "#f43f5e" : level === "MED" ? "#f59e0b" : "#10b981";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800,
      color, background: `${color}18`, letterSpacing: "0.05em",
    }}>{level} {score}</span>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminDashboardPage() {
  const router = useRouter();

  const [stats,    setStats]    = useState<Stats | null>(null);
  const [pending,  setPending]  = useState<PendingUser[]>([]);
  const [audit,    setAudit]    = useState<AuditEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);
  const [actMap,   setActMap]   = useState<Record<string, ActionStatus>>({});

  // ── Pricing config state ──────────────────────────────────────────────────
  const [pricingEnabled,  setPricingEnabled]  = useState(true);
  const [pricingBaseCents, setPricingBaseCents] = useState(300);
  const [pricingEditing,  setPricingEditing]  = useState(false);
  const [pricingSaving,   setPricingSaving]   = useState(false);
  const [pricingDraft,    setPricingDraft]    = useState<{ baseCents: number; enabled: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    adminApi.getPricingConfig().then((r: { success: boolean; data?: { enabled: boolean; baseCents: number } }) => {
      if (r.success && r.data) {
        setPricingEnabled(r.data.enabled);
        setPricingBaseCents(r.data.baseCents);
      }
    }).catch(() => {/* non-blocking */});
  }, []);

  useEffect(() => {
    Promise.all([
      adminApi.getStats(),
      adminApi.getPendingUsers(),
      adminApi.getAuditLog({ limit: "10" }),
    ]).then(([sRes, pRes, aRes]) => {
      if (!sRes.success) {
        console.error("[Admin] Stats API failed:", sRes.error, sRes);
        setLoadError(sRes.error ?? "Failed to load admin stats");
        setLoading(false);
        return;
      }
      setStats(sRes.data as Stats);
      if (pRes.success) setPending((pRes.data as { users?: PendingUser[] }).users ?? pRes.data as PendingUser[]);
      if (aRes.success) {
        const raw = aRes.data as { entries?: AuditEntry[] } | AuditEntry[];
        setAudit(Array.isArray(raw) ? raw : (raw.entries ?? []));
      }
      setLoading(false);
    }).catch(err => {
      console.error("[Admin] Dashboard load error:", err);
      setLoading(false);
    });
  }, [router]);

  async function handleSavePricing() {
    if (!pricingDraft) return;
    setPricingSaving(true);
    const res = await adminApi.updatePricingConfig(pricingDraft).catch(() => ({ success: false }));
    setPricingSaving(false);
    if ((res as { success: boolean }).success) {
      setPricingEnabled(pricingDraft.enabled);
      setPricingBaseCents(pricingDraft.baseCents);
      setPricingEditing(false);
      setPricingDraft(null);
      showToast("Pricing config saved", true);
    } else {
      showToast("Failed to save pricing config", false);
    }
  }

  async function handleAction(userId: string, action: "approve" | "reject" | "suspend") {
    setActMap(m => ({ ...m, [userId + action]: "loading" }));
    try {
      let res;
      if (action === "approve") res = await adminApi.approveUser(userId);
      else if (action === "reject") res = await adminApi.rejectUser(userId, "Rejected by admin");
      else res = await adminApi.suspendUserAccount(userId, "Suspended by admin");

      if (res.success) {
        setPending(p => p.filter(u => u.userId !== userId));
        showToast(`User ${action}d successfully`, true);
        setActMap(m => ({ ...m, [userId + action]: "done" }));
      } else {
        showToast(res.error ?? "Action failed", false);
        setActMap(m => ({ ...m, [userId + action]: "error" }));
      }
    } catch {
      showToast("Network error", false);
      setActMap(m => ({ ...m, [userId + action]: "error" }));
    }
  }

  if (loading) return <LoadingPage color="amber" />;
  if (loadError) return (
    <div style={{ padding: "60px 40px", textAlign: "center" }}>
      <div style={{ fontSize: 14, color: "#f87171", marginBottom: 8, fontWeight: 600 }}>Failed to load admin dashboard</div>
      <div style={{ fontSize: 12, color: "#71717a", fontFamily: "monospace" }}>{loadError}</div>
      <div style={{ fontSize: 12, color: "#555", marginTop: 12 }}>Check the browser console and Network tab for details.</div>
    </div>
  );
  if (!stats)  return null;

  const pendingCount = stats.verification.pending;
  const maxMonthly   = Math.max(...stats.monthly.map(m => m.count), 1);

  /* ── Fraud flags: recentSubmissions with riskScore >= 70 ── */
  const fraudAlerts = (stats.recentSubmissions as (typeof stats.recentSubmissions[0] & { riskScore?: number })[])
    .filter(s => (s as { riskScore?: number }).riskScore != null && (s as { riskScore?: number }).riskScore! >= 70);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>

      {/* ── Alert banner ─────────────────────────────────────────────────────── */}
      {pendingCount > 0 && (
        <div style={{
          marginBottom: 28,
          padding: "14px 20px",
          borderRadius: "var(--r-md)",
          background: "rgba(220,38,38,0.08)",
          border: "1px solid rgba(220,38,38,0.35)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🚨</span>
            <span style={{ color: "var(--admin-3)", fontWeight: 600, fontSize: 14 }}>
              <strong style={{ color: "var(--admin-2)" }}>{pendingCount} applications</strong> awaiting your review
            </span>
          </div>
          <Link href="/admin/users/pending" style={{
            padding: "7px 16px", borderRadius: "var(--r-sm)",
            background: "var(--admin-primary)", color: "#fff",
            fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}>Review Now →</Link>
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "var(--r-md)",
          background: "linear-gradient(135deg, var(--admin-primary), var(--admin-2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 4px 18px var(--admin-glow)",
          flexShrink: 0,
        }}>⚡</div>
        <div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24,
            color: "var(--white)", margin: 0,
          }}>Admin Control Center</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Platform oversight · real-time monitoring</p>
        </div>
      </div>

      {/* ── KPI grid (8 cards, 4 × 2) ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
        <KpiCard label="Total Workers"    value={stats.users.workers}             icon="👷" accent="rgba(59,130,246,0.15)"  sub={`+${stats.users.newToday} today`} />
        <KpiCard label="Total Employers"  value={stats.users.employers}           icon="🏢" accent="rgba(99,102,241,0.15)"  />
        <KpiCard label="Pending Review"   value={stats.verification.pending}      icon="🔍" accent="rgba(220,38,38,0.18)"   />
        <KpiCard label="Emails Today"     value={stats.emailsToday}               icon="📧" accent="rgba(167,139,250,0.15)" />
        <KpiCard label="Approved"         value={stats.verification.approved}     icon="✅" accent="rgba(16,185,129,0.15)"  />
        <KpiCard label="Rejected"         value={stats.verification.rejected}     icon="❌" accent="rgba(244,63,94,0.15)"   />
        <KpiCard label="Needs Changes"    value={stats.verification.needsChanges} icon="✏️" accent="rgba(245,158,11,0.15)"  />
        <KpiCard label="Total Uploads"    value={stats.uploads}                   icon="📁" accent="rgba(6,182,212,0.15)"   />
      </div>

      {/* ── Two-column: pending approvals + fraud alerts ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, marginBottom: 28 }}>

        {/* Pending Approvals table */}
        <div style={{
          background: "var(--navy-2)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", overflow: "hidden",
        }}>
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", margin: 0 }}>
              Pending Approvals
            </h2>
            <Link href="/admin/approvals" style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-2)", textDecoration: "none" }}>
              View all →
            </Link>
          </div>

          {pending.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              ✓ No pending approvals
            </div>
          ) : (
            <>
              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 90px 80px 180px",
                padding: "10px 20px",
                background: "rgba(255,255,255,0.02)",
                borderBottom: "1px solid var(--border)",
              }}>
                {["User", "Role", "Risk", "Actions"].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                ))}
              </div>

              {pending.slice(0, 8).map(u => {
                const isLoading = (a: string) => actMap[u.userId + a] === "loading";
                return (
                  <div key={u.userId} style={{
                    display: "grid", gridTemplateColumns: "1fr 90px 80px 180px",
                    padding: "13px 20px", alignItems: "center",
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.15s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* User info */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700, color: "#fff",
                        background: u.role === "WORKER" ? "var(--worker-primary)" : "var(--employer-primary)",
                      }}>{(u.name || u.email)[0].toUpperCase()}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.name || u.email}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{u.completionPct}% complete</div>
                      </div>
                    </div>

                    {/* Role */}
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{u.role}</span>

                    {/* Risk */}
                    {u.riskScore != null
                      ? <RiskBadge score={u.riskScore} />
                      : <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>
                    }

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        disabled={isLoading("approve")}
                        onClick={() => handleAction(u.userId, "approve")}
                        style={{
                          padding: "5px 10px", borderRadius: "var(--r-sm)", fontSize: 11, fontWeight: 700,
                          border: "none", cursor: "pointer",
                          background: isLoading("approve") ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.18)",
                          color: "#34d399",
                        }}>✓ Approve</button>
                      <button
                        disabled={isLoading("reject")}
                        onClick={() => handleAction(u.userId, "reject")}
                        style={{
                          padding: "5px 10px", borderRadius: "var(--r-sm)", fontSize: 11, fontWeight: 700,
                          border: "none", cursor: "pointer",
                          background: isLoading("reject") ? "rgba(220,38,38,0.3)" : "rgba(220,38,38,0.12)",
                          color: "#f87171",
                        }}>✕ Reject</button>
                      <button
                        disabled={isLoading("suspend")}
                        onClick={() => handleAction(u.userId, "suspend")}
                        style={{
                          padding: "5px 10px", borderRadius: "var(--r-sm)", fontSize: 11, fontWeight: 700,
                          border: "none", cursor: "pointer",
                          background: isLoading("suspend") ? "rgba(245,158,11,0.3)" : "rgba(245,158,11,0.10)",
                          color: "#fbbf24",
                        }}>⊘ Suspend</button>
                      <Link href={`/admin/users/${u.userId}`} style={{
                        padding: "5px 10px", borderRadius: "var(--r-sm)", fontSize: 11, fontWeight: 700,
                        background: "rgba(59,130,246,0.12)", color: "var(--blue-4)",
                        textDecoration: "none",
                      }}>View</Link>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Fraud Alerts panel */}
        <div style={{
          background: "var(--navy-2)",
          border: "1px solid rgba(220,38,38,0.4)",
          borderRadius: "var(--r-lg)", overflow: "hidden",
          animation: "pulseBorderRed 2.5s ease-in-out infinite",
        }}>
          <style>{`
            @keyframes pulseBorderRed {
              0%, 100% { border-color: rgba(220,38,38,0.4); box-shadow: 0 0 0 0 rgba(220,38,38,0); }
              50%       { border-color: rgba(220,38,38,0.7); box-shadow: 0 0 0 4px rgba(220,38,38,0.08); }
            }
          `}</style>
          <div style={{
            padding: "16px 18px",
            borderBottom: "1px solid rgba(220,38,38,0.25)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 15 }}>🛡</span>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--admin-3)", margin: 0 }}>
              Fraud Alerts
            </h2>
            {fraudAlerts.length > 0 && (
              <span style={{
                marginLeft: "auto", padding: "2px 8px", borderRadius: 999,
                fontSize: 10, fontWeight: 800, background: "var(--admin-primary)", color: "#fff",
              }}>{fraudAlerts.length}</span>
            )}
          </div>

          {fraudAlerts.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No high-risk flags detected</div>
            </div>
          ) : (
            <div style={{ overflowY: "auto", maxHeight: 340 }}>
              {fraudAlerts.map((s, i) => (
                <div key={i} style={{
                  padding: "12px 18px", borderBottom: "1px solid rgba(220,38,38,0.12)",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "var(--admin-primary)",
                    boxShadow: "0 0 6px var(--admin-primary)",
                    flexShrink: 0,
                    animation: "pulseDot 1.5s ease-in-out infinite",
                  }} />
                  <style>{`@keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.email}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.role}</div>
                  </div>
                  <RiskBadge score={(s as { riskScore?: number }).riskScore ?? 0} />
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(220,38,38,0.15)" }}>
            <Link href="/admin/fraud" style={{
              display: "block", textAlign: "center", padding: "8px 16px",
              borderRadius: "var(--r-sm)", fontSize: 12, fontWeight: 700,
              background: "rgba(220,38,38,0.12)", color: "var(--admin-2)",
              textDecoration: "none",
            }}>Open Fraud Console →</Link>
          </div>
        </div>
      </div>

      {/* ── AI Performance panels + Registration chart ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>

        {/* AI Performance mini cards */}
        <div style={{
          background: "var(--navy-2)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "20px",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", marginBottom: 16 }}>
            AI Performance
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Match Accuracy",  value: "94.2%", icon: "🎯", color: "var(--blue-3)" },
              { label: "Fraud Detection", value: "99.1%", icon: "🛡",  color: "var(--admin-2)" },
              { label: "Avg Match Score", value: "87.4",  icon: "⭐", color: "var(--gold)" },
              { label: "AI Reviews/Day",  value: "1,240", icon: "⚡", color: "var(--cyan)" },
            ].map(c => (
              <div key={c.label} style={{
                background: "var(--navy-3)", borderRadius: "var(--r-md)", padding: "14px 16px",
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22,
                  color: c.color, marginBottom: 4,
                }}>{c.value}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly registrations chart */}
        <div style={{
          background: "var(--navy-2)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "20px",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", marginBottom: 16 }}>
            Registrations — Last 12 Months
          </h2>
          {stats.monthly.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
              {stats.monthly.map(m => (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)" }}>{m.count}</div>
                  <div style={{
                    width: "100%", borderRadius: "3px 3px 0 0",
                    height: `${Math.max(Math.round((m.count / maxMonthly) * 90), 4)}px`,
                    background: "linear-gradient(180deg, var(--admin-primary), rgba(220,38,38,0.4))",
                    minHeight: 4, transition: "height 0.3s ease",
                  }} />
                  <div style={{ fontSize: 8, color: "var(--muted)" }}>{m.month.slice(5)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "var(--muted)", paddingTop: 40, fontSize: 13 }}>No data yet</div>
          )}
        </div>
      </div>

      {/* ── Audit Log table ───────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--navy-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", overflow: "hidden", marginBottom: 28,
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", margin: 0 }}>
            Recent Audit Log
          </h2>
          <Link href="/admin/audit-log" style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-2)", textDecoration: "none" }}>
            Full log →
          </Link>
        </div>

        {audit.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No audit entries yet
          </div>
        ) : (
          <>
            <div style={{
              display: "grid", gridTemplateColumns: "160px 1fr 140px 120px",
              padding: "9px 20px", background: "rgba(255,255,255,0.02)",
              borderBottom: "1px solid var(--border)",
            }}>
              {["Admin", "Action", "Target", "Time"].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>
            {audit.map(e => (
              <div key={e.id} style={{
                display: "grid", gridTemplateColumns: "160px 1fr 140px 120px",
                padding: "12px 20px", alignItems: "center",
                borderBottom: "1px solid var(--border)",
                fontSize: 13, color: "var(--white)",
                transition: "background 0.15s",
              }}
                onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)" }}>
                  {e.adminEmail}
                </span>
                <span style={{ fontWeight: 600, color: "var(--white)" }}>{e.action}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)", fontSize: 12 }}>
                  {e.targetType ? `${e.targetType} ${e.targetId?.slice(0, 8)}…` : "—"}
                </span>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>
                  {new Date(e.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Application Fee Config ───────────────────────────────────────────── */}
      <div style={{
        background: "var(--navy-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", overflow: "hidden", marginBottom: 28,
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--white)", margin: 0 }}>
            Application Fee Configuration
          </h2>
          {!pricingEditing ? (
            <button
              onClick={() => { setPricingDraft({ baseCents: pricingBaseCents, enabled: pricingEnabled }); setPricingEditing(true); }}
              style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-2)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Edit
            </button>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setPricingEditing(false); setPricingDraft(null); }}
                style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePricing}
                disabled={pricingSaving}
                style={{
                  fontSize: 12, fontWeight: 600, color: "var(--white)",
                  background: "var(--admin-2)", border: "none", borderRadius: 6,
                  padding: "4px 12px", cursor: pricingSaving ? "not-allowed" : "pointer",
                  opacity: pricingSaving ? 0.7 : 1,
                }}
              >
                {pricingSaving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Fee enabled toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)" }}>Application Fee</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                Charge workers a fee when applying to jobs
              </div>
            </div>
            {pricingEditing ? (
              <button
                onClick={() => setPricingDraft(d => d ? { ...d, enabled: !d.enabled } : d)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                  background: pricingDraft?.enabled ? "var(--admin-2)" : "var(--border)",
                  transition: "background 0.2s", position: "relative",
                }}
              >
                <span style={{
                  position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%",
                  background: "var(--white)", transition: "left 0.2s",
                  left: pricingDraft?.enabled ? 23 : 3,
                }} />
              </button>
            ) : (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                background: pricingEnabled ? "rgba(34,197,94,0.15)" : "rgba(100,100,100,0.15)",
                color: pricingEnabled ? "#4ade80" : "var(--muted)",
              }}>
                {pricingEnabled ? "Enabled" : "Disabled"}
              </span>
            )}
          </div>

          {/* Base fee */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)" }}>Base Fee</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                Starting fee before regional/salary multipliers (50¢ – $25.00)
              </div>
            </div>
            {pricingEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>$</span>
                <input
                  type="number"
                  min={0.5}
                  max={25}
                  step={0.5}
                  value={pricingDraft ? (pricingDraft.baseCents / 100).toFixed(2) : ""}
                  onChange={e => {
                    const dollars = parseFloat(e.target.value);
                    if (!isNaN(dollars)) {
                      const cents = Math.round(dollars * 100);
                      if (cents >= 50 && cents <= 2500) {
                        setPricingDraft(d => d ? { ...d, baseCents: cents } : d);
                      }
                    }
                  }}
                  style={{
                    width: 80, padding: "6px 10px", borderRadius: 6, fontSize: 13,
                    background: "var(--navy-1)", border: "1px solid var(--border)",
                    color: "var(--white)", outline: "none",
                  }}
                />
              </div>
            ) : (
              <span style={{ fontSize: 18, fontWeight: 700, color: "var(--white)" }}>
                ${(pricingBaseCents / 100).toFixed(2)}
              </span>
            )}
          </div>

          {/* Info note */}
          <div style={{
            fontSize: 12, color: "var(--muted)", padding: "10px 14px",
            background: "rgba(255,255,255,0.03)", borderRadius: 8,
            borderLeft: "3px solid var(--admin-2)",
          }}>
            Final fee = base × region multiplier (1×–2.5×) × salary tier (0.8×–1.4×). Clamped to $1.00–$25.00 and rounded to nearest $0.50.
          </div>
        </div>
      </div>

      {/* ── Quick nav cards ───────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {[
          { href: "/admin/approvals",     icon: "✅", label: "Approval Queue",   sub: `${pendingCount} pending`,    accent: "rgba(245,158,11,0.14)" },
          { href: "/admin/fraud",         icon: "🛡",  label: "Fraud Console",   sub: "Risk monitoring",             accent: "rgba(220,38,38,0.14)" },
          { href: "/admin/users",         icon: "👥", label: "User Management",  sub: "All accounts",                accent: "rgba(59,130,246,0.14)" },
          { href: "/admin/audit-log",     icon: "📋", label: "Audit Log",        sub: "Full activity trail",         accent: "rgba(167,139,250,0.14)" },
        ].map(({ href, icon, label, sub, accent }) => (
          <Link key={href} href={href} style={{
            background: "var(--navy-2)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)", padding: "18px 20px",
            display: "flex", alignItems: "center", gap: 14,
            textDecoration: "none", transition: "border-color 0.15s, background 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(220,38,38,0.35)"; e.currentTarget.style.background = "rgba(220,38,38,0.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--navy-2)"; }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: "var(--r-sm)",
              background: accent, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 20, flexShrink: 0,
            }}>{icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--white)" }}>{label}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          padding: "13px 20px", borderRadius: "var(--r-md)",
          background: toast.ok ? "rgba(16,185,129,0.15)" : "rgba(220,38,38,0.15)",
          border: `1px solid ${toast.ok ? "rgba(16,185,129,0.4)" : "rgba(220,38,38,0.4)"}`,
          color: toast.ok ? "#34d399" : "#f87171",
          fontSize: 14, fontWeight: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "slideInUp 0.25s ease",
        }}>
          <style>{`@keyframes slideInUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`}</style>
          {toast.ok ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
