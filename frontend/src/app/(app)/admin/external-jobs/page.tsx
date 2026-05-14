"use client";
// frontend/src/app/(app)/admin/external-jobs/page.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Eye, EyeOff, Pencil, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExternalJob {
  id: string;
  title: string;
  company: string;
  location: string;
  country: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  jobType: string;
  description: string | null;
  externalUrl: string;
  source: string | null;
  isActive: boolean;
  isPinned: boolean;
  skills: string[];
  views: number;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  title: string;
  company: string;
  location: string;
  country: string;
  source: string;
  jobType: string;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  skills: string;
  externalUrl: string;
  description: string;
  isPinned: boolean;
}

const INITIAL_FORM: FormData = {
  title: "",
  company: "",
  location: "",
  country: "",
  source: "",
  jobType: "Full-time",
  salaryMin: "",
  salaryMax: "",
  currency: "USD",
  skills: "",
  externalUrl: "",
  description: "",
  isPinned: false,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtSalary(job: ExternalJob) {
  if (!job.salaryMin && !job.salaryMax) return "—";
  const cur = job.currency || "USD";
  if (job.salaryMin && job.salaryMax)
    return `${cur} ${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()}`;
  if (job.salaryMin) return `${cur} ${job.salaryMin.toLocaleString()}+`;
  return `Up to ${cur} ${job.salaryMax!.toLocaleString()}`;
}

const inputCls =
  "w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600";

const labelCls = "text-xs uppercase tracking-wider font-semibold text-foreground mb-1.5 block";

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <p className={`text-2xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ExternalJobsAdminPage() {
  const [jobs, setJobs]           = useState<ExternalJob[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

  const stats = useMemo(() => ({
    total:  jobs.length,
    active: jobs.filter(j => j.isActive).length,
    pinned: jobs.filter(j => j.isPinned).length,
  }), [jobs]);

  function authHeaders() {
    const token = localStorage.getItem("dh_token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/external-jobs/admin`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const resData = await res.json();
      setJobs(resData.data?.jobs ?? resData.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // ── Modal helpers ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (job: ExternalJob) => {
    setEditingId(job.id);
    setForm({
      title:       job.title,
      company:     job.company,
      location:    job.location,
      country:     job.country,
      source:      job.source ?? "",
      jobType:     job.jobType,
      salaryMin:   job.salaryMin != null ? String(job.salaryMin) : "",
      salaryMax:   job.salaryMax != null ? String(job.salaryMax) : "",
      currency:    job.currency,
      skills:      job.skills.join(", "),
      externalUrl: job.externalUrl,
      description: job.description ?? "",
      isPinned:    job.isPinned,
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(INITIAL_FORM);
    setFormError(null);
  };

  // ── Actions ────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (!form.title.trim() || !form.company.trim() || !form.location.trim() || !form.externalUrl.trim()) {
        setFormError("Title, company, location and URL are required");
        return;
      }
      try { new URL(form.externalUrl); } catch {
        setFormError("Invalid URL — must start with https://");
        return;
      }

      const payload = {
        title:       form.title.trim(),
        company:     form.company.trim(),
        location:    form.location.trim(),
        country:     form.country.trim(),
        source:      form.source.trim() || undefined,
        jobType:     form.jobType,
        salaryMin:   form.salaryMin ? parseInt(form.salaryMin) : undefined,
        salaryMax:   form.salaryMax ? parseInt(form.salaryMax) : undefined,
        currency:    form.currency,
        skills:      form.skills ? form.skills.split(",").map(s => s.trim()).filter(Boolean) : [],
        externalUrl: form.externalUrl.trim(),
        description: form.description.trim() || undefined,
        isPinned:    form.isPinned,
      };

      const url    = editingId ? `${API_BASE}/external-jobs/admin/${editingId}` : `${API_BASE}/external-jobs/admin`;
      const method = editingId ? "PATCH" : "POST";
      const res    = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to save");
      }

      closeModal();
      await fetchJobs();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm("Delete this job link? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE}/external-jobs/admin/${jobId}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete");
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleToggle = async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE}/external-jobs/admin/${jobId}/toggle`, {
        method: "PATCH", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to toggle status");
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle status");
    }
  };

  const handlePin = async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE}/external-jobs/admin/${jobId}/pin`, {
        method: "PATCH", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to toggle pin");
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle pin");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 sm:px-6 pt-6 pb-12 md:px-8 md:pt-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">External Job Links</h1>
            <p className="text-sm text-muted-foreground">
              Add job links from external sites — visible to employers in job browse
            </p>
          </div>
          <Button
            onClick={openAdd}
            className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2 min-h-[44px] px-4 rounded-xl shrink-0"
          >
            <Plus size={18} />
            Add Job Link
          </Button>
        </div>

        {/* Stats */}
        {!loading && jobs.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard label="Total Links" value={stats.total} />
            <StatCard label="Active"      value={stats.active} accent="text-green-400" />
            <StatCard label="Pinned"      value={stats.pinned} accent="text-amber-500" />
          </div>
        )}

        {/* Page-level error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 hover:text-red-300 transition-colors">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Loading…
          </div>

        ) : jobs.length === 0 ? (
          /* Empty state */
          <div className="flex items-center justify-center py-16">
            <div className="text-center border-2 border-dashed border-border rounded-2xl p-12">
              <ExternalLink size={32} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground font-medium mb-1">No external job links yet</p>
              <p className="text-sm text-muted-foreground">Click Add Job Link to add your first listing</p>
            </div>
          </div>

        ) : (
          /* Table */
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {["Title", "Company", "Location", "Type", "Salary", "Source", "Status", "Views", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-muted-foreground text-left whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map(job => (
                  <tr key={job.id} className="hover:bg-muted/30 transition-colors">

                    {/* Title */}
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        {job.isPinned && <Pin size={12} className="text-amber-500 shrink-0" />}
                        <span className="text-foreground font-medium truncate">{job.title}</span>
                      </div>
                    </td>

                    {/* Company */}
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">{job.company}</td>

                    {/* Location */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{job.location}</td>

                    {/* Type */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{job.jobType}</td>

                    {/* Salary */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtSalary(job)}</td>

                    {/* Source */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{job.source || "—"}</td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {job.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          Hidden
                        </span>
                      )}
                    </td>

                    {/* Views */}
                    <td className="px-4 py-3 text-muted-foreground">{job.views}</td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => window.open(job.externalUrl, "_blank")}
                          className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          title="Open URL"
                        >
                          <ExternalLink size={15} />
                        </button>
                        <button
                          onClick={() => handlePin(job.id)}
                          className={`p-1.5 hover:bg-muted rounded-lg transition-colors ${job.isPinned ? "text-amber-500 hover:text-amber-400" : "text-muted-foreground hover:text-amber-500"}`}
                          title={job.isPinned ? "Unpin" : "Pin to top"}
                        >
                          {job.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
                        </button>
                        <button
                          onClick={() => handleToggle(job.id)}
                          className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          title={job.isActive ? "Hide" : "Show"}
                        >
                          {job.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                        <button
                          onClick={() => openEdit(job)}
                          className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={closeModal}
        >
          <div
            className="bg-background rounded-2xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editingId ? "Edit Job Link" : "Add Job Link"}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {/* Form-level error */}
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Title */}
                <div>
                  <label className={labelCls}>Job Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g., Senior React Developer"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Company */}
                <div>
                  <label className={labelCls}>Company *</label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={e => setForm({ ...form, company: e.target.value })}
                    placeholder="e.g., Acme Corp"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Location */}
                <div>
                  <label className={labelCls}>Location *</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g., London, UK"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Country */}
                <div>
                  <label className={labelCls}>Country</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={e => setForm({ ...form, country: e.target.value })}
                    placeholder="e.g., United Kingdom"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Source */}
                <div>
                  <label className={labelCls}>Source</label>
                  <input
                    type="text"
                    value={form.source}
                    onChange={e => setForm({ ...form, source: e.target.value })}
                    placeholder="e.g., LinkedIn"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Job Type */}
                <div>
                  <label className={labelCls}>Job Type</label>
                  <select
                    value={form.jobType}
                    onChange={e => setForm({ ...form, jobType: e.target.value })}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  >
                    <option>Full-time</option>
                    <option>Part-time</option>
                    <option>Contract</option>
                    <option>Temporary</option>
                    <option>Freelance</option>
                  </select>
                </div>

                {/* Salary Min */}
                <div>
                  <label className={labelCls}>Salary Min</label>
                  <input
                    type="number"
                    value={form.salaryMin}
                    onChange={e => setForm({ ...form, salaryMin: e.target.value })}
                    placeholder="e.g., 50000"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Salary Max */}
                <div>
                  <label className={labelCls}>Salary Max</label>
                  <input
                    type="number"
                    value={form.salaryMax}
                    onChange={e => setForm({ ...form, salaryMax: e.target.value })}
                    placeholder="e.g., 100000"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className={labelCls}>Currency</label>
                  <select
                    value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="ALL">ALL — Albanian Lek</option>
                    <option value="CAD">CAD — Canadian Dollar</option>
                    <option value="AUD">AUD — Australian Dollar</option>
                    <option value="CHF">CHF — Swiss Franc</option>
                  </select>
                </div>

                {/* Skills */}
                <div className="sm:col-span-2">
                  <label className={labelCls}>
                    Skills{" "}
                    <span className="text-muted-foreground font-normal normal-case tracking-normal">
                      (comma-separated)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.skills}
                    onChange={e => setForm({ ...form, skills: e.target.value })}
                    placeholder="e.g., React, Node.js, TypeScript"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                </div>
              </div>

              {/* External URL */}
              <div>
                <label className={labelCls}>External URL *</label>
                <input
                  type="url"
                  value={form.externalUrl}
                  onChange={e => setForm({ ...form, externalUrl: e.target.value })}
                  placeholder="https://..."
                  className={inputCls}
                  style={{ fontSize: "16px" }}
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of the role..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 resize-none"
                  style={{ fontSize: "16px" }}
                />
              </div>

              {/* Pin */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={e => setForm({ ...form, isPinned: e.target.checked })}
                  className="w-4 h-4 rounded border border-border bg-background cursor-pointer accent-amber-600"
                />
                <span className="text-sm text-foreground">Pin to top of job listings</span>
              </label>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 h-11 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Saving…" : editingId ? "Save Changes" : "Add Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
