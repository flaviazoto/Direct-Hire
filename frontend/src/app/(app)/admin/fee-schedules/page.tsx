"use client";
// src/app/(app)/admin/fee-schedules/page.tsx
// Admin CRUD for AdminFeeSchedule — per-country/visa admin processing fee
// amounts, looked up by createFeeCharge (admin-fee.controller.ts) when
// charging a worker on /admin/hiring/review's Awaiting Fee tab. Before this
// page, the table could only be edited via direct DB access — confirmed via
// audit that it currently has zero real rows, so every charge attempt fails
// with "No fee configured" until an admin populates it here.
//
// Modeled on admin/external-jobs/page.tsx's table + status-tabs + modal
// pattern (the closest existing precedent for a growing multi-row admin
// table, as opposed to /admin/pricing's single-value-settings-form shape,
// which doesn't fit this data). Simplified for 3 real fields instead of
// ~10, and no delete-confirmation flow — isActive is the only removal
// path, matching the schema's own design (no deletedAt/hard delete).
//
// countryCode/visaType are immutable once created (enforced by the
// [countryCode, visaType] unique constraint — createFeeSchedule 409s on a
// duplicate combo rather than allowing an update). To change either, add a
// new row and deactivate the old one instead of trying to rename in place.

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData, ErrorState } from "@/components/ui";
import { C, inputStyle } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

type StatusTab = "ALL" | "ACTIVE" | "INACTIVE";

interface FeeScheduleRow {
  id:          string;
  countryCode: string;
  visaType:    string;
  amountUsd:   string | number;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
  updatedBy:   { email: string } | null;
}

interface CreateFormState {
  countryCode: string;
  visaType:    string;
  amountUsd:   string;
}

const EMPTY_CREATE_FORM: CreateFormState = { countryCode: "", visaType: "", amountUsd: "" };

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "ALL",      label: "All" },
  { key: "ACTIVE",   label: "Active" },
  { key: "INACTIVE", label: "Inactive" },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Add modal (create only — countryCode/visaType are set once) ──────────────

function AddModal({
  saving, error, onSave, onClose,
}: {
  saving: boolean;
  error:  string | null;
  onSave: (form: CreateFormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const set = (k: keyof CreateFormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, saving]);

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, display: "block" };

  return (
    <>
      <div onClick={() => !saving && onClose()} className="glass-scrim" style={{ zIndex: 300 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 301, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="glass-modal" style={{ padding: 28, maxWidth: 440, width: "100%" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>Add fee schedule</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>
            Must exactly match the job&apos;s country string (e.g. &quot;Germany&quot;, &quot;Italy&quot;, &quot;Croatia&quot;) — this is looked up automatically when an admin charges the fee.
          </p>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={label}>Country *</label>
              <input style={inputStyle} value={form.countryCode} onChange={e => set("countryCode", e.target.value)} placeholder="Germany" />
            </div>
            <div>
              <label style={label}>Visa type *</label>
              <input style={inputStyle} value={form.visaType} onChange={e => set("visaType", e.target.value)} placeholder="H-2A" />
            </div>
            <div>
              <label style={label}>Amount (USD) *</label>
              <input style={inputStyle} type="number" min="0.01" step="0.01" value={form.amountUsd} onChange={e => set("amountUsd", e.target.value)} placeholder="150.00" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{ flex: 1, padding: "11px 0", borderRadius: 10, background: "transparent", border: `1px solid ${C.border}`, color: C.text, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(form)}
              disabled={saving}
              style={{ flex: 1, padding: "11px 0", borderRadius: 10, background: saving ? "rgba(224,176,32,0.5)" : C.accent, border: "none", color: "#08142A", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Saving…" : "Add schedule"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Edit modal (amountUsd + isActive only — countryCode/visaType immutable) ──

function EditModal({
  row, saving, error, onSave, onClose,
}: {
  row:    FeeScheduleRow;
  saving: boolean;
  error:  string | null;
  onSave: (amountUsd: string, isActive: boolean) => void;
  onClose: () => void;
}) {
  const [amountUsd, setAmountUsd] = useState(String(row.amountUsd));
  const [isActive, setIsActive]   = useState(row.isActive);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, saving]);

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, display: "block" };

  return (
    <>
      <div onClick={() => !saving && onClose()} className="glass-scrim" style={{ zIndex: 300 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 301, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="glass-modal" style={{ padding: 28, maxWidth: 440, width: "100%" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
            Edit {row.countryCode} / {row.visaType}
          </h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>
            Country and visa type can&apos;t be changed here — add a new schedule and deactivate this one instead.
          </p>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={label}>Amount (USD) *</label>
              <input style={inputStyle} type="number" min="0.01" step="0.01" value={amountUsd} onChange={e => setAmountUsd(e.target.value)} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.text }}>
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
              Active (available for charging)
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{ flex: 1, padding: "11px 0", borderRadius: 10, background: "transparent", border: `1px solid ${C.border}`, color: C.text, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(amountUsd, isActive)}
              disabled={saving}
              style={{ flex: 1, padding: "11px 0", borderRadius: 10, background: saving ? "rgba(224,176,32,0.5)" : C.accent, border: "none", color: "#08142A", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminFeeSchedulesPage() {
  const [rows, setRows]       = useState<FeeScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<StatusTab>("ALL");
  const [toast, setToast]     = useState<ToastData>(null);

  const [addOpen, setAddOpen]     = useState(false);
  const [editRow, setEditRow]     = useState<FeeScheduleRow | null>(null);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminApi.getFeeSchedules();
    if (!res.success) { setError(res.error ?? "Could not load fee schedules."); setLoading(false); return; }
    setRows((res.data as FeeScheduleRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = rows
    .filter(r => tab === "ALL" || (tab === "ACTIVE" ? r.isActive : !r.isActive))
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.visaType.localeCompare(b.visaType));

  async function handleCreate(form: CreateFormState) {
    const countryCode = form.countryCode.trim();
    const visaType = form.visaType.trim();
    const amount = Number(form.amountUsd);
    if (!countryCode || !visaType) { setFormError("Country and visa type are required."); return; }
    if (!amount || amount <= 0) { setFormError("Enter a valid amount greater than $0."); return; }

    setSaving(true);
    setFormError(null);
    const res = await adminApi.createFeeSchedule({ countryCode, visaType, amountUsd: amount });
    setSaving(false);

    if (!res.success) {
      // 409 duplicate combo — surface clearly rather than a generic message,
      // per the audit's finding on createFeeSchedule's own error text.
      setFormError(res.error ?? "Could not create fee schedule.");
      return;
    }
    setAddOpen(false);
    showToast(`Fee schedule added for ${countryCode} / ${visaType}`, "ok");
    load();
  }

  async function handleUpdate(amountUsd: string, isActive: boolean) {
    if (!editRow) return;
    const amount = Number(amountUsd);
    if (!amount || amount <= 0) { setFormError("Enter a valid amount greater than $0."); return; }

    setSaving(true);
    setFormError(null);
    const res = await adminApi.updateFeeSchedule(editRow.id, { amountUsd: amount, isActive });
    setSaving(false);

    if (!res.success) { setFormError(res.error ?? "Could not update fee schedule."); return; }
    setEditRow(null);
    showToast("Fee schedule updated", "ok");
    load();
  }

  async function handleQuickToggle(row: FeeScheduleRow) {
    const res = await adminApi.updateFeeSchedule(row.id, { isActive: !row.isActive });
    if (!res.success) { showToast(res.error ?? "Could not update fee schedule.", "err"); return; }
    showToast(row.isActive ? "Deactivated" : "Reactivated", "ok");
    load();
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1000, margin: "0 auto", fontFamily: "var(--font-body)" }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: C.text, margin: 0 }}>Fee schedules</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: "6px 0 0", maxWidth: 560 }}>
            Per-country/visa admin processing fee amounts. Looked up automatically when charging a worker on the
            Awaiting Fee tab — a missing or inactive row blocks that charge with a clear error.
          </p>
        </div>
        <button
          onClick={() => { setFormError(null); setAddOpen(true); }}
          style={{ padding: "10px 20px", borderRadius: 10, background: C.accent, border: "none", color: "#08142A", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          + Add fee schedule
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "7px 16px", borderRadius: 8,
                border: `1px solid ${tab === t.key ? "rgba(224,176,32,0.4)" : C.border}`,
                background: tab === t.key ? "rgba(224,176,32,0.12)" : "transparent",
                color: tab === t.key ? C.accent : C.muted,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!loading && <span style={{ marginLeft: "auto", fontSize: 13, color: C.muted }}>{visible.length} schedule{visible.length !== 1 ? "s" : ""}</span>}
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {["Country", "Visa type", "Amount (USD)", "Status", "Last updated", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} style={{ padding: "16px 20px" }}>
                        <div style={{ height: 12, width: j === 0 ? "70%" : "50%", background: "rgba(255,255,255,0.06)", borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr><td colSpan={6} style={{ padding: 24 }}>
                  <ErrorState message={error} retry={load} title="Could not load fee schedules" />
                </td></tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "64px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>💳</div>
                    <div style={{ color: C.muted, fontSize: 15 }}>
                      {rows.length === 0 ? "No fee schedules configured yet — add one to enable admin fee charges." : "No schedules match this filter."}
                    </div>
                  </td>
                </tr>
              ) : (
                visible.map(row => (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 600, color: C.text }}>{row.countryCode}</td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: C.secondary }}>{row.visaType}</td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: C.secondary }}>${Number(row.amountUsd).toFixed(2)}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700,
                        padding: "3px 9px", borderRadius: 99,
                        color: row.isActive ? C.green : C.muted,
                        background: row.isActive ? "rgba(34,197,94,0.12)" : "rgba(113,113,122,0.12)",
                      }}>
                        {row.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted }}>
                      {fmtDate(row.updatedAt)}{row.updatedBy && <> · {row.updatedBy.email}</>}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { setFormError(null); setEditRow(row); }} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                          Edit
                        </button>
                        <button onClick={() => handleQuickToggle(row)} style={{ background: "none", border: "none", color: C.yellow, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                          {row.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <AddModal
          saving={saving}
          error={formError}
          onSave={handleCreate}
          onClose={() => setAddOpen(false)}
        />
      )}

      {editRow && (
        <EditModal
          row={editRow}
          saving={saving}
          error={formError}
          onSave={handleUpdate}
          onClose={() => setEditRow(null)}
        />
      )}
    </div>
  );
}
