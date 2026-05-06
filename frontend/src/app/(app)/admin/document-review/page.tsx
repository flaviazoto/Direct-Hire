"use client";
// src/app/(app)/admin/document-review/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";

interface WorkerRow {
  userId:              string;
  email:               string;
  name:                string;
  accountStatus:       string;
  createdAt:           string;
  documentsVerified:   boolean;
  documentsReviewedAt: string | null;
  photoStatus:         string;
  videoStatus:         string;
  passportStatus:      string;
  uploadCount:         number;
  overallStatus:       "VERIFIED" | "HAS_REJECTIONS" | "PENDING";
}

interface PagedResponse {
  success:    boolean;
  data:       WorkerRow[];
  total:      number;
  totalPages: number;
  page:       number;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string; border: string }> = {
    VERIFIED:       { label: "Verified",       color: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.25)"  },
    HAS_REJECTIONS: { label: "Has rejections", color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)" },
    PENDING:        { label: "Pending",        color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.25)"  },
    NONE:           { label: "No upload",      color: "#64748b", bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.2)"  },
    APPROVED:       { label: "Approved",       color: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.25)"  },
    REJECTED:       { label: "Rejected",       color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)" },
  };
  const c = cfg[status] ?? cfg.PENDING;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      color: c.color, background: c.bg, border: `1px solid ${c.border}`,
    }}>
      {c.label}
    </span>
  );
}

export default function DocumentReviewPage() {
  const router = useRouter();
  const [tab,        setTab]        = useState<"pending" | "all">("pending");
  const [rows,       setRows]       = useState<WorkerRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);

  async function load(p: number, t: "pending" | "all") {
    setLoading(true);
    const res = await adminApi.getPendingDocumentWorkers({ page: String(p), limit: "20", tab: t });
    if (!res.success) { router.push("/login"); return; }
    const d = res as unknown as PagedResponse;
    setRows(d.data ?? []);
    setTotalPages(d.totalPages ?? 1);
    setTotal(d.total ?? 0);
    setLoading(false);
  }

  useEffect(() => { load(page, tab); }, [page, tab]);

  function switchTab(t: "pending" | "all") {
    setTab(t);
    setPage(1);
  }

  const tabStyle = (active: boolean) => ({
    padding:      "8px 20px",
    borderRadius: 8,
    border:       `1px solid ${active ? "rgba(220,38,38,0.4)" : "rgba(255,255,255,0.08)"}`,
    background:   active ? "rgba(220,38,38,0.12)" : "transparent",
    color:        active ? "#fca5a5" : "#64748b",
    fontSize:     13,
    fontWeight:   600,
    cursor:       "pointer",
  });

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", margin: 0 }}>Document Review</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
          Review and approve worker documents before they become visible to employers.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button style={tabStyle(tab === "pending")} onClick={() => switchTab("pending")}>
          Pending review
        </button>
        <button style={tabStyle(tab === "all")} onClick={() => switchTab("all")}>
          All workers
        </button>
        {!loading && (
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#4b5563", alignSelf: "center" }}>
            {total} worker{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
          <div style={{ width: 32, height: 32, border: "3px solid rgba(220,38,38,0.2)", borderTopColor: "#dc2626", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: "#4b5563" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
            {tab === "pending" ? "No pending documents" : "No workers found"}
          </div>
          <div style={{ fontSize: 13 }}>
            {tab === "pending" ? "All workers' documents have been reviewed." : "No workers in the system yet."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(row => (
            <Link
              key={row.userId}
              href={`/admin/document-review/${row.userId}`}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                display:      "grid",
                gridTemplateColumns: "1fr 120px 80px 80px 80px 90px 90px",
                gap:          12,
                alignItems:   "center",
                padding:      "14px 18px",
                background:   row.overallStatus === "PENDING" ? "rgba(251,191,36,0.04)" : "rgba(255,255,255,0.02)",
                border:       `1px solid ${
                  row.overallStatus === "VERIFIED"       ? "rgba(52,211,153,0.15)"  :
                  row.overallStatus === "HAS_REJECTIONS" ? "rgba(248,113,113,0.2)"  :
                                                           "rgba(251,191,36,0.15)"
                }`,
                borderRadius: 12,
                transition:   "border-color 0.15s, background 0.15s",
                cursor:       "pointer",
              }}
              onMouseOver={e => { e.currentTarget.style.background = "rgba(220,38,38,0.06)"; e.currentTarget.style.borderColor = "rgba(220,38,38,0.3)"; }}
              onMouseOut={e  => {
                e.currentTarget.style.background  = row.overallStatus === "PENDING" ? "rgba(251,191,36,0.04)" : "rgba(255,255,255,0.02)";
                e.currentTarget.style.borderColor = row.overallStatus === "VERIFIED" ? "rgba(52,211,153,0.15)" : row.overallStatus === "HAS_REJECTIONS" ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.15)";
              }}
              >
                {/* Name + email */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{row.email}</div>
                </div>

                {/* Overall */}
                <StatusBadge status={row.overallStatus} />

                {/* Photo */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 3 }}>Photo</div>
                  <StatusBadge status={row.photoStatus} />
                </div>

                {/* Video */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 3 }}>Video</div>
                  <StatusBadge status={row.videoStatus} />
                </div>

                {/* Passport */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 3 }}>Passport</div>
                  <StatusBadge status={row.passportStatus} />
                </div>

                {/* Uploads count */}
                <div style={{ textAlign: "center", fontSize: 12, color: "#64748b" }}>
                  {row.uploadCount} file{row.uploadCount !== 1 ? "s" : ""}
                </div>

                {/* Submitted */}
                <div style={{ fontSize: 11, color: "#4b5563", textAlign: "right" }}>
                  {timeAgo(row.createdAt)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 24 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: page === 1 ? "#374151" : "#94a3b8", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 13 }}
          >
            ← Prev
          </button>
          <span style={{ padding: "6px 14px", fontSize: 13, color: "#64748b" }}>{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: page === totalPages ? "#374151" : "#94a3b8", cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: 13 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
