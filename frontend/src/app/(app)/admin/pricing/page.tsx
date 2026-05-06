"use client";
// frontend/src/app/(app)/admin/pricing/page.tsx
// Platform pricing configuration — worker lock rates + application fees.

import { CSSProperties, useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastState = { msg: string; ok: boolean } | null;

interface ConfigMap {
  lock_daily_rate_cents?:     string;
  lock_max_concurrent?:       string;
  lock_max_duration_days?:    string;
  application_fee_enabled?:   string;
  application_base_fee_cents?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCents(v: string | undefined, fallback: number) {
  const n = parseInt(v ?? "");
  return isNaN(n) ? fallback : n;
}

function parseNum(v: string | undefined, fallback: number) {
  const n = parseInt(v ?? "");
  return isNaN(n) ? fallback : n;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: CSSProperties = {
  background:   "var(--navy-2)",
  border:       "1px solid var(--border)",
  borderRadius: "var(--r-lg)",
  overflow:     "hidden",
  marginBottom: 24,
};

const cardHeader: CSSProperties = {
  padding:        "16px 20px",
  borderBottom:   "1px solid var(--border)",
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
};

const h2Style: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize:   15,
  color:      "var(--white)",
  margin:     0,
};

const fieldRow: CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
  padding:        "16px 20px",
  borderBottom:   "1px solid var(--border)",
};

const labelCol: CSSProperties = { flex: 1 };

const labelTitle: CSSProperties = {
  fontSize:   13,
  fontWeight: 600,
  color:      "var(--white)",
  marginBottom: 2,
};

const labelSub: CSSProperties = {
  fontSize: 12,
  color:    "var(--muted)",
};

const numInput: CSSProperties = {
  width:        90,
  padding:      "7px 10px",
  borderRadius: 6,
  fontSize:     13,
  background:   "var(--navy-1)",
  border:       "1px solid var(--border)",
  color:        "var(--white)",
  outline:      "none",
};

function SaveBtn({ onClick, saving, disabled }: { onClick: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      style={{
        marginLeft:   12,
        padding:      "6px 16px",
        borderRadius: 6,
        fontSize:     12,
        fontWeight:   600,
        background:   saving || disabled ? "var(--border)" : "var(--admin-2)",
        color:        saving || disabled ? "var(--muted)" : "var(--white)",
        border:       "none",
        cursor:       saving || disabled ? "not-allowed" : "pointer",
        transition:   "background 0.15s",
        whiteSpace:   "nowrap",
      }}
    >
      {saving ? "Saving…" : "Save"}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPricingPage() {
  const [config,  setConfig]  = useState<ConfigMap>({});
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState<ToastState>(null);

  // ── Per-field draft state ──────────────────────────────────────────────────
  // Worker lock
  const [rateDollars,   setRateDollars]   = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState("");
  const [maxDays,       setMaxDays]       = useState("");
  const [rateSaving,    setRateSaving]    = useState(false);
  const [concSaving,    setConcSaving]    = useState(false);
  const [daysSaving,    setDaysSaving]    = useState(false);

  // Application fee
  const [feeEnabled,    setFeeEnabled]    = useState(true);
  const [feeBaseDollars, setFeeBaseDollars] = useState("");
  const [toggleSaving,  setToggleSaving]  = useState(false);
  const [feeSaving,     setFeeSaving]     = useState(false);

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    adminApi.getAllConfig().then((raw) => {
      const r = raw as unknown as { success: boolean; data?: ConfigMap };
      if (!r.success || !r.data) return;
      const c = r.data;
      setConfig(c);
      setRateDollars((parseCents(c.lock_daily_rate_cents, 200) / 100).toFixed(2));
      setMaxConcurrent(String(parseNum(c.lock_max_concurrent, 5)));
      setMaxDays(String(parseNum(c.lock_max_duration_days, 14)));
      setFeeEnabled((c.application_fee_enabled ?? "true") === "true");
      setFeeBaseDollars((parseCents(c.application_base_fee_cents, 300) / 100).toFixed(2));
      setLoading(false);
    });
  }, []);

  // ── Save handlers ──────────────────────────────────────────────────────────

  async function saveLockRate() {
    const cents = Math.round(parseFloat(rateDollars) * 100);
    if (isNaN(cents) || cents < 50 || cents > 100000) {
      showToast("Daily rate must be between $0.50 and $1000.00", false); return;
    }
    setRateSaving(true);
    const r = await adminApi.updateLockRateConfig({ dailyRateCents: cents }).catch(() => ({ success: false }));
    setRateSaving(false);
    if ((r as { success: boolean }).success) {
      setConfig(c => ({ ...c, lock_daily_rate_cents: String(cents) }));
      showToast("Daily rate saved", true);
    } else {
      showToast("Failed to save daily rate", false);
    }
  }

  async function saveMaxConcurrent() {
    const n = parseInt(maxConcurrent);
    if (isNaN(n) || n < 1 || n > 50) {
      showToast("Max concurrent locks must be 1–50", false); return;
    }
    setConcSaving(true);
    const r = await adminApi.updateLockRateConfig({ maxConcurrentLocks: n }).catch(() => ({ success: false }));
    setConcSaving(false);
    if ((r as { success: boolean }).success) {
      setConfig(c => ({ ...c, lock_max_concurrent: String(n) }));
      showToast("Max concurrent locks saved", true);
    } else {
      showToast("Failed to save setting", false);
    }
  }

  async function saveMaxDays() {
    const n = parseInt(maxDays);
    if (isNaN(n) || n < 1 || n > 365) {
      showToast("Max duration must be 1–365 days", false); return;
    }
    setDaysSaving(true);
    const r = await adminApi.updateLockRateConfig({ maxDurationDays: n }).catch(() => ({ success: false }));
    setDaysSaving(false);
    if ((r as { success: boolean }).success) {
      setConfig(c => ({ ...c, lock_max_duration_days: String(n) }));
      showToast("Max duration saved", true);
    } else {
      showToast("Failed to save setting", false);
    }
  }

  async function saveToggle(enabled: boolean) {
    setToggleSaving(true);
    const r = await adminApi.updatePricingConfig({ enabled }).catch(() => ({ success: false }));
    setToggleSaving(false);
    if ((r as { success: boolean }).success) {
      setFeeEnabled(enabled);
      setConfig(c => ({ ...c, application_fee_enabled: String(enabled) }));
      showToast(`Application fees ${enabled ? "enabled" : "disabled"}`, true);
    } else {
      showToast("Failed to update fee status", false);
    }
  }

  async function saveFeeBase() {
    const cents = Math.round(parseFloat(feeBaseDollars) * 100);
    if (isNaN(cents) || cents < 50 || cents > 2500) {
      showToast("Base fee must be between $0.50 and $25.00", false); return;
    }
    setFeeSaving(true);
    const r = await adminApi.updatePricingConfig({ baseCents: cents }).catch(() => ({ success: false }));
    setFeeSaving(false);
    if ((r as { success: boolean }).success) {
      setConfig(c => ({ ...c, application_base_fee_cents: String(cents) }));
      showToast("Base fee saved", true);
    } else {
      showToast("Failed to save base fee", false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: "32px 40px", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 760, margin: "0 auto" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position:     "fixed",
          top:          24,
          right:        24,
          zIndex:       9999,
          padding:      "12px 20px",
          borderRadius: 10,
          fontSize:     13,
          fontWeight:   600,
          background:   toast.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          color:        toast.ok ? "#4ade80" : "#f87171",
          border:       `1px solid ${toast.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          boxShadow:    "0 4px 24px rgba(0,0,0,0.3)",
        }}>
          {toast.msg}
        </div>
      )}

      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--white)", margin: "0 0 6px" }}>
        Platform pricing
      </h1>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 28px" }}>
        Configure worker lock rates and application fee settings.
      </p>

      {/* ── Section 1: Worker Lock settings ── */}
      <div style={card}>
        <div style={cardHeader}>
          <h2 style={h2Style}>Worker Lock settings</h2>
        </div>

        {/* Daily rate */}
        <div style={fieldRow}>
          <div style={labelCol}>
            <div style={labelTitle}>Daily reservation rate</div>
            <div style={labelSub}>Amount charged per day when an employer reserves a worker</div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--muted)", marginRight: 4 }}>$</span>
            <input
              type="number"
              min={0.5}
              max={1000}
              step={0.5}
              value={rateDollars}
              onChange={e => setRateDollars(e.target.value)}
              style={numInput}
            />
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>USD / day</span>
            <SaveBtn onClick={saveLockRate} saving={rateSaving} />
          </div>
        </div>

        {/* Max concurrent locks */}
        <div style={fieldRow}>
          <div style={labelCol}>
            <div style={labelTitle}>Max concurrent reservations per employer</div>
            <div style={labelSub}>Maximum number of active worker locks an employer can hold at once</div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={maxConcurrent}
              onChange={e => setMaxConcurrent(e.target.value)}
              style={{ ...numInput, width: 70 }}
            />
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>locks</span>
            <SaveBtn onClick={saveMaxConcurrent} saving={concSaving} />
          </div>
        </div>

        {/* Max duration */}
        <div style={{ ...fieldRow, borderBottom: "none" }}>
          <div style={labelCol}>
            <div style={labelTitle}>Max reservation duration</div>
            <div style={labelSub}>Maximum number of days an employer can reserve a worker per booking</div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="number"
              min={1}
              max={365}
              step={1}
              value={maxDays}
              onChange={e => setMaxDays(e.target.value)}
              style={{ ...numInput, width: 70 }}
            />
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>days</span>
            <SaveBtn onClick={saveMaxDays} saving={daysSaving} />
          </div>
        </div>
      </div>

      {/* ── Section 2: Application fee settings ── */}
      <div style={card}>
        <div style={cardHeader}>
          <h2 style={h2Style}>Application fee settings</h2>
        </div>

        {/* Enabled toggle */}
        <div style={fieldRow}>
          <div style={labelCol}>
            <div style={labelTitle}>Application fees</div>
            <div style={labelSub}>When enabled, workers are charged a fee when applying to jobs</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              fontSize:   12,
              fontWeight: 700,
              padding:    "3px 10px",
              borderRadius: 20,
              background: feeEnabled ? "rgba(34,197,94,0.15)" : "rgba(100,100,100,0.15)",
              color:      feeEnabled ? "#4ade80" : "var(--muted)",
            }}>
              {feeEnabled ? "Enabled" : "Disabled"}
            </span>
            <button
              onClick={() => !toggleSaving && saveToggle(!feeEnabled)}
              disabled={toggleSaving}
              style={{
                padding:      "6px 16px",
                borderRadius: 6,
                fontSize:     12,
                fontWeight:   600,
                background:   "var(--border)",
                color:        "var(--white)",
                border:       "none",
                cursor:       toggleSaving ? "not-allowed" : "pointer",
              }}
            >
              {toggleSaving ? "Saving…" : feeEnabled ? "Disable" : "Enable"}
            </button>
          </div>
        </div>

        {/* Base fee */}
        <div style={{ ...fieldRow, borderBottom: "none" }}>
          <div style={labelCol}>
            <div style={labelTitle}>Base application fee</div>
            <div style={labelSub}>Starting fee before regional and salary multipliers are applied ($0.50–$25.00)</div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--muted)", marginRight: 4 }}>$</span>
            <input
              type="number"
              min={0.5}
              max={25}
              step={0.5}
              value={feeBaseDollars}
              onChange={e => setFeeBaseDollars(e.target.value)}
              style={numInput}
            />
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>USD</span>
            <SaveBtn onClick={saveFeeBase} saving={feeSaving} />
          </div>
        </div>
      </div>

      {/* Info note */}
      <div style={{
        fontSize:     12,
        color:        "var(--muted)",
        padding:      "12px 16px",
        background:   "rgba(255,255,255,0.03)",
        borderRadius: 8,
        borderLeft:   "3px solid var(--admin-2)",
        lineHeight:   1.6,
      }}>
        Application fee formula: base × region multiplier (1×–2.5×) × salary tier (0.8×–1.4×).
        Final amount is clamped to $1.00–$25.00 and rounded to the nearest $0.50.
      </div>
    </div>
  );
}
