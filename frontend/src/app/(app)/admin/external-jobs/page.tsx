"use client";
// src/app/(app)/admin/external-jobs/page.tsx
// Admin CRUD for ExternalJob — admin-pasted links to jobs hosted elsewhere
// (EURES, LinkedIn, Indeed, national job boards). Modeled on the table +
// filter-bar shape of admin/jobs/pending/page.tsx, using the shared admin
// theme (lib/admin-theme.ts) that most other admin pages already use.

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData, ErrorState } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { C, inputStyle } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

type StatusTab = "ALL" | "ACTIVE" | "ARCHIVED";

interface ExternalJobRow {
  id:              string;
  title:           string;
  description:     string;
  country:         string;
  city:            string | null;
  salaryMin:       string | number | null;
  salaryMax:       string | number | null;
  salaryCurrency:  string | null;
  contractType:    string | null;
  externalUrl:     string;
  sourceName:      string;
  status:          "ACTIVE" | "ARCHIVED";
  createdAt:       string;
  createdBy:       { id: string; email: string } | null;
}

interface FormState {
  title:          string;
  description:    string;
  country:        string;
  city:           string;
  salaryMin:      string;
  salaryMax:      string;
  salaryCurrency: string;
  contractType:   string;
  externalUrl:    string;
  sourceName:     string;
}

const EMPTY_FORM: FormState = {
  title: "", description: "", country: "", city: "",
  salaryMin: "", salaryMax: "", salaryCurrency: "EUR",
  contractType: "", externalUrl: "", sourceName: "",
};

const CONTRACT_TYPES = [
  { value: "",             label: "Not specified" },
  { value: "FULL_TIME",    label: "Full-time" },
  { value: "PART_TIME",    label: "Part-time" },
  { value: "CONTRACT",     label: "Contract" },
  { value: "TEMPORARY",    label: "Temporary" },
  { value: "INTERNSHIP",   label: "Internship" },
  { value: "FREELANCE",    label: "Freelance" },
];

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "ALL",      label: "All" },
  { key: "ACTIVE",   label: "Active" },
  { key: "ARCHIVED", label: "Archived" },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtSalary(job: ExternalJobRow) {
  if (!job.salaryMin && !job.salaryMax) return "—";
  const cur = job.salaryCurrency ?? "";
  const min = job.salaryMin ? Math.round(Number(job.salaryMin)).toLocaleString() : null;
  const max = job.salaryMax ? Math.round(Number(job.salaryMax)).toLocaleString() : null;
  if (min && max) return `${cur} ${min}–${max}`;
  return `${cur} ${min ?? max}`;
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function ExternalJobModal({
  initial, saving, error, onSave, onClose,
}: {
  initial:  FormState;
  saving:   boolean;
  error:    string | null;
  onSave:   (form: FormState) => void;
  onClose:  () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = initial.title !== "" || initial.externalUrl !== "";

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
        <div className="glass-modal" style={{ padding: 28, maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
            {isEdit ? "Edit external job" : "Add external job"}
          </h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>
            Pasted links to jobs hosted elsewhere — EURES, LinkedIn, Indeed, national boards.
          </p>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={label}>Job title *</label>
              <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Warehouse Operative" />
            </div>

            <div>
              <label style={label}>Description *</label>
              <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" as const }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Role summary as shown on the source board…" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Country *</label>
                <input style={inputStyle} value={form.country} onChange={e => set("country", e.target.value)} placeholder="Germany" />
              </div>
              <div>
                <label style={label}>City</label>
                <input style={inputStyle} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Berlin" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Salary min</label>
                <input style={inputStyle} type="number" value={form.salaryMin} onChange={e => set("salaryMin", e.target.value)} placeholder="2000" />
              </div>
              <div>
                <label style={label}>Salary max</label>
                <input style={inputStyle} type="number" value={form.salaryMax} onChange={e => set("salaryMax", e.target.value)} placeholder="2800" />
              </div>
              <div>
                <label style={label}>Currency</label>
                <input style={inputStyle} value={form.salaryCurrency} onChange={e => set("salaryCurrency", e.target.value)} placeholder="EUR" />
              </div>
            </div>

            <div>
              <label style={label}>Contract type</label>
              <select style={{ ...inputStyle, appearance: "none" as const, cursor: "pointer" }} value={form.contractType} onChange={e => set("contractType", e.target.value)}>
                {CONTRACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label style={label}>Source name *</label>
              <input style={inputStyle} value={form.sourceName} onChange={e => set("sourceName", e.target.value)} placeholder="EURES" />
            </div>

            <div>
              <label style={label}>External URL *</label>
              <input style={inputStyle} value={form.externalUrl} onChange={e => set("externalUrl", e.target.value)} placeholder="https://ec.europa.eu/eures/..." />
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
              style={{ flex: 1, padding: "11px 0", borderRadius: 10, background: saving ? "rgba(220,38,38,0.5)" : C.accent, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add job"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminExternalJobsPage() {
  const [jobs, setJobs]       = useState<ExternalJobRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<StatusTab>("ALL");
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [toast, setToast]     = useState<ToastData>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ExternalJobRow | null>(null);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExternalJobRow | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (tab !== "ALL") params.status = tab;
    if (search.trim()) params.search = search.trim();

    const res = await adminApi.getExternalJobs(params);
    if (!res.success) { setError(res.error ?? "Could not load external jobs."); setLoading(false); return; }
    setJobs((res.data as ExternalJobRow[]) ?? []);
    setTotal((res as unknown as { total: number }).total ?? 0);
    setLoading(false);
  }, [page, tab, search]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingJob(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(job: ExternalJobRow) {
    setEditingJob(job);
    setFormError(null);
    setModalOpen(true);
  }

  function formStateFor(job: ExternalJobRow | null): FormState {
    if (!job) return EMPTY_FORM;
    return {
      title:          job.title,
      description:    job.description,
      country:        job.country,
      city:           job.city ?? "",
      salaryMin:      job.salaryMin != null ? String(job.salaryMin) : "",
      salaryMax:      job.salaryMax != null ? String(job.salaryMax) : "",
      salaryCurrency: job.salaryCurrency ?? "",
      contractType:   job.contractType ?? "",
      externalUrl:    job.externalUrl,
      sourceName:     job.sourceName,
    };
  }

  async function handleSave(form: FormState) {
    if (!form.title.trim() || !form.description.trim() || !form.country.trim() || !form.externalUrl.trim() || !form.sourceName.trim()) {
      setFormError("Title, description, country, source name, and external URL are required.");
      return;
    }
    setSaving(true);
    setFormError(null);

    const body: Record<string, unknown> = {
      title:          form.title.trim(),
      description:    form.description.trim(),
      country:        form.country.trim(),
      city:           form.city.trim() || undefined,
      salaryMin:      form.salaryMin ? Number(form.salaryMin) : undefined,
      salaryMax:      form.salaryMax ? Number(form.salaryMax) : undefined,
      salaryCurrency: form.salaryCurrency.trim() || undefined,
      contractType:   form.contractType || undefined,
      externalUrl:    form.externalUrl.trim(),
      sourceName:     form.sourceName.trim(),
    };

    const res = editingJob
      ? await adminApi.updateExternalJob(editingJob.id, body)
      : await adminApi.createExternalJob(body);

    setSaving(false);
    if (!res.success) { setFormError(res.error ?? "Could not save external job."); return; }

    setModalOpen(false);
    showToast(editingJob ? "External job updated" : "External job added", "ok");
    load();
  }

  async function handleArchiveToggle(job: ExternalJobRow) {
    setActionBusyId(job.id);
    const res = job.status === "ACTIVE"
      ? await adminApi.archiveExternalJob(job.id)
      : await adminApi.updateExternalJob(job.id, { status: "ACTIVE" });
    setActionBusyId(null);
    if (!res.success) { showToast(res.error ?? "Action failed", "err"); return; }
    showToast(job.status === "ACTIVE" ? "Archived" : "Reactivated", "ok");
    load();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setActionBusyId(deleteTarget.id);
    const res = await adminApi.deleteExternalJob(deleteTarget.id);
    setActionBusyId(null);
    setDeleteTarget(null);
    if (!res.success) { showToast(res.error ?? "Delete failed", "err"); return; }
    showToast("External job deleted", "ok");
    load();
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0 }}>External jobs</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: "6px 0 0" }}>
            Links to jobs hosted elsewhere — EURES, LinkedIn, Indeed, national job boards. Shown to workers with an &quot;External&quot; badge.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ padding: "10px 20px", borderRadius: 10, background: C.accent, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          + Add external job
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              style={{
                padding: "7px 16px", borderRadius: 8,
                border: `1px solid ${tab === t.key ? "rgba(220,38,38,0.4)" : C.border}`,
                background: tab === t.key ? "rgba(220,38,38,0.12)" : "transparent",
                color: tab === t.key ? "#fca5a5" : C.muted,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search title, source, country…"
          style={{ ...inputStyle, width: 260 }}
        />
        {!loading && <span style={{ marginLeft: "auto", fontSize: 13, color: C.muted }}>{total} job{total !== 1 ? "s" : ""}</span>}
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {["Title", "Source", "Location", "Salary", "Status", "Posted", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} style={{ padding: "16px 20px" }}>
                        <div style={{ height: 12, width: j === 0 ? "70%" : "50%", background: "rgba(255,255,255,0.06)", borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr><td colSpan={7} style={{ padding: 24 }}>
                  <ErrorState message={error} retry={load} title="Could not load external jobs" />
                </td></tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "64px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>🔗</div>
                    <div style={{ color: C.muted, fontSize: 15 }}>No external jobs yet</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginTop: 6 }}>
                      Add a link from EURES, LinkedIn, Indeed, or a national job board.
                    </div>
                  </td>
                </tr>
              ) : (
                jobs.map(job => (
                  <tr key={job.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 600, color: C.text, maxWidth: 260 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</div>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: C.secondary }}>{job.sourceName}</td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: C.secondary }}>
                      {[job.city, job.country].filter(Boolean).join(", ")}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: C.secondary }}>{fmtSalary(job)}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700,
                        padding: "3px 9px", borderRadius: 99,
                        color: job.status === "ACTIVE" ? C.green : C.muted,
                        background: job.status === "ACTIVE" ? "rgba(34,197,94,0.12)" : "rgba(113,113,122,0.12)",
                      }}>
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted }}>{fmtDate(job.createdAt)}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openEdit(job)} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                          Edit
                        </button>
                        <button
                          onClick={() => handleArchiveToggle(job)}
                          disabled={actionBusyId === job.id}
                          style={{ background: "none", border: "none", color: C.yellow, fontSize: 12, fontWeight: 600, cursor: actionBusyId === job.id ? "not-allowed" : "pointer", padding: 0 }}
                        >
                          {job.status === "ACTIVE" ? "Archive" : "Reactivate"}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(job)}
                          disabled={actionBusyId === job.id}
                          style={{ background: "none", border: "none", color: C.accent, fontSize: 12, fontWeight: 600, cursor: actionBusyId === job.id ? "not-allowed" : "pointer", padding: 0 }}
                        >
                          Delete
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

      {modalOpen && (
        <ExternalJobModal
          initial={formStateFor(editingJob)}
          saving={saving}
          error={formError}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete external job?"
        message={deleteTarget ? `"${deleteTarget.title}" will be permanently removed from the feed. This cannot be undone.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
