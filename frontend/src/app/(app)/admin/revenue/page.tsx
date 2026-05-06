"use client";
// frontend/src/app/(app)/admin/revenue/page.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

type Summary = {
  mrr:                      number;
  mrrGrowth:                number;
  lockRevenue30d:           number;
  applicationFeeRevenue30d: number;
  totalRevenue30d:          number;
  activeSubscriptions:      number;
  activeLocksNow:           number;
  failedPayments30d:        number;
};

type ChartDay = {
  date:                string;
  subscriptionRevenue: number;
  lockRevenue:         number;
  feeRevenue:          number;
  total:               number;
};

type PaymentRow = {
  id:              string;
  amount:          number;
  currency:        string;
  status:          string;
  type:            string;
  description:     string | null;
  createdAt:       string;
  stripePaymentId: string | null;
  user:            { email: string; role: string; displayName: string };
};

// paginated() in response.ts returns top-level total/page/limit/totalPages
type PaginatedPayments = {
  success:    boolean;
  data:       PaymentRow[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, accent, valueColor,
}: {
  label:       string;
  value:       string | number;
  sub?:        string;
  icon:        string;
  accent:      string;
  valueColor?: string;
}) {
  return (
    <div style={{
      background:    "var(--navy-2)",
      border:        "1px solid var(--border)",
      borderRadius:  "var(--r-lg)",
      padding:       "20px 22px",
      display:       "flex",
      flexDirection: "column",
      gap:           10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "var(--muted)",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          {label}
        </span>
        <div style={{
          width: 36, height: 36, borderRadius: "var(--r-sm)",
          background: accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>
          {icon}
        </div>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize:   28,
        color:      valueColor ?? "var(--white)",
        lineHeight: 1,
      }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--admin-2)", lineHeight: 1.4 }}>{sub}</div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    SUBSCRIPTION:    { label: "Subscription", bg: "rgba(59,130,246,0.12)",  color: "#60a5fa" },
    WORKER_LOCK:     { label: "Worker Lock",  bg: "rgba(249,115,22,0.12)",  color: "#fb923c" },
    APPLICATION_FEE: { label: "App Fee",      bg: "rgba(34,197,94,0.12)",   color: "#4ade80" },
  };
  const c = cfg[type] ?? { label: type, bg: "rgba(255,255,255,0.06)", color: "var(--muted)" };
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 999, fontSize: 11,
      fontWeight: 700, color: c.color, background: c.bg,
      letterSpacing: "0.04em", whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string }> = {
    SUCCEEDED: { color: "#4ade80", bg: "rgba(34,197,94,0.12)"   },
    FAILED:    { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
    PENDING:   { color: "var(--muted)", bg: "rgba(255,255,255,0.06)" },
    REFUNDED:  { color: "#c084fc", bg: "rgba(192,132,252,0.12)" },
  };
  const c = cfg[status] ?? { color: "var(--muted)", bg: "rgba(255,255,255,0.06)" };
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 999, fontSize: 11,
      fontWeight: 700, color: c.color, background: c.bg,
      letterSpacing: "0.04em",
    }}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LIMIT = 20;

const CHART_TYPES = [
  { key: "all",          label: "All"           },
  { key: "subscription", label: "Subscriptions" },
  { key: "lock",         label: "Locks"         },
  { key: "fee",          label: "Fees"          },
] as const;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminRevenuePage() {
  const [summary,         setSummary]         = useState<Summary | null>(null);
  const [chart,           setChart]           = useState<ChartDay[]>([]);
  const [payments,        setPayments]        = useState<PaymentRow[]>([]);
  const [total,           setTotal]           = useState(0);
  const [page,            setPage]            = useState(1);
  const [chartPeriod,     setChartPeriod]     = useState<"7d" | "30d" | "90d">("30d");
  const [chartType,       setChartType]       = useState<"all" | "subscription" | "lock" | "fee">("all");
  const [filterType,      setFilterType]      = useState("");
  const [filterStatus,    setFilterStatus]    = useState("");
  const [search,          setSearch]          = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading,         setLoading]         = useState(true);
  const [csvLoading,      setCsvLoading]      = useState(false);
  const [copiedId,        setCopiedId]        = useState<string | null>(null);

  // Prevents the chart period/type effect from firing on initial mount
  const skipChartEffect = useRef(true);

  // ── Initial load: summary + chart ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      adminApi.getRevenueSummary(),
      adminApi.getRevenueChart("30d", "all"),
    ]).then(([sRes, cRes]) => {
      if (sRes.success) setSummary(sRes.data as Summary);
      if (cRes.success) setChart(cRes.data as ChartDay[]);
      setLoading(false);
      skipChartEffect.current = false;
    });
  }, []);

  // ── Re-fetch chart when period or type changes ─────────────────────────────
  useEffect(() => {
    if (skipChartEffect.current) return;
    adminApi.getRevenueChart(chartPeriod, chartType).then(r => {
      if (r.success) setChart(r.data as ChartDay[]);
    });
  }, [chartPeriod, chartType]);

  // ── Debounce search input ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ── Reset to page 1 when filters change ───────────────────────────────────
  useEffect(() => { setPage(1); }, [filterType, filterStatus, debouncedSearch]);

  // ── Fetch payment log ─────────────────────────────────────────────────────
  const fetchPayments = useCallback(() => {
    const params: Record<string, string> = {
      page:  String(page),
      limit: String(LIMIT),
    };
    if (filterType)      params.type   = filterType;
    if (filterStatus)    params.status = filterStatus;
    if (debouncedSearch) params.search = debouncedSearch;

    adminApi.getPaymentLog(params).then(r => {
      if (r.success) {
        const d = r as unknown as PaginatedPayments;
        setPayments(d.data);
        setTotal(d.total);
      }
    });
  }, [page, filterType, filterStatus, debouncedSearch]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  async function exportCsv() {
    setCsvLoading(true);
    const params: Record<string, string> = { page: "1", limit: "1000" };
    if (filterType)      params.type   = filterType;
    if (filterStatus)    params.status = filterStatus;
    if (debouncedSearch) params.search = debouncedSearch;

    const r = await adminApi.getPaymentLog(params).catch(() => ({ success: false }));
    if ((r as { success: boolean }).success) {
      const rows = (r as unknown as PaginatedPayments).data;
      const headers = ["Date", "Type", "Status", "Amount (USD)", "Employer/User", "Email", "Stripe ID"];
      const lines = rows.map(p => [
        fmtDate(p.createdAt),
        p.type,
        p.status,
        fmt(p.amount),
        `"${p.user.displayName.replace(/"/g, '""')}"`,
        p.user.email,
        p.stripePaymentId ?? "",
      ].join(","));
      const csv  = [headers.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "directhire-payments.csv"; a.click();
      URL.revokeObjectURL(url);
    }
    setCsvLoading(false);
  }

  // ── Copy Stripe ID ────────────────────────────────────────────────────────
  function copyStripeId(id: string) {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(id => (id === id ? null : id)), 2000);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: "60px 40px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
        Loading revenue data…
      </div>
    );
  }

  const totalPages    = Math.max(1, Math.ceil(total / LIMIT));
  const maxChartVal   = Math.max(...chart.map(d => d.total), 1);
  const allChartEmpty = chart.every(d => d.total === 0);
  const chartStep     = Math.max(1, Math.ceil(chart.length / 5));

  const barColor = chartType === "subscription" ? "#3b82f6"
    : chartType === "lock" ? "#f97316"
    : chartType === "fee"  ? "#22c55e"
    : "#0d9488";

  const barHover = chartType === "subscription" ? "#60a5fa"
    : chartType === "lock" ? "#fb923c"
    : chartType === "fee"  ? "#4ade80"
    : "#14b8a6";

  // ── Shared style objects ─────────────────────────────────────────────────
  const panel: React.CSSProperties = {
    background:   "var(--navy-2)",
    border:       "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    overflow:     "hidden",
    marginBottom: 24,
  };

  const panelHead: React.CSSProperties = {
    padding:        "16px 20px",
    borderBottom:   "1px solid var(--border)",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    flexWrap:       "wrap",
    gap:            10,
  };

  const h2: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize:   15,
    color:      "var(--white)",
    margin:     0,
  };

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding:      "5px 13px",
    borderRadius: "var(--r-sm)",
    border:       `1px solid ${active ? "transparent" : "var(--border)"}`,
    background:   active ? "var(--admin-primary)" : "transparent",
    color:        active ? "var(--white)" : "var(--muted)",
    fontSize:     12,
    fontWeight:   600,
    cursor:       "pointer",
    transition:   "all 0.15s",
  });

  const inputStyle: React.CSSProperties = {
    padding:      "7px 11px",
    borderRadius: "var(--r-sm)",
    border:       "1px solid var(--border)",
    background:   "var(--navy-1)",
    color:        "var(--white)",
    fontSize:     13,
    outline:      "none",
  };

  const TH_COLS = "200px 130px 110px 110px 140px 1fr";

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "var(--r-md)",
          background: "linear-gradient(135deg, var(--admin-primary), var(--admin-2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 4px 18px var(--admin-glow)", flexShrink: 0,
        }}>
          💰
        </div>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "var(--white)", margin: 0 }}>
            Revenue
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
            Subscriptions · worker locks · application fees
          </p>
        </div>
      </div>

      {/* ── ROW 1: KPI cards ── */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
          <KpiCard
            label="Monthly Revenue"
            value={fmt(summary.mrr)}
            icon="💳"
            accent="rgba(59,130,246,0.15)"
            sub={`${summary.mrrGrowth >= 0 ? "+" : ""}${summary.mrrGrowth}% vs last month · ${summary.activeSubscriptions} active subscription${summary.activeSubscriptions !== 1 ? "s" : ""}`}
          />
          <KpiCard
            label="Lock Revenue (30d)"
            value={fmt(summary.lockRevenue30d)}
            icon="🔒"
            accent="rgba(249,115,22,0.15)"
            sub={`${summary.activeLocksNow} active lock${summary.activeLocksNow !== 1 ? "s" : ""} now`}
          />
          <KpiCard
            label="App Fees (30d)"
            value={fmt(summary.applicationFeeRevenue30d)}
            icon="📋"
            accent="rgba(34,197,94,0.15)"
            sub="Per-application charge"
          />
          <KpiCard
            label="Failed (30d)"
            value={summary.failedPayments30d}
            icon="⚠️"
            accent={summary.failedPayments30d > 0 ? "rgba(220,38,38,0.18)" : "rgba(16,185,129,0.12)"}
            valueColor={summary.failedPayments30d > 0 ? "#f87171" : "var(--white)"}
            sub={summary.failedPayments30d > 0 ? "⚠ Action required" : "✓ All clear"}
          />
        </div>
      )}

      {/* ── ROW 2: Revenue chart ── */}
      <div style={panel}>
        <div style={panelHead}>
          <h2 style={h2}>Revenue over time</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Period selector */}
            <div style={{ display: "flex", gap: 4 }}>
              {(["7d", "30d", "90d"] as const).map(p => (
                <button key={p} onClick={() => setChartPeriod(p)} style={pillBtn(chartPeriod === p)}>
                  {p}
                </button>
              ))}
            </div>
            <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
            {/* Type selector */}
            <div style={{ display: "flex", gap: 4 }}>
              {CHART_TYPES.map(t => (
                <button key={t.key} onClick={() => setChartType(t.key)} style={pillBtn(chartType === t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 24px 8px" }}>
          {/* Bar area */}
          <div style={{ position: "relative", height: 192, marginBottom: 8 }}>
            {allChartEmpty && (
              <div style={{
                position:   "absolute",
                inset:      0,
                display:    "flex",
                alignItems: "center",
                justifyContent: "center",
                color:      "var(--muted)",
                fontSize:   13,
                textAlign:  "center",
                lineHeight: 1.6,
                background: "rgba(255,255,255,0.01)",
                borderRadius: 8,
                border:     "1px dashed var(--border)",
              }}>
                No revenue yet — chart will populate once payments begin.
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: "100%", width: "100%" }}>
              {chart.map(day => {
                const pct = allChartEmpty ? 0 : Math.max((day.total / maxChartVal) * 100, 2);
                return (
                  <div
                    key={day.date}
                    title={`${fmtShort(day.date)}: ${fmt(day.total)}`}
                    style={{
                      flex:         1,
                      height:       `${pct}%`,
                      background:   barColor,
                      borderRadius: "2px 2px 0 0",
                      cursor:       "default",
                      transition:   "background 0.15s",
                      minHeight:    allChartEmpty ? 0 : 2,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = barHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = barColor; }}
                  />
                );
              })}
            </div>
          </div>

          {/* X-axis date labels */}
          <div style={{ display: "flex", gap: 2 }}>
            {chart.map((day, i) => (
              <div key={day.date} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                {i % chartStep === 0 && (
                  <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {fmtShort(day.date)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Legend */}
          {!allChartEmpty && (
            <div style={{ display: "flex", gap: 16, marginTop: 14, justifyContent: "flex-end" }}>
              {chartType === "all" ? (
                [
                  { color: "#3b82f6", label: "Subscriptions" },
                  { color: "#f97316", label: "Locks" },
                  { color: "#22c55e", label: "Fees" },
                ].map(l => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                    {l.label}
                  </div>
                ))
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: barColor }} />
                  {CHART_TYPES.find(t => t.key === chartType)?.label}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: Payment log ── */}
      <div style={panel}>

        {/* Filter bar */}
        <div style={{ ...panelHead, justifyContent: "flex-start" }}>
          <h2 style={{ ...h2, marginRight: 8, flexShrink: 0 }}>Payment log</h2>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ ...inputStyle, minWidth: 155 }}
          >
            <option value="">All types</option>
            <option value="SUBSCRIPTION">Subscription</option>
            <option value="WORKER_LOCK">Worker Lock</option>
            <option value="APPLICATION_FEE">Application Fee</option>
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ ...inputStyle, minWidth: 135 }}
          >
            <option value="">All statuses</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
            <option value="REFUNDED">Refunded</option>
          </select>

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email…"
            style={{ ...inputStyle, flex: 1, minWidth: 180 }}
          />

          <button
            onClick={exportCsv}
            disabled={csvLoading}
            style={{
              padding:      "7px 16px",
              borderRadius: "var(--r-sm)",
              border:       "1px solid var(--border)",
              background:   "transparent",
              color:        csvLoading ? "var(--muted)" : "var(--white)",
              fontSize:     12,
              fontWeight:   600,
              cursor:       csvLoading ? "not-allowed" : "pointer",
              flexShrink:   0,
              transition:   "color 0.15s",
            }}
          >
            {csvLoading ? "Exporting…" : "↓ Export CSV"}
          </button>
        </div>

        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: TH_COLS,
          padding: "10px 20px",
          background: "rgba(255,255,255,0.02)",
          borderBottom: "1px solid var(--border)",
        }}>
          {["User", "Type", "Status", "Amount", "Date", "Stripe ID"].map(h => (
            <span key={h} style={{
              fontSize: 11, fontWeight: 700, color: "var(--muted)",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Empty state */}
        {payments.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--white)", marginBottom: 6 }}>
              No payments recorded yet
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
              Payments will appear here once Stripe begins processing subscriptions,
              worker locks, or application fees.
            </div>
          </div>
        ) : (
          payments.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "grid", gridTemplateColumns: TH_COLS,
                padding: "13px 20px", alignItems: "center",
                borderBottom: "1px solid var(--border)",
                background: i % 2 === 1 ? "rgba(255,255,255,0.01)" : "transparent",
                fontSize: 13,
              }}
            >
              {/* User */}
              <div style={{ overflow: "hidden", paddingRight: 8 }}>
                <div style={{
                  fontWeight: 600, color: "var(--white)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.user.displayName}
                </div>
                <div style={{
                  fontSize: 11, color: "var(--muted)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.user.email}
                </div>
              </div>

              {/* Type */}
              <div><TypeBadge type={p.type} /></div>

              {/* Status */}
              <div><StatusBadge status={p.status} /></div>

              {/* Amount */}
              <div style={{
                fontWeight: 700,
                fontFamily: "var(--font-display)",
                color: p.amount < 0 ? "#f87171" : "var(--white)",
              }}>
                {p.amount < 0 ? `−${fmt(Math.abs(p.amount))}` : fmt(p.amount)}
              </div>

              {/* Date */}
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                {fmtDate(p.createdAt)}
              </div>

              {/* Stripe ID */}
              <div>
                {p.stripePaymentId ? (
                  <button
                    onClick={() => copyStripeId(p.stripePaymentId!)}
                    title={p.stripePaymentId}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                      color: copiedId === p.stripePaymentId ? "#4ade80" : "var(--muted)",
                      fontSize: 11, fontFamily: "monospace", textAlign: "left",
                      transition: "color 0.15s",
                    }}
                  >
                    {copiedId === p.stripePaymentId
                      ? "✓ Copied!"
                      : p.stripePaymentId.length > 18
                        ? `${p.stripePaymentId.slice(0, 18)}…`
                        : p.stripePaymentId}
                  </button>
                ) : (
                  <span style={{ color: "var(--border)", fontSize: 11 }}>—</span>
                )}
              </div>
            </div>
          ))
        )}

        {/* Pagination */}
        {total > 0 && (
          <div style={{
            padding: "14px 20px", borderTop: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: "6px 14px", borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)", background: "transparent",
                color: page === 1 ? "var(--border)" : "var(--white)",
                fontSize: 12, cursor: page === 1 ? "not-allowed" : "pointer",
              }}
            >
              ← Prev
            </button>

            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Page {page} of {totalPages}
              <span style={{ marginLeft: 12, fontSize: 11 }}>({total.toLocaleString()} total)</span>
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                padding: "6px 14px", borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)", background: "transparent",
                color: page >= totalPages ? "var(--border)" : "var(--white)",
                fontSize: 12, cursor: page >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
