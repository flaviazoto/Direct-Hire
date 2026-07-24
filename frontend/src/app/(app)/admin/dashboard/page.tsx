"use client";
// src/app/(app)/admin/dashboard/page.tsx

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { LoadingPage, ErrorState } from "@/components/ui";
import { C } from "@/lib/admin-theme";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface Stats {
  users:        { workers: number; employers: number; admins: number; newToday: number };
  verification: { pending: number; approved: number; rejected: number; needsChanges: number };
  uploads:      number;
  emailsToday:  number;
  recentSubmissions: { userId: string; email: string; role: string; submittedAt: string; completionPct: number; name?: string }[];
  monthly:      { month: string; count: number }[];
}

interface AuditEntry {
  id:          string;
  adminEmail:  string;
  action:      string;
  targetId?:   string;
  targetType?: string;
  createdAt:   string;
}

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

// Compact metrics strip — background/informational counts only, not actionable.
function MiniStat({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "12px 16px",
      display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 800, fontSize: 20, color: accent }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

// "Needs attention" action card — one per actionable queue. Always rendered
// (even at zero) so the queue's existence/health is visible at a glance;
// zero state reads as a clear/resolved signal rather than disappearing.
function AttentionCard({
  href, label, count, hint, tone,
}: { href: string; label: string; count: number; hint: string; tone: "danger" | "warning" | "info" }) {
  const toneColor = tone === "danger" ? "#f87171" : tone === "warning" ? "#fbbf24" : C.accent;
  const clear = count === 0;
  return (
    <Link href={href} style={{
      background: C.card, border: `1px solid ${clear ? C.border : `${toneColor}55`}`,
      borderRadius: 16, padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 10,
      textDecoration: "none", transition: "border-color 0.15s, background 0.15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = clear ? C.borderHover : toneColor; e.currentTarget.style.background = C.cardHover; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = clear ? C.border : `${toneColor}55`; e.currentTarget.style.background = C.card; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </span>
        {!clear && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: toneColor, boxShadow: `0 0 6px ${toneColor}` }} />
        )}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
        fontWeight: 800, fontSize: 32, color: clear ? C.text : toneColor, lineHeight: 1,
      }}>
        {count.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>
        {clear ? "All clear" : hint}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: toneColor, marginTop: 2 }}>
        {clear ? "View queue →" : "Review now →"}
      </div>
    </Link>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminDashboardPage() {
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [audit,     setAudit]     = useState<AuditEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Pricing config state ──────────────────────────────────────────────────
  const [pricingEnabled,   setPricingEnabled]   = useState(true);
  const [pricingBaseCents, setPricingBaseCents] = useState(300);
  const [pricingEditing,   setPricingEditing]   = useState(false);
  const [pricingSaving,    setPricingSaving]    = useState(false);
  const [pricingDraft,     setPricingDraft]     = useState<{ baseCents: number; enabled: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    adminApi.getPricingConfig().then(raw => {
      const r = raw as unknown as { success: boolean; data?: { enabled: boolean; baseCents: number } };
      if (r.success && r.data) {
        setPricingEnabled(r.data.enabled);
        setPricingBaseCents(r.data.baseCents);
      }
    }).catch(() => {/* non-blocking */});
  }, []);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      adminApi.getStats(),
      adminApi.getAuditLog({ limit: "10" }),
    ]).then(([sRes, aRes]) => {
      if (!sRes.success) {
        console.error("[Admin] Stats API failed:", sRes.error, sRes);
        setLoadError(sRes.error ?? "Failed to load admin stats");
        setLoading(false);
        return;
      }
      setStats(sRes.data as Stats);
      if (aRes.success) {
        const raw = aRes.data as { entries?: AuditEntry[] } | AuditEntry[];
        setAudit(Array.isArray(raw) ? raw : (raw.entries ?? []));
      }
      setLoading(false);
    }).catch(err => {
      console.error("[Admin] Dashboard load error:", err);
      setLoadError("Network error - check your connection.");
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

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

  if (loading) return <LoadingPage color="amber" />;
  if (loadError) return (
    <div style={{ padding: "60px 40px", maxWidth: 480, margin: "0 auto" }}>
      <ErrorState message={loadError} retry={loadDashboard} title="Failed to load admin dashboard" />
    </div>
  );
  if (!stats) return null;

  const pendingCount = stats.verification.pending;
  const maxMonthly   = Math.max(...stats.monthly.map(m => m.count), 1);

  return (
    <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-12 max-w-6xl mx-auto font-body">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 md:mb-7 flex items-start gap-3 sm:gap-4">
        <div className="w-10 sm:w-11 h-10 sm:h-11 rounded-xl flex items-center justify-center text-xl sm:text-2xl flex-shrink-0 shadow-lg" style={{
          background: `linear-gradient(135deg, ${C.accent}, #b91c1c)`,
        }}>⚡</div>
        <div className="min-w-0">
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: C.text, margin: 0 }}>
            Admin Control Center
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>Platform oversight · real-time monitoring</p>
        </div>
      </div>

      {/* ── Metrics strip (single row, compact, informational only) ──────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6 md:mb-7">
        <MiniStat label="Workers"    value={stats.users.workers}   accent={C.blue} />
        <MiniStat label="Employers"  value={stats.users.employers} accent="#a78bfa" />
        <MiniStat label="Approved"   value={stats.verification.approved} accent="#4ade80" />
        <MiniStat label="Rejected"   value={stats.verification.rejected} accent="#f87171" />
        <MiniStat label="Emails Today" value={stats.emailsToday}   accent={C.teal} />
        <MiniStat label="Uploads"    value={stats.uploads}         accent="#22d3ee" />
      </div>

      {/* ── Needs attention — one card per actionable queue, correctly linked ── */}
      <div className="mb-6 md:mb-7">
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C.text, margin: "0 0 12px" }}>
          Needs Attention
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <AttentionCard
            href="/admin/users/pending"
            label="Pending Approvals"
            count={pendingCount}
            hint={`${pendingCount} account${pendingCount === 1 ? "" : "s"} awaiting review`}
            tone="warning"
          />
          <AttentionCard
            href="/admin/approvals?status=NEEDS_CHANGES"
            label="Needs Changes"
            count={stats.verification.needsChanges}
            hint="Submissions sent back to applicants"
            tone="info"
          />
        </div>
      </div>

      {/* ── Recent activity + system/fraud teasers ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 mb-6 md:mb-7">

        {/* Recent Activity (condensed audit log) */}
        <div className="lg:col-span-2" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{
            padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>
              Recent Activity
            </h2>
            <Link href="/admin/audit-log" style={{ fontSize: 12, fontWeight: 600, color: C.accent, textDecoration: "none" }}>
              Full log →
            </Link>
          </div>

          {audit.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
              No audit entries yet
            </div>
          ) : (
            <div>
              {audit.slice(0, 6).map(e => (
                <div key={e.id} style={{
                  padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  borderBottom: `1px solid ${C.border}`, fontSize: 13,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.action}</div>
                    <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.adminEmail}</div>
                  </div>
                  <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>
                    {new Date(e.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System health + fraud console teasers (stacked, no live counts —
            neither this page nor getStats() currently fetches the data that
            would back a real number here; see report) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Link href="/admin/system" style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: "18px 20px", textDecoration: "none", flex: 1,
            display: "flex", flexDirection: "column", gap: 8,
            transition: "border-color 0.15s, background 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.background = C.cardHover; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}
          >
            <span style={{ fontSize: 20 }}>🩺</span>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: C.text }}>
              System Health
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Scheduled-job monitoring &amp; run history.
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, marginTop: "auto" }}>
              Open system console →
            </div>
          </Link>

          <Link href="/admin/fraud" style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: "18px 20px", textDecoration: "none", flex: 1,
            display: "flex", flexDirection: "column", gap: 8,
            transition: "border-color 0.15s, background 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.background = C.cardHover; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}
          >
            <span style={{ fontSize: 20 }}>🛡</span>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: C.text }}>
              Fraud Console
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Risk-sorted account monitoring.
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, marginTop: "auto" }}>
              Open fraud console →
            </div>
          </Link>
        </div>
      </div>

      {/* ── Analytics: AI performance + registrations ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 mb-6 md:mb-7">

        {/* AI Performance mini cards */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "20px",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 16 }}>
            AI Performance
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Match Accuracy",  value: "94.2%", icon: "🎯", color: C.blue   },
              { label: "Fraud Detection", value: "99.1%", icon: "🛡",  color: C.accent },
              { label: "Avg Match Score", value: "87.4",  icon: "⭐", color: C.yellow  },
              { label: "AI Reviews/Day",  value: "1,240", icon: "⚡", color: C.teal   },
            ].map(c => (
              <div key={c.label} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22,
                  color: c.color, marginBottom: 4,
                }}>{c.value}</div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly registrations chart */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "20px",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 16 }}>
            Registrations — Last 12 Months
          </h2>
          {stats.monthly.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
              {stats.monthly.map(m => (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.muted }}>{m.count}</div>
                  <div style={{
                    width: "100%", borderRadius: "3px 3px 0 0",
                    height: `${Math.max(Math.round((m.count / maxMonthly) * 90), 4)}px`,
                    background: `linear-gradient(180deg, ${C.accent}, rgba(220,38,38,0.4))`,
                    minHeight: 4, transition: "height 0.3s ease",
                  }} />
                  <div style={{ fontSize: 8, color: C.muted }}>{m.month.slice(5)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: C.muted, paddingTop: 40, fontSize: 13 }}>No data yet</div>
          )}
        </div>
      </div>

      {/* ── Application Fee Config ───────────────────────────────────────────── */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, overflow: "hidden", marginBottom: 28,
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>
            Application Fee Configuration
          </h2>
          {!pricingEditing ? (
            <button
              onClick={() => { setPricingDraft({ baseCents: pricingBaseCents, enabled: pricingEnabled }); setPricingEditing(true); }}
              style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Edit
            </button>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setPricingEditing(false); setPricingDraft(null); }}
                style={{ fontSize: 12, fontWeight: 600, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePricing}
                disabled={pricingSaving}
                style={{
                  fontSize: 12, fontWeight: 600, color: C.text,
                  background: C.accent, border: "none", borderRadius: 6,
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
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Application Fee</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                Charge workers a fee when applying to jobs
              </div>
            </div>
            {pricingEditing ? (
              <button
                onClick={() => setPricingDraft(d => d ? { ...d, enabled: !d.enabled } : d)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                  background: pricingDraft?.enabled ? C.accent : C.border,
                  transition: "background 0.2s", position: "relative",
                }}
              >
                <span style={{
                  position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%",
                  background: C.text, transition: "left 0.2s",
                  left: pricingDraft?.enabled ? 23 : 3,
                }} />
              </button>
            ) : (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                background: pricingEnabled ? "rgba(34,197,94,0.15)" : "rgba(100,100,100,0.15)",
                color: pricingEnabled ? "#4ade80" : C.muted,
              }}>
                {pricingEnabled ? "Enabled" : "Disabled"}
              </span>
            )}
          </div>

          {/* Base fee */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Base Fee</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                Starting fee before regional/salary multipliers (50¢ – $25.00)
              </div>
            </div>
            {pricingEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, color: C.muted }}>$</span>
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
                    background: C.inputBg, border: `1px solid ${C.border}`,
                    color: C.text, outline: "none",
                  }}
                />
              </div>
            ) : (
              <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                ${(pricingBaseCents / 100).toFixed(2)}
              </span>
            )}
          </div>

          {/* Info note */}
          <div style={{
            fontSize: 12, color: C.muted, padding: "10px 14px",
            background: "rgba(255,255,255,0.03)", borderRadius: 8,
            borderLeft: `3px solid ${C.accent}`,
          }}>
            Final fee = base × region multiplier (1×–2.5×) × salary tier (0.8×–1.4×). Clamped to $1.00–$25.00 and rounded to nearest $0.50.
          </div>
        </div>
      </div>

      {/* ── More admin tools (destinations not already reachable above) ──────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Link href="/admin/users" style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "18px 20px",
          display: "flex", alignItems: "center", gap: 14,
          textDecoration: "none", transition: "border-color 0.15s, background 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.background = C.cardHover; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}
        >
          <div style={{
            width: 42, height: 42, borderRadius: 7,
            background: "rgba(59,130,246,0.14)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 20, flexShrink: 0,
          }}>👥</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>User Management</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>All accounts</div>
          </div>
        </Link>
        <Link href="/admin/approvals" style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "18px 20px",
          display: "flex", alignItems: "center", gap: 14,
          textDecoration: "none", transition: "border-color 0.15s, background 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.background = C.cardHover; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}
        >
          <div style={{
            width: 42, height: 42, borderRadius: 7,
            background: "rgba(167,139,250,0.14)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 20, flexShrink: 0,
          }}>📥</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Approval Queue</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Browse all submissions</div>
          </div>
        </Link>
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          padding: "13px 20px", borderRadius: 10,
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
