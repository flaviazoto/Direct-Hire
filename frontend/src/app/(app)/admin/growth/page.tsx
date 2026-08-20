"use client";
// src/app/(app)/admin/growth/page.tsx
// Growth/Marketing agent task log — admin dashboard shell. Lists
// GrowthAgentTask rows, lets an admin approve/reject ones awaiting review,
// and can kick off either of the two agents built so far — the read-only
// Technical SEO Agent (no input needed) and the Content Agent (needs a
// jobPostId, picked from an inline panel below) — both via the same
// POST /admin/growth/tasks/run. Structure mirrors admin/email-logs/page.tsx.

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { LoadingPage, ErrorState, EmptyState } from "@/components/ui";
import { C, pill } from "@/lib/admin-theme";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

type GrowthTaskStatus =
  | "PENDING" | "IN_PROGRESS" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "COMPLETED" | "FAILED";

interface GrowthAgentTask {
  id:              string;
  agentName:       string;
  taskType:        string;
  status:          GrowthTaskStatus;
  summary?:        string | null;
  outputData?:     unknown;
  errorMessage?:   string | null;
  approvedBy?:     string | null;
  approvedAt?:     string | null;
  rejectedAt?:     string | null;
  rejectionReason?: string | null;
  createdAt:       string;
  updatedAt:       string;
}

interface TasksPage {
  success:    boolean;
  data:       GrowthAgentTask[];
  total:      number;
  totalPages: number;
  error?:     string;
}

interface EligibleJob {
  id:       string;
  title:    string;
  category: string;
  country:  string;
}

interface EligibleEmployer {
  id:                 string;
  companyName:        string | null;
  industry:           string | null;
  country:            string | null;
  subscriptionStatus: string | null;
}

interface GrowthContentDraft {
  id:              string;
  contentType:     string;
  title:           string;
  slug:            string;
  body:            string;
  metaTitle:       string | null;
  metaDescription: string | null;
  targetKeyword:   string | null;
  sourceTaskId:    string | null;
  status:          GrowthTaskStatus;
  publishedAt:     string | null;
  createdAt:       string;
  updatedAt:       string;
}

interface ContentPage {
  success:    boolean;
  data:       GrowthContentDraft[];
  total:      number;
  totalPages: number;
  error?:     string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function truncate(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_VALUES: GrowthTaskStatus[] = [
  "PENDING", "IN_PROGRESS", "AWAITING_APPROVAL", "APPROVED", "REJECTED", "COMPLETED", "FAILED",
];

const PAGE_SIZE = 25;

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

function KpiCard({ label, value, icon, accent }: {
  label: string; value: string | number; icon: string; accent: string;
}) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
        <div style={{
          width: 36, height: 36, borderRadius: 7,
          background: accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>{icon}</div>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontWeight: 800, fontSize: 28,
        color: C.text, lineHeight: 1,
      }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: GrowthTaskStatus }) {
  const cfg: Record<GrowthTaskStatus, { color: string; bg: string; border: string }> = {
    PENDING:            { color: C.muted,   bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.25)" },
    IN_PROGRESS:        { color: C.blue,    bg: "rgba(37,99,235,0.12)",   border: "rgba(37,99,235,0.25)"   },
    AWAITING_APPROVAL:  { color: C.accent,  bg: "rgba(224,176,32,0.12)",  border: "rgba(224,176,32,0.3)"   },
    APPROVED:           { color: C.success, bg: "rgba(22,163,74,0.12)",   border: "rgba(22,163,74,0.25)"   },
    REJECTED:           { color: C.danger,  bg: "rgba(220,38,38,0.12)",   border: "rgba(220,38,38,0.25)"   },
    COMPLETED:          { color: C.teal,    bg: "rgba(45,212,191,0.12)",  border: "rgba(45,212,191,0.25)"  },
    FAILED:             { color: C.danger,  bg: "rgba(220,38,38,0.12)",   border: "rgba(220,38,38,0.25)"   },
  };
  const c = cfg[status] ?? { color: C.muted, bg: "rgba(255,255,255,0.06)", border: C.border };
  return <span style={pill(c.color, c.bg, c.border)}>{status.replace(/_/g, " ")}</span>;
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminGrowthPage() {
  const [counts,   setCounts]   = useState<Partial<Record<GrowthTaskStatus, number>>>({});
  const [tasks,    setTasks]    = useState<GrowthAgentTask[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const [filterStatus, setFilterStatus] = useState("");
  const [agentInput,    setAgentInput]    = useState("");
  const [agentName,     setAgentName]     = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runningAudit, setRunningAudit] = useState(false);
  const [runningSnapshot, setRunningSnapshot] = useState(false);

  const [showGenerator, setShowGenerator] = useState(false);
  const [eligibleJobs, setEligibleJobs] = useState<EligibleJob[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [generating, setGenerating] = useState(false);

  const [showReengagement, setShowReengagement] = useState(false);
  const [eligibleEmployers, setEligibleEmployers] = useState<EligibleEmployer[]>([]);
  const [eligibleEmployersLoading, setEligibleEmployersLoading] = useState(false);
  const [selectedEmployerId, setSelectedEmployerId] = useState("");
  const [draftingReengagement, setDraftingReengagement] = useState(false);

  // ── Content drafts tab (GrowthContentDraft — separate from the task log
  // above; a task's AWAITING_APPROVAL/APPROVED status is about the AGENT
  // RUN, this is about the ARTICLE it produced, which needs its own
  // Level-1 human-gated publish step — see admin-growth.controller.ts) ────
  const [activeTab, setActiveTab] = useState<"tasks" | "content">("tasks");
  const [drafts,        setDrafts]        = useState<GrowthContentDraft[]>([]);
  const [draftsTotal,   setDraftsTotal]   = useState(0);
  const [draftsPage,    setDraftsPage]    = useState(1);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsFetching, setDraftsFetching] = useState(false);
  const [draftsError,   setDraftsError]   = useState<string | null>(null);
  const [draftsStatusFilter, setDraftsStatusFilter] = useState("");
  const [draftsTypeFilter,   setDraftsTypeFilter]   = useState("");
  const [publishingId,   setPublishingId]   = useState<string | null>(null);
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);
  const [expandedDraft,  setExpandedDraft]  = useState<string | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadCounts = useCallback(() => {
    Promise.all(
      STATUS_VALUES.map(s =>
        adminApi.getGrowthTasks({ status: s, limit: "1" })
          .then(res => [s, (res as unknown as TasksPage).total ?? 0] as const)
          .catch(() => [s, 0] as const),
      ),
    ).then(pairs => setCounts(Object.fromEntries(pairs)));
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const loadTasks = useCallback(() => {
    setFetching(true);
    setError(null);
    const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
    if (filterStatus) params.status    = filterStatus;
    if (agentName)    params.agentName = agentName;

    adminApi.getGrowthTasks(params)
      .then(res => {
        const r = res as unknown as TasksPage;
        if (r.success) {
          setTasks(r.data ?? []);
          setTotal(r.total ?? 0);
        } else {
          setError(r.error ?? "Could not load growth tasks.");
        }
      })
      .catch(() => setError("Network error - check your connection."))
      .finally(() => { setLoading(false); setFetching(false); });
  }, [page, filterStatus, agentName]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const loadDrafts = useCallback(() => {
    setDraftsFetching(true);
    setDraftsError(null);
    const params: Record<string, string> = { page: String(draftsPage), limit: String(PAGE_SIZE) };
    if (draftsStatusFilter) params.status      = draftsStatusFilter;
    if (draftsTypeFilter)   params.contentType = draftsTypeFilter;

    adminApi.getGrowthContentDrafts(params)
      .then(res => {
        const r = res as unknown as ContentPage;
        if (r.success) {
          setDrafts(r.data ?? []);
          setDraftsTotal((res as unknown as { total?: number }).total ?? 0);
        } else {
          setDraftsError(r.error ?? "Could not load content drafts.");
        }
      })
      .catch(() => setDraftsError("Network error - check your connection."))
      .finally(() => { setDraftsLoading(false); setDraftsFetching(false); });
  }, [draftsPage, draftsStatusFilter, draftsTypeFilter]);

  useEffect(() => { if (activeTab === "content") loadDrafts(); }, [activeTab, loadDrafts]);

  async function handlePublish(id: string) {
    setPublishingId(id);
    try {
      const res = await adminApi.publishGrowthContentDraft(id);
      if (res.success) { showToast("Content published"); loadDrafts(); }
      else showToast(res.error ?? "Publish failed", false);
    } catch {
      showToast("Network error - publish failed", false);
    } finally {
      setPublishingId(null);
    }
  }

  async function handleUnpublish(id: string) {
    setUnpublishingId(id);
    try {
      const res = await adminApi.unpublishGrowthContentDraft(id);
      if (res.success) { showToast("Content unpublished"); loadDrafts(); }
      else showToast(res.error ?? "Unpublish failed", false);
    } catch {
      showToast("Network error - unpublish failed", false);
    } finally {
      setUnpublishingId(null);
    }
  }

  function handleAgentInput(val: string) {
    setAgentInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setAgentName(val); setPage(1); }, 400);
  }

  function applyStatusFilter(status: string) {
    setFilterStatus(status);
    setPage(1);
  }

  function clearFilters() {
    setFilterStatus("");
    setAgentInput(""); setAgentName("");
    setPage(1);
  }

  async function handleApprove(id: string) {
    setActingId(id);
    try {
      const res = await adminApi.approveGrowthTask(id);
      if (res.success) {
        showToast("Task approved");
        loadTasks();
        loadCounts();
      } else {
        showToast(res.error ?? "Approve failed", false);
      }
    } catch {
      showToast("Network error - approve failed", false);
    } finally {
      setActingId(null);
    }
  }

  async function runAudit() {
    setRunningAudit(true);
    try {
      const res = await adminApi.runGrowthTask({ agentName: "technical-seo-agent", taskType: "seo-audit" });
      if (res.success) {
        showToast("Technical SEO audit started");
        setPage(1);
        loadTasks();
        loadCounts();
      } else {
        showToast(res.error ?? "Could not start audit", false);
      }
    } catch {
      showToast("Network error - could not start audit", false);
    } finally {
      setRunningAudit(false);
    }
  }

  async function runAnalyticsSnapshot() {
    setRunningSnapshot(true);
    try {
      const res = await adminApi.runGrowthTask({ agentName: "analytics-agent", taskType: "weekly-snapshot" });
      if (res.success) {
        showToast("Weekly analytics snapshot started");
        setPage(1);
        loadTasks();
        loadCounts();
      } else {
        showToast(res.error ?? "Could not start snapshot", false);
      }
    } catch {
      showToast("Network error - could not start snapshot", false);
    } finally {
      setRunningSnapshot(false);
    }
  }

  function openGenerator() {
    setShowGenerator(true);
    setSelectedJobId("");
    setEligibleLoading(true);
    adminApi.getEligibleJobs()
      .then(res => {
        if (res.success) setEligibleJobs((res.data as EligibleJob[]) ?? []);
        else showToast(res.error ?? "Could not load eligible jobs", false);
      })
      .catch(() => showToast("Network error - could not load eligible jobs", false))
      .finally(() => setEligibleLoading(false));
  }

  async function generateDraft() {
    if (!selectedJobId) return;
    setGenerating(true);
    try {
      const res = await adminApi.runGrowthTask({
        agentName: "content-agent",
        taskType:  "career-guide",
        inputData: { jobPostId: selectedJobId },
      });
      if (res.success) {
        showToast("Career guide draft generation started");
        setShowGenerator(false);
        setPage(1);
        loadTasks();
        loadCounts();
      } else {
        showToast(res.error ?? "Could not start generation", false);
      }
    } catch {
      showToast("Network error - could not start generation", false);
    } finally {
      setGenerating(false);
    }
  }

  function openReengagement() {
    setShowReengagement(true);
    setSelectedEmployerId("");
    setEligibleEmployersLoading(true);
    adminApi.getEligibleEmployers()
      .then(res => {
        if (res.success) setEligibleEmployers((res.data as EligibleEmployer[]) ?? []);
        else showToast(res.error ?? "Could not load eligible employers", false);
      })
      .catch(() => showToast("Network error - could not load eligible employers", false))
      .finally(() => setEligibleEmployersLoading(false));
  }

  async function draftReengagement() {
    if (!selectedEmployerId) return;
    setDraftingReengagement(true);
    try {
      const res = await adminApi.runGrowthTask({
        agentName: "employer-reengagement-agent",
        taskType:  "employer-reengagement",
        inputData: { employerProfileId: selectedEmployerId },
      });
      if (res.success) {
        showToast("Re-engagement email draft started");
        setShowReengagement(false);
        setPage(1);
        loadTasks();
        loadCounts();
      } else {
        showToast(res.error ?? "Could not start draft", false);
      }
    } catch {
      showToast("Network error - could not start draft", false);
    } finally {
      setDraftingReengagement(false);
    }
  }

  async function handleReject(id: string) {
    if (rejectReason.trim().length === 0) return;
    setActingId(id);
    try {
      const res = await adminApi.rejectGrowthTask(id, rejectReason.trim());
      if (res.success) {
        showToast("Task rejected");
        setRejectingId(null);
        setRejectReason("");
        loadTasks();
        loadCounts();
      } else {
        showToast(res.error ?? "Reject failed", false);
      }
    } catch {
      showToast("Network error - reject failed", false);
    } finally {
      setActingId(null);
    }
  }

  if (loading) return <LoadingPage color="violet" />;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = filterStatus || agentName;

  const selectStyle = {
    padding: "7px 12px", borderRadius: 7,
    border: `1px solid ${C.border}`,
    background: C.inputBg,
    fontSize: 13, outline: "none", cursor: "pointer",
  };

  const inputStyle = {
    padding: "7px 12px", borderRadius: 7,
    border: `1px solid ${C.border}`,
    background: C.inputBg, color: C.text,
    fontSize: 13, outline: "none",
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1280, margin: "0 auto", fontFamily: "var(--font-body)" }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" as const }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.accent}, #a78bfa)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, boxShadow: "0 4px 18px rgba(167,139,250,0.3)", flexShrink: 0,
          }}>🚀</div>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: C.text, margin: 0 }}>
              Growth Agents
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              Task log &amp; approval queue
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
          <button
            onClick={runAudit}
            disabled={runningAudit}
            style={{
              padding: "10px 20px", borderRadius: 10, background: C.accent, border: "none",
              color: "#fff", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" as const,
              cursor: runningAudit ? "default" : "pointer", opacity: runningAudit ? 0.6 : 1,
            }}
          >
            {runningAudit ? "Starting…" : "Run Technical SEO Audit"}
          </button>
          <button
            onClick={() => (showGenerator ? setShowGenerator(false) : openGenerator())}
            style={{
              padding: "10px 20px", borderRadius: 10,
              background: showGenerator ? "rgba(255,255,255,0.06)" : C.accent,
              border: showGenerator ? `1px solid ${C.border}` : "none",
              color: showGenerator ? C.text : "#fff", fontSize: 14, fontWeight: 700,
              whiteSpace: "nowrap" as const, cursor: "pointer",
            }}
          >
            {showGenerator ? "Cancel" : "Generate Career Guide Draft"}
          </button>
          <button
            onClick={runAnalyticsSnapshot}
            disabled={runningSnapshot}
            style={{
              padding: "10px 20px", borderRadius: 10, background: C.accent, border: "none",
              color: "#fff", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" as const,
              cursor: runningSnapshot ? "default" : "pointer", opacity: runningSnapshot ? 0.6 : 1,
            }}
          >
            {runningSnapshot ? "Starting…" : "Run Weekly Analytics Snapshot"}
          </button>
          <button
            onClick={() => (showReengagement ? setShowReengagement(false) : openReengagement())}
            style={{
              padding: "10px 20px", borderRadius: 10,
              background: showReengagement ? "rgba(255,255,255,0.06)" : C.accent,
              border: showReengagement ? `1px solid ${C.border}` : "none",
              color: showReengagement ? C.text : "#fff", fontSize: 14, fontWeight: 700,
              whiteSpace: "nowrap" as const, cursor: "pointer",
            }}
          >
            {showReengagement ? "Cancel" : "Draft Employer Re-engagement Email"}
          </button>
        </div>
      </div>

      {/* ── Tab toggle: task log vs. content drafts ─────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: C.card, padding: 4, borderRadius: 10, border: `1px solid ${C.border}`, width: "fit-content" }}>
        {([
          { key: "tasks" as const,   label: "Tasks" },
          { key: "content" as const, label: "Content Drafts" },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              background: activeTab === t.key ? C.accent : "transparent",
              color: activeTab === t.key ? "#fff" : C.muted,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "tasks" && (
      <>
      {/* ── Career guide generator panel ──────────────────────────────────────── */}
      {showGenerator && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: 20, marginBottom: 20, display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            Generate a career-guide draft from an approved job post
          </div>
          {eligibleLoading ? (
            <div style={{ fontSize: 13, color: C.muted }}>Loading eligible jobs…</div>
          ) : eligibleJobs.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted }}>No APPROVED job posts available to generate from.</div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" }}>
              <select
                value={selectedJobId}
                onChange={e => setSelectedJobId(e.target.value)}
                style={{ ...selectStyle, minWidth: 320, color: selectedJobId ? C.text : C.muted }}
              >
                <option value="">Select a job…</option>
                {eligibleJobs.map(j => (
                  <option key={j.id} value={j.id}>{j.title} — {j.category}, {j.country}</option>
                ))}
              </select>
              <button
                onClick={generateDraft}
                disabled={!selectedJobId || generating}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: !selectedJobId || generating ? "rgba(224,176,32,0.3)" : C.accent,
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: !selectedJobId || generating ? "default" : "pointer",
                }}
              >
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Employer re-engagement picker panel ───────────────────────────────── */}
      {showReengagement && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: 20, marginBottom: 20, display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            Draft a re-engagement email for a lapsed employer
          </div>
          {eligibleEmployersLoading ? (
            <div style={{ fontSize: 13, color: C.muted }}>Loading eligible employers…</div>
          ) : eligibleEmployers.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted }}>No inactive employers available to draft outreach for.</div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" }}>
              <select
                value={selectedEmployerId}
                onChange={e => setSelectedEmployerId(e.target.value)}
                style={{ ...selectStyle, minWidth: 320, color: selectedEmployerId ? C.text : C.muted }}
              >
                <option value="">Select an employer…</option>
                {eligibleEmployers.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.companyName ?? "Unnamed company"} — {emp.industry ?? "unknown industry"}, {emp.country ?? "unknown country"}</option>
                ))}
              </select>
              <button
                onClick={draftReengagement}
                disabled={!selectedEmployerId || draftingReengagement}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: !selectedEmployerId || draftingReengagement ? "rgba(224,176,32,0.3)" : C.accent,
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: !selectedEmployerId || draftingReengagement ? "default" : "pointer",
                }}
              >
                {draftingReengagement ? "Drafting…" : "Draft Email"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Stat cards ───────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 28 }}>
        <KpiCard label="Awaiting approval" value={counts.AWAITING_APPROVAL ?? "—"} icon="⏳" accent="rgba(224,176,32,0.15)" />
        <KpiCard label="In progress"       value={counts.IN_PROGRESS ?? "—"}       icon="⚙️" accent="rgba(37,99,235,0.15)"  />
        <KpiCard label="Completed"         value={counts.COMPLETED ?? "—"}         icon="✅" accent="rgba(22,163,74,0.15)"  />
        <KpiCard label="Failed"            value={counts.FAILED ?? "—"}            icon="❌" accent="rgba(220,38,38,0.15)" />
        <KpiCard label="Total"             value={total}                          icon="📋" accent="rgba(167,139,250,0.15)" />
      </div>

      {/* ── Task table ───────────────────────────────────────────────────────── */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, overflow: "hidden",
      }}>

        {/* Filter bar */}
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const,
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C.text, margin: 0, flexShrink: 0 }}>
            Tasks
          </h2>
          <span style={{ fontSize: 12, color: C.muted, marginRight: "auto" }}>
            {total.toLocaleString()} total
          </span>

          <input
            type="text"
            placeholder="Filter by agent name…"
            value={agentInput}
            onChange={e => handleAgentInput(e.target.value)}
            style={{ ...inputStyle, width: 200 }}
          />

          <select
            value={filterStatus}
            onChange={e => applyStatusFilter(e.target.value)}
            style={{ ...selectStyle, color: filterStatus ? C.text : C.muted }}
          >
            <option value="">All Statuses</option>
            {STATUS_VALUES.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: "7px 12px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: "transparent", color: C.muted,
                fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" as const,
              }}
            >Clear ×</button>
          )}
        </div>

        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "160px 1fr 170px 110px 90px",
          padding: "9px 20px",
          background: "rgba(255,255,255,0.02)",
          borderBottom: `1px solid ${C.border}`,
        }}>
          {["Agent", "Task Type", "Status / Actions", "Created", ""].map(h => (
            <span key={h} style={{
              fontSize: 11, fontWeight: 700, color: C.muted,
              textTransform: "uppercase" as const, letterSpacing: "0.06em",
            }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {fetching ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ padding: "24px" }}>
            <ErrorState message={error} retry={loadTasks} title="Could not load growth tasks" />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon="🚀"
            title={hasFilters ? "No tasks match these filters" : "No growth agent tasks yet"}
            description={hasFilters ? undefined : "Tasks will appear here once a growth agent is registered and starts running."}
          />
        ) : tasks.map(task => (
          <div key={task.id}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr 170px 110px 90px",
              padding: "13px 20px", alignItems: "center",
              borderBottom: expanded === task.id ? "none" : `1px solid ${C.border}`,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {task.agentName}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {task.taskType}
              </div>
              {task.status === "COMPLETED" && task.summary && (
                <div title={task.summary} style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {truncate(task.summary)}
                </div>
              )}
            </div>

            <div>
              <StatusPill status={task.status} />

              {task.status === "AWAITING_APPROVAL" && rejectingId !== task.id && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => handleApprove(task.id)}
                    disabled={actingId === task.id}
                    style={{
                      padding: "4px 10px", borderRadius: 6,
                      border: `1px solid ${C.success}`,
                      background: "rgba(22,163,74,0.12)", color: C.success,
                      fontSize: 11, fontWeight: 700, cursor: actingId === task.id ? "default" : "pointer",
                    }}
                  >Approve</button>
                  <button
                    onClick={() => { setRejectingId(task.id); setRejectReason(""); }}
                    disabled={actingId === task.id}
                    style={{
                      padding: "4px 10px", borderRadius: 6,
                      border: `1px solid ${C.danger}`,
                      background: "rgba(220,38,38,0.12)", color: C.danger,
                      fontSize: 11, fontWeight: 700, cursor: actingId === task.id ? "default" : "pointer",
                    }}
                  >Reject</button>
                </div>
              )}

              {rejectingId === task.id && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, maxWidth: 220 }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Rejection reason…"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    style={{ ...inputStyle, fontSize: 12, padding: "5px 8px" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => handleReject(task.id)}
                      disabled={actingId === task.id || rejectReason.trim().length === 0}
                      style={{
                        padding: "4px 10px", borderRadius: 6,
                        border: `1px solid ${C.danger}`,
                        background: "rgba(220,38,38,0.12)", color: C.danger,
                        fontSize: 11, fontWeight: 700,
                        cursor: actingId === task.id || rejectReason.trim().length === 0 ? "default" : "pointer",
                        opacity: rejectReason.trim().length === 0 ? 0.5 : 1,
                      }}
                    >Confirm reject</button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectReason(""); }}
                      style={{
                        padding: "4px 10px", borderRadius: 6,
                        border: `1px solid ${C.border}`,
                        background: "transparent", color: C.muted,
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}
                    >Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
              {timeAgo(task.createdAt)}
            </span>

            {task.status === "COMPLETED" ? (
              <button
                onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontSize: 12, fontWeight: 600, color: C.accent, textAlign: "left" as const,
                }}
              >
                {expanded === task.id ? "Hide details" : "View details"}
              </button>
            ) : (
              <Link
                href={`/admin/growth/${task.id}`}
                style={{ fontSize: 12, fontWeight: 600, color: C.accent, textDecoration: "none" }}
              >
                View
              </Link>
            )}
          </div>

          {expanded === task.id && (
            <div style={{
              padding: "0 20px 16px", borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ background: "#060606", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", overflowX: "auto" }}>
                <pre style={{ fontSize: 11, fontFamily: "monospace", color: "#a5f3fc", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {task.outputData ? JSON.stringify(task.outputData, null, 2) : "No output data recorded for this task."}
                </pre>
              </div>
            </div>
          )}
          </div>
        ))}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: "14px 20px", borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end",
          }}>
            <span style={{ fontSize: 12, color: C.muted, marginRight: "auto" }}>
              Page {page} of {totalPages} · {total.toLocaleString()} tasks
            </span>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              style={{
                padding: "6px 14px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: page <= 1 ? "transparent" : "rgba(255,255,255,0.04)",
                color: page <= 1 ? C.muted : C.text,
                fontSize: 13, fontWeight: 600,
                cursor: page <= 1 ? "default" : "pointer",
              }}
            >← Prev</button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              style={{
                padding: "6px 14px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: page >= totalPages ? "transparent" : "rgba(255,255,255,0.04)",
                color: page >= totalPages ? C.muted : C.text,
                fontSize: 13, fontWeight: 600,
                cursor: page >= totalPages ? "default" : "pointer",
              }}
            >Next →</button>
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === "content" && (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>

        {/* Filter bar */}
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const,
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C.text, margin: 0, flexShrink: 0 }}>
            Content Drafts
          </h2>
          <span style={{ fontSize: 12, color: C.muted, marginRight: "auto" }}>
            {draftsTotal.toLocaleString()} total
          </span>

          <input
            type="text"
            placeholder="Filter by content type…"
            value={draftsTypeFilter}
            onChange={e => { setDraftsTypeFilter(e.target.value); setDraftsPage(1); }}
            style={{ ...inputStyle, width: 200 }}
          />

          <select
            value={draftsStatusFilter}
            onChange={e => { setDraftsStatusFilter(e.target.value); setDraftsPage(1); }}
            style={{ ...selectStyle, color: draftsStatusFilter ? C.text : C.muted }}
          >
            <option value="">All Statuses</option>
            {STATUS_VALUES.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>

          {(draftsStatusFilter || draftsTypeFilter) && (
            <button
              onClick={() => { setDraftsStatusFilter(""); setDraftsTypeFilter(""); setDraftsPage(1); }}
              style={{
                padding: "7px 12px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: "transparent", color: C.muted,
                fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" as const,
              }}
            >Clear ×</button>
          )}
        </div>

        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 140px 150px 130px 210px",
          padding: "9px 20px",
          background: "rgba(255,255,255,0.02)",
          borderBottom: `1px solid ${C.border}`,
        }}>
          {["Title", "Content Type", "Status", "Updated", "Actions"].map(h => (
            <span key={h} style={{
              fontSize: 11, fontWeight: 700, color: C.muted,
              textTransform: "uppercase" as const, letterSpacing: "0.06em",
            }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {draftsLoading || draftsFetching ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
            Loading…
          </div>
        ) : draftsError ? (
          <div style={{ padding: "24px" }}>
            <ErrorState message={draftsError} retry={loadDrafts} title="Could not load content drafts" />
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon="📝"
            title={draftsStatusFilter || draftsTypeFilter ? "No drafts match these filters" : "No content drafts yet"}
            description={draftsStatusFilter || draftsTypeFilter ? undefined : "Drafts appear here once the Content Agent generates one — see the Tasks tab."}
          />
        ) : drafts.map(draft => {
          const canPublish   = draft.status === "APPROVED" && draft.publishedAt === null;
          const canUnpublish = draft.publishedAt !== null;
          return (
            <div key={draft.id}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 150px 130px 210px",
                  padding: "13px 20px", alignItems: "center",
                  borderBottom: expandedDraft === draft.id ? "none" : `1px solid ${C.border}`,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {draft.title}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    /{draft.slug}
                  </div>
                </div>

                <div style={{ fontSize: 13, color: C.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {draft.contentType}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  <StatusPill status={draft.status} />
                  {draft.publishedAt && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.success }}>● Live</span>
                  )}
                </div>

                <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                  {timeAgo(draft.updatedAt)}
                </span>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                  {canPublish && (
                    <button
                      onClick={() => handlePublish(draft.id)}
                      disabled={publishingId === draft.id}
                      style={{
                        padding: "4px 10px", borderRadius: 6,
                        border: `1px solid ${C.success}`,
                        background: "rgba(22,163,74,0.12)", color: C.success,
                        fontSize: 11, fontWeight: 700, cursor: publishingId === draft.id ? "default" : "pointer",
                      }}
                    >{publishingId === draft.id ? "Publishing…" : "Publish"}</button>
                  )}
                  {canUnpublish && (
                    <button
                      onClick={() => handleUnpublish(draft.id)}
                      disabled={unpublishingId === draft.id}
                      style={{
                        padding: "4px 10px", borderRadius: 6,
                        border: `1px solid ${C.danger}`,
                        background: "rgba(220,38,38,0.12)", color: C.danger,
                        fontSize: 11, fontWeight: 700, cursor: unpublishingId === draft.id ? "default" : "pointer",
                      }}
                    >{unpublishingId === draft.id ? "Unpublishing…" : "Unpublish"}</button>
                  )}
                  <button
                    onClick={() => setExpandedDraft(expandedDraft === draft.id ? null : draft.id)}
                    style={{
                      background: "none", border: "none", padding: "4px 2px", cursor: "pointer",
                      fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: "inherit",
                    }}
                  >
                    {expandedDraft === draft.id ? "Hide" : "View"}
                  </button>
                </div>
              </div>

              {expandedDraft === draft.id && (
                <div style={{ padding: "0 20px 16px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ background: "#060606", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", maxHeight: 320, overflowY: "auto" }}>
                    {draft.metaTitle && (
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                        <strong style={{ color: C.secondary }}>Meta title:</strong> {draft.metaTitle}
                      </div>
                    )}
                    {draft.metaDescription && (
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                        <strong style={{ color: C.secondary }}>Meta description:</strong> {draft.metaDescription}
                      </div>
                    )}
                    <pre style={{ fontSize: 12, fontFamily: "inherit", color: "#e4e4e7", margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {draft.body}
                    </pre>
                  </div>
                  {draft.publishedAt && (
                    <a
                      href={`/blog/${draft.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 600, color: C.accent, textDecoration: "none" }}
                    >
                      View live on the blog ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Pagination */}
        {Math.ceil(draftsTotal / PAGE_SIZE) > 1 && (
          <div style={{
            padding: "14px 20px", borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end",
          }}>
            <span style={{ fontSize: 12, color: C.muted, marginRight: "auto" }}>
              Page {draftsPage} of {Math.ceil(draftsTotal / PAGE_SIZE)} · {draftsTotal.toLocaleString()} drafts
            </span>
            <button
              disabled={draftsPage <= 1}
              onClick={() => setDraftsPage(p => p - 1)}
              style={{
                padding: "6px 14px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: draftsPage <= 1 ? "transparent" : "rgba(255,255,255,0.04)",
                color: draftsPage <= 1 ? C.muted : C.text,
                fontSize: 13, fontWeight: 600,
                cursor: draftsPage <= 1 ? "default" : "pointer",
              }}
            >← Prev</button>
            <button
              disabled={draftsPage >= Math.ceil(draftsTotal / PAGE_SIZE)}
              onClick={() => setDraftsPage(p => p + 1)}
              style={{
                padding: "6px 14px", borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: draftsPage >= Math.ceil(draftsTotal / PAGE_SIZE) ? "transparent" : "rgba(255,255,255,0.04)",
                color: draftsPage >= Math.ceil(draftsTotal / PAGE_SIZE) ? C.muted : C.text,
                fontSize: 13, fontWeight: 600,
                cursor: draftsPage >= Math.ceil(draftsTotal / PAGE_SIZE) ? "default" : "pointer",
              }}
            >Next →</button>
          </div>
        )}
      </div>
      )}

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
