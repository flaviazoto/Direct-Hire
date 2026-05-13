"use client";
// frontend/src/app/(app)/admin/external-jobs/page.tsx
// Admin — External Job Links Management

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Eye, EyeOff, Pencil, Pin, Plus, Trash2 } from "lucide-react";
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
  skills: "",
  externalUrl: "",
  description: "",
  isPinned: false,
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ExternalJobsAdminPage() {
  const [jobs, setJobs] = useState<ExternalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

  // ── Fetch Jobs ─────────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("dh_token");
      const res = await fetch(`${API_BASE}/external-jobs/admin`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("Failed to fetch jobs");
      const resData = await res.json();
      setJobs(resData.data?.jobs || resData.jobs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ── Form Handlers ──────────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  };

  const handleOpenEdit = (job: ExternalJob) => {
    setEditingId(job.id);
    setForm({
      title: job.title,
      company: job.company,
      location: job.location,
      country: job.country,
      source: job.source || "",
      jobType: job.jobType,
      salaryMin: job.salaryMin ? String(job.salaryMin) : "",
      salaryMax: job.salaryMax ? String(job.salaryMax) : "",
      skills: job.skills.join(", "),
      externalUrl: job.externalUrl,
      description: job.description || "",
      isPinned: job.isPinned,
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(INITIAL_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Validation
      if (!form.title.trim() || !form.company.trim() || !form.location.trim() || !form.externalUrl.trim()) {
        setError("Please fill in all required fields");
        setSubmitting(false);
        return;
      }

      try {
        new URL(form.externalUrl);
      } catch {
        setError("Invalid URL format");
        setSubmitting(false);
        return;
      }

      const token = localStorage.getItem("dh_token");
      const payload = {
        title: form.title.trim(),
        company: form.company.trim(),
        location: form.location.trim(),
        country: form.country.trim(),
        source: form.source.trim() || undefined,
        jobType: form.jobType,
        salaryMin: form.salaryMin ? parseInt(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? parseInt(form.salaryMax) : undefined,
        skills: form.skills ? form.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
        externalUrl: form.externalUrl.trim(),
        description: form.description.trim() || undefined,
        isPinned: form.isPinned,
      };

      const method = editingId ? "PATCH" : "POST";
      const url = editingId ? `${API_BASE}/external-jobs/admin/${editingId}` : `${API_BASE}/external-jobs/admin`;

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const resData = await res.json();
        throw new Error(resData.error || "Failed to save job");
      }

      setError(null);
      handleCloseModal();
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save job");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this job link?")) return;

    try {
      const token = localStorage.getItem("dh_token");
      const res = await fetch(`${API_BASE}/external-jobs/admin/${jobId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("Failed to delete job");
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete job");
    }
  };

  const handleToggle = async (jobId: string) => {
    try {
      const token = localStorage.getItem("dh_token");
      const res = await fetch(`${API_BASE}/external-jobs/admin/${jobId}/toggle`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("Failed to toggle job status");
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle job status");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 sm:px-6 pt-6 pb-12 md:px-8 md:pt-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">External Job Links</h1>
            <p className="text-sm text-muted-foreground">
              Add job links from external websites — visible to employers in job browse
            </p>
          </div>
          <Button
            onClick={handleOpenAdd}
            className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2 min-h-[44px] px-4 rounded-xl"
          >
            <Plus size={20} />
            Add Job Link
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
        ) : jobs.length === 0 ? (
          /* Empty State */
          <div className="flex items-center justify-center py-12">
            <div className="text-center border-2 border-dashed border-border rounded-2xl p-12">
              <p className="text-foreground font-medium mb-2">No external job links yet</p>
              <p className="text-sm text-muted-foreground">Click Add Job Link to add your first listing</p>
            </div>
          </div>
        ) : (
          /* Table */
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-foreground text-left">
                    Title
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-foreground text-left">
                    Company
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-foreground text-left">
                    Location
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-foreground text-left">
                    Source
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-foreground text-left">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-foreground text-left">
                    Views
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-foreground text-left">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground flex items-center gap-2">
                      {job.isPinned && <Pin size={16} className="text-amber-600 flex-shrink-0" />}
                      <span>{job.title}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{job.company}</td>
                    <td className="px-4 py-3 text-foreground">{job.location}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.source || "—"}</td>
                    <td className="px-4 py-3">
                      {job.isActive ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{job.views}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* Open URL */}
                        <button
                          onClick={() => window.open(job.externalUrl, "_blank")}
                          className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          title="Open URL"
                        >
                          <ExternalLink size={20} />
                        </button>

                        {/* Toggle Active */}
                        <button
                          onClick={() => handleToggle(job.id)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          title={job.isActive ? "Hide" : "Show"}
                        >
                          {job.isActive ? <Eye size={20} /> : <EyeOff size={20} />}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => handleOpenEdit(job)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil size={20} />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={20} />
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background rounded-2xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            {/* Modal Header */}
            <h2 className="text-xl font-bold text-foreground mb-6">
              {editingId ? "Edit Job Link" : "Add Job Link"}
            </h2>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 2-column grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Job Title */}
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g., Senior React Developer"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Company */}
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Company *
                  </label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="e.g., Acme Corp"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Location *
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g., London, UK"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Country */}
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Country
                  </label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    placeholder="e.g., United Kingdom"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Source */}
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Source
                  </label>
                  <input
                    type="text"
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    placeholder="e.g., LinkedIn"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Job Type */}
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Job Type
                  </label>
                  <select
                    value={form.jobType}
                    onChange={(e) => setForm({ ...form, jobType: e.target.value })}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
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
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Salary Min
                  </label>
                  <input
                    type="number"
                    value={form.salaryMin}
                    onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                    placeholder="e.g., 50000"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Salary Max */}
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Salary Max
                  </label>
                  <input
                    type="number"
                    value={form.salaryMax}
                    onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
                    placeholder="e.g., 100000"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                    style={{ fontSize: "16px" }}
                  />
                </div>

                {/* Skills */}
                <div className="sm:col-span-2">
                  <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                    Skills
                  </label>
                  <input
                    type="text"
                    value={form.skills}
                    onChange={(e) => setForm({ ...form, skills: e.target.value })}
                    placeholder="e.g., React, Node.js, TypeScript"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                    style={{ fontSize: "16px" }}
                  />
                </div>
              </div>

              {/* External URL */}
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                  External URL *
                </label>
                <input
                  type="url"
                  value={form.externalUrl}
                  onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                  style={{ fontSize: "16px" }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-foreground mb-2 block">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Job description..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                  style={{ fontSize: "16px" }}
                />
              </div>

              {/* Pin Checkbox */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isPinned"
                  checked={form.isPinned}
                  onChange={(e) => setForm({ ...form, isPinned: e.target.checked })}
                  className="w-4 h-4 rounded border border-border bg-background cursor-pointer accent-amber-600"
                />
                <label htmlFor="isPinned" className="text-sm text-foreground cursor-pointer">
                  Pin to top of job listings
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 h-11 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Saving..." : editingId ? "Save" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
