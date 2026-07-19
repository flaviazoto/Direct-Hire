"use client";
// src/app/(app)/admin/document-review/[id]/page.tsx

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { ErrorState } from "@/components/ui";

type DocStatus = "APPROVED" | "REJECTED" | "PENDING";

interface DocItem {
  id:           string;
  url:          string;
  reviewStatus: DocStatus;
  reviewNotes:  string | null;
  uploadedAt:   string;
}

interface WorkerDocData {
  userId:              string;
  email:               string;
  name:                string;
  accountStatus:       string;
  createdAt:           string;
  passportNumber:      string | null;
  passportStatus:      DocStatus;
  documentsVerified:   boolean;
  documentsReviewedAt: string | null;
  documentsReviewedBy: string | null;
  photo:               DocItem | null;
  video:               DocItem | null;
  allUploads:          { id: string; fileType: string; fileName: string; url: string; mimeType: string; status: string; reviewStatus: DocStatus; uploadedAt: string }[];
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    APPROVED: { label: "Approved", color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
    REJECTED: { label: "Rejected", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
    PENDING:  { label: "Pending",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
    NONE:     { label: "No file",  color: "#64748b", bg: "rgba(100,116,139,0.1)"  },
  };
  const c = cfg[status] ?? cfg.PENDING;
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px",
      borderRadius: 20, color: c.color, background: c.bg,
    }}>
      {c.label}
    </span>
  );
}

function DocStatusToggle({
  label, value, onChange, disabled,
}: { label: string; value: DocStatus; onChange: (v: DocStatus) => void; disabled?: boolean }) {
  const btn = (v: DocStatus, text: string, color: string, activeBg: string) => (
    <button
      onClick={() => !disabled && onChange(v)}
      style={{
        flex:        1,
        padding:     "8px 0",
        border:      value === v ? `2px solid ${color}` : "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        background:  value === v ? activeBg : "transparent",
        color:       value === v ? color : "#64748b",
        fontWeight:  value === v ? 700 : 400,
        fontSize:    13,
        cursor:      disabled ? "not-allowed" : "pointer",
        transition:  "all 0.1s",
        opacity:     disabled ? 0.6 : 1,
      }}
    >
      {text}
    </button>
  );
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {btn("APPROVED", "✓ Approve", "#34d399", "rgba(52,211,153,0.12)")}
        {btn("REJECTED", "✗ Reject",  "#f87171", "rgba(248,113,113,0.12)")}
        {btn("PENDING",  "― Pending", "#fbbf24", "rgba(251,191,36,0.12)")}
      </div>
    </div>
  );
}

export default function WorkerDocumentReviewPage() {
  const { id }         = useParams<{ id: string }>();
  const [data,         setData]         = useState<WorkerDocData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [errorMsg,     setErrorMsg]     = useState("");

  // Review state
  const [photoStatus,    setPhotoStatus]    = useState<DocStatus>("PENDING");
  const [videoStatus,    setVideoStatus]    = useState<DocStatus>("PENDING");
  const [passportStatus, setPassportStatus] = useState<DocStatus>("PENDING");
  const [notes,          setNotes]          = useState("");

  const loadDocuments = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    adminApi.getWorkerDocuments(id).then(res => {
      if (!res.success) { setLoadError(res.error ?? "Could not load worker documents."); setLoading(false); return; }
      const d = res.data as WorkerDocData;
      setData(d);
      setPhotoStatus(d.photo?.reviewStatus    ?? "PENDING");
      setVideoStatus(d.video?.reviewStatus    ?? "PENDING");
      setPassportStatus(d.passportStatus ?? "PENDING");
      setLoading(false);
    }).catch(() => {
      setLoadError("Network error - check your connection.");
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMsg("");
    const res = await adminApi.reviewWorkerDocuments(id, {
      photoStatus,
      videoStatus,
      passportStatus,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.success) {
      setErrorMsg((res as any).error ?? "Failed to submit review.");
      return;
    }
    setSuccess(true);
    // Reload data to reflect new statuses
    const updated = await adminApi.getWorkerDocuments(id);
    if (updated.success) setData(updated.data as WorkerDocData);
  }

  const s = {
    card: {
      background:   "rgba(255,255,255,0.03)",
      border:       "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding:      "24px 28px",
      marginBottom: 20,
    } as React.CSSProperties,
    sectionTitle: {
      fontSize: 15, fontWeight: 700, color: "#f1f5f9", margin: "0 0 16px",
    } as React.CSSProperties,
    label: {
      fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" as const,
      letterSpacing: "0.06em", marginBottom: 4,
    },
    value: {
      fontSize: 14, color: "#e2e8f0",
    },
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div style={{ width: 36, height: 36, border: "3px solid rgba(220,38,38,0.2)", borderTopColor: "#dc2626", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: 640, margin: "0 auto" }}>
        <ErrorState message={loadError} retry={loadDocuments} title="Could not load worker documents" />
      </div>
    );
  }

  if (!data) return null;

  const allApproved = photoStatus === "APPROVED" && videoStatus === "APPROVED" && passportStatus === "APPROVED";

  return (
    <div style={{ padding: "32px 40px", maxWidth: 820, margin: "0 auto" }}>

      {/* Back */}
      <Link href="/admin/document-review" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 20 }}>
        ← Back to document review
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", margin: 0 }}>{data.name}</h1>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{data.email} · Joined {fmtDate(data.createdAt)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data.documentsVerified && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 20, padding: "4px 12px" }}>
              ✓ Documents Verified
            </span>
          )}
          {data.documentsReviewedAt && (
            <span style={{ fontSize: 12, color: "#4b5563" }}>Last reviewed {fmtDate(data.documentsReviewedAt)}</span>
          )}
        </div>
      </div>

      {/* Success banner */}
      {success && (
        <div style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, fontSize: 14, color: "#34d399", fontWeight: 600 }}>
          {allApproved ? "✓ All documents approved — worker is now verified and visible to employers." : "Review submitted. Worker has been notified."}
        </div>
      )}

      {/* Profile photo */}
      <div style={s.card}>
        <h2 style={s.sectionTitle}>Profile photo</h2>
        {data.photo ? (
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flexShrink: 0 }}>
              <img
                src={data.photo.url}
                alt="Profile photo"
                style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div style={{ fontSize: 11, color: "#4b5563", marginTop: 6 }}>Uploaded {fmtDate(data.photo.uploadedAt)}</div>
              <div style={{ marginTop: 6 }}><StatusBadge status={data.photo.reviewStatus} /></div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <DocStatusToggle label="Photo decision" value={photoStatus} onChange={setPhotoStatus} disabled={submitting} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#4b5563" }}>No photo uploaded yet.</div>
        )}
      </div>

      {/* Video */}
      <div style={s.card}>
        <h2 style={s.sectionTitle}>Introduction video</h2>
        {data.video ? (
          <div>
            <div style={{ marginBottom: 14 }}>
              <video
                src={data.video.url}
                controls
                style={{ width: "100%", maxHeight: 320, borderRadius: 10, background: "#000", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "#4b5563" }}>Uploaded {fmtDate(data.video.uploadedAt)}</span>
                <StatusBadge status={data.video.reviewStatus} />
              </div>
            </div>
            <DocStatusToggle label="Video decision" value={videoStatus} onChange={setVideoStatus} disabled={submitting} />
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#4b5563" }}>No video uploaded yet.</div>
        )}
      </div>

      {/* Passport */}
      <div style={s.card}>
        <h2 style={s.sectionTitle}>Passport number</h2>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={s.label}>Passport number (decrypted)</div>
            <div style={{
              fontFamily: "monospace", fontSize: 18, fontWeight: 700,
              color: data.passportNumber ? "#f1f5f9" : "#4b5563",
              background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "12px 16px",
              marginTop: 6, letterSpacing: "0.12em",
            }}>
              {data.passportNumber ?? "Not provided"}
            </div>
            <div style={{ marginTop: 10 }}>
              <StatusBadge status={data.passportStatus} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <DocStatusToggle label="Passport decision" value={passportStatus} onChange={setPassportStatus} disabled={submitting} />
          </div>
        </div>
      </div>

      {/* Other uploads */}
      {data.allUploads.filter(u => u.fileType !== "PROFILE_PHOTO" && u.fileType !== "WORK_VIDEO" && u.fileType !== "INTRO_VIDEO").length > 0 && (
        <div style={s.card}>
          <h2 style={s.sectionTitle}>Other uploads</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.allUploads
              .filter(u => u.fileType !== "PROFILE_PHOTO" && u.fileType !== "WORK_VIDEO" && u.fileType !== "INTRO_VIDEO")
              .map(u => {
                const superseded = u.status === "SUPERSEDED";
                return (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,0,0,0.15)", borderRadius: 8, opacity: superseded ? 0.5 : 1 }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#e2e8f0" }}>{u.fileName}</div>
                      <div style={{ fontSize: 11, color: "#4b5563" }}>
                        {u.fileType.replace(/_/g, " ")} · {fmtDate(u.uploadedAt)}
                        {superseded && <span style={{ color: "#71717a" }}> · replaced by a newer upload</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {superseded
                        ? <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#71717a", background: "rgba(113,113,122,0.12)" }}>Superseded</span>
                        : <StatusBadge status={u.reviewStatus} />
                      }
                      <a href={u.url} target="_blank" rel="noopener noreferrer"
                         style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none" }}>View ↗</a>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Notes + Submit */}
      <div style={s.card}>
        <h2 style={s.sectionTitle}>Review notes (optional)</h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add a note for the worker explaining any rejections…"
          rows={3}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#e2e8f0",
            resize: "vertical", outline: "none", fontFamily: "inherit",
          }}
        />

        {errorMsg && (
          <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{errorMsg}</div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 20, alignItems: "center" }}>
          {allApproved && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "#34d399" }}>
              ✓ Submitting this will fully verify the worker
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              marginLeft: "auto",
              padding:    "10px 28px",
              borderRadius: 10,
              border:     "none",
              background: allApproved ? "#16a34a" : "#dc2626",
              color:      "#fff",
              fontSize:   14,
              fontWeight: 700,
              cursor:     submitting ? "not-allowed" : "pointer",
              opacity:    submitting ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {submitting ? "Submitting…" : allApproved ? "Approve all & verify worker" : "Submit review"}
          </button>
        </div>
      </div>
    </div>
  );
}
