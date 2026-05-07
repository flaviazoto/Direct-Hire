"use client";

import type React from "react";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData, LoadingPage } from "@/components/ui";
import { C, inputStyle } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

type SubmissionStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "NEEDS_CHANGES" | "PENDING_REVIEW" | string;

interface Submission {
  userId:             string;
  email:              string;
  role:               string;
  name:               string;
  onboardingStatus:   SubmissionStatus;
  completionPct:      number;
  submittedAt:        string | null;
  verificationStatus: string;
  riskScore?:         number;
  country?:           string;
  industry?:          string;
}

interface UploadRecord {
  id:           string;
  fileType:     string;
  fileName:     string;
  fileUrl:      string;
  signedUrl?:   string;
  mimeType:     string;
  sizeBytes:    number;
  status:       string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewNotes?: string | null;
  reviewedAt?:  string | null;
  uploadedAt:   string;
}

interface WorkerProfile {
  firstName?: string; lastName?: string; dateOfBirth?: string;
  nationality?: string; countryOfResidence?: string; city?: string;
  profession?: string; yearsExperience?: string; expectedSalary?: string;
  maritalStatus?: string; numberOfChildren?: number;
  trustScore?: number; riskScore?: number; passportNumber?: string;
  skills?: { skill: string }[];
  languages?: { language: string; proficiencyLevel: string }[];
  targetCountries?: { country: string }[];
}

interface EmployerProfile {
  companyName?: string; contactPersonName?: string; industry?: string;
  companySize?: string; website?: string; country?: string; city?: string;
  businessDescription?: string; nipt?: string;
  requiredSkills?: { skill: string }[];
  hiringCountries?: { country: string }[];
}

interface UserDetail {
  user:         { id: string; email: string; role: string; status: string; isEmailVerified: boolean; createdAt: string };
  profile:      WorkerProfile | EmployerProfile | null;
  uploads:      UploadRecord[];
  onboarding:   { onboardingStatus: string; completedSteps: number[]; totalSteps: number } | null;
  verification: { reviewStatus: string; adminNotes?: string; changesRequested?: string } | null;
}

interface ReviewModal {
  userId:   string;
  decision: "APPROVED" | "REJECTED" | "NEEDS_CHANGES";
}

// ── Status badge config ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  SUBMITTED:      { color: C.blue,    bg: "rgba(0,144,255,0.12)"   },
  APPROVED:       { color: C.green,   bg: "rgba(34,197,94,0.12)"   },
  REJECTED:       { color: C.accent,  bg: "rgba(220,38,38,0.12)"   },
  NEEDS_CHANGES:  { color: C.yellow,  bg: "rgba(245,158,11,0.12)"  },
  PENDING_REVIEW: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
};

// ── File type labels ───────────────────────────────────────────────────────────

const FILE_LABELS: Record<string, string> = {
  PROFILE_PHOTO:       "Profile Photo",
  WORK_VIDEO:          "Work Video",
  INTRO_VIDEO:         "Introduction Video",
  MEDICAL_CERTIFICATE: "Medical Certificate",
  BUSINESS_DOCUMENT:   "Business Document",
  COMPANY_LOGO:        "Company Logo",
};

// ── MediaViewer ────────────────────────────────────────────────────────────────

function MediaViewer({ upload }: { upload: UploadRecord }) {
  const url     = upload.signedUrl ?? upload.fileUrl;
  if (!url) return null;
  const isVideo = upload.mimeType.startsWith("video/");
  const isImage = upload.mimeType.startsWith("image/");
  const isPdf   = upload.mimeType === "application/pdf";
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, background: "#0a0a0a" }}>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.secondary }}>{FILE_LABELS[upload.fileType] ?? upload.fileType}</span>
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.blue, textDecoration: "none", fontWeight: 500 }}>Open ↗</a>
      </div>
      {isVideo && <video src={url} controls style={{ width: "100%", maxHeight: 280, background: "#000", display: "block" }} preload="metadata" />}
      {isImage && <img src={url} alt={upload.fileName} style={{ width: "100%", maxHeight: 280, objectFit: "contain", background: "#0a0a0a", display: "block" }} loading="lazy" />}
      {isPdf   && <embed src={url} type="application/pdf" style={{ width: "100%", height: 320, display: "block" }} />}
    </div>
  );
}

// ── DetailField ────────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${C.border}`, gap: 16 }}>
      <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.secondary, textAlign: "right", wordBreak: "break-word", maxWidth: "60%" }}>{String(value)}</span>
    </div>
  );
}

// ── SlideOverPanel ─────────────────────────────────────────────────────────────

function SlideOverPanel({
  userId, onClose, onReview,
}: {
  userId:   string;
  onClose:  () => void;
  onReview: (decision: "APPROVED" | "REJECTED" | "NEEDS_CHANGES") => void;
}) {
  const [detail, setDetail]           = useState<UserDetail | null>(null);
  const [loading, setLoading]         = useState(true);
  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getUserDetail(userId).then((res) => {
      if (res.success) setDetail(res.data as UserDetail);
      setLoading(false);
    });
  }, [userId]);

  const handleDocumentReview = async (uploadId: string, decision: "PENDING" | "APPROVED" | "REJECTED") => {
    setReviewingDocId(uploadId);
    const res = await adminApi.reviewDocument(uploadId, { decision });
    setReviewingDocId(null);
    if (!res.success) return;
    const updated = res.data as { id: string; reviewStatus: "PENDING" | "APPROVED" | "REJECTED"; reviewNotes?: string | null; reviewedAt?: string | null };
    setDetail((prev) => {
      if (!prev) return prev;
      return { ...prev, uploads: prev.uploads.map(u => u.id === updated.id ? { ...u, reviewStatus: updated.reviewStatus, reviewNotes: updated.reviewNotes ?? null, reviewedAt: updated.reviewedAt ?? null } : u) };
    });
  };

  const wp = detail?.user.role === "WORKER"   ? detail.profile as WorkerProfile   : null;
  const ep = detail?.user.role === "EMPLOYER" ? detail.profile as EmployerProfile : null;
  const fullName = wp
    ? [wp.firstName, wp.lastName].filter(Boolean).join(" ") || detail?.user.email
    : ep?.companyName ?? detail?.user.email;

  const profilePhoto = detail?.uploads.find(u => u.fileType === "PROFILE_PHOTO");
  const workVideo    = detail?.uploads.find(u => u.fileType === "WORK_VIDEO");
  const introVideo   = detail?.uploads.find(u => u.fileType === "INTRO_VIDEO");
  const medical      = detail?.uploads.find(u => u.fileType === "MEDICAL_CERTIFICATE");
  const bizDoc       = detail?.uploads.find(u => u.fileType === "BUSINESS_DOCUMENT");

  const completionPct = detail?.onboarding
    ? Math.round((detail.onboarding.completedSteps.length / detail.onboarding.totalSteps) * 100)
    : 0;

  const renderDocReviewControls = (upload: UploadRecord) => {
    const isApproved = upload.reviewStatus === "APPROVED";
    const isRejected = upload.reviewStatus === "REJECTED";
    const isPending  = upload.reviewStatus === "PENDING";
    const sBadgeColor = isApproved ? C.green : isRejected ? C.accent : C.yellow;
    const sBadgeBg    = isApproved ? "rgba(34,197,94,0.12)" : isRejected ? "rgba(220,38,38,0.12)" : "rgba(245,158,11,0.12)";
    const busy = reviewingDocId === upload.id;
    const db = (label: string, disabled: boolean, onClick: () => void, col: string, bg: string) => (
      <button disabled={busy || disabled} onClick={onClick} style={{ padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: (busy || disabled) ? "not-allowed" : "pointer", background: (busy || disabled) ? "rgba(255,255,255,0.04)" : bg, border: `1px solid ${(busy || disabled) ? C.border : `${col}50`}`, color: (busy || disabled) ? C.muted : col, fontFamily: "inherit" }}>
        {busy ? "…" : label}
      </button>
    );
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: sBadgeColor, background: sBadgeBg }}>
            {upload.reviewStatus}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {db("Approve", isApproved, () => handleDocumentReview(upload.id, "APPROVED"), C.teal,   "rgba(20,184,166,0.15)")}
            {db("Reject",  isRejected, () => handleDocumentReview(upload.id, "REJECTED"), C.accent, "rgba(220,38,38,0.15)")}
            {db("Pending", isPending,  () => handleDocumentReview(upload.id, "PENDING"),  C.muted,  "rgba(113,113,122,0.12)")}
          </div>
        </div>
        {upload.reviewNotes && <p style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>{upload.reviewNotes}</p>}
      </div>
    );
  };

  const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 };
  const onboardStatus = detail?.onboarding?.onboardingStatus ?? "";
  const onBadge = STATUS_BADGE[onboardStatus] ?? { color: C.muted, bg: "rgba(113,113,122,0.12)" };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", zIndex: 40 }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100%", width: 520, maxWidth: "100%", background: "#161616", borderLeft: `1px solid ${C.border}`, zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "-24px 0 60px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontWeight: 700, color: C.text, fontSize: 15 }}>Review Submission</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: C.muted }}>{detail?.user.email}</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontFamily: "inherit" }}>×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          {loading ? (
            <div style={{ padding: "80px 0", textAlign: "center", color: C.muted, fontSize: 14 }}>Loading…</div>
          ) : !detail ? (
            <p style={{ textAlign: "center", color: C.muted, paddingTop: 80, fontSize: 14 }}>Could not load details</p>
          ) : (
            <>
              {/* Identity */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                {profilePhoto ? (
                  <img src={profilePhoto.signedUrl ?? profilePhoto.fileUrl} alt={fullName} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.border}`, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: C.secondary, flexShrink: 0 }}>
                    {(fullName ?? "?")[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>{fullName}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{detail.user.email}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: detail.user.role === "WORKER" ? C.blue : C.teal, background: detail.user.role === "WORKER" ? "rgba(0,144,255,0.12)" : "rgba(20,184,166,0.12)" }}>{detail.user.role}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: onBadge.color, background: onBadge.bg }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: onBadge.color }} />
                      {onboardStatus.replace(/_/g, " ") || "Unknown"}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: C.muted, background: "rgba(255,255,255,0.07)" }}>{completionPct}% complete</span>
                    {wp?.riskScore !== undefined && (
                      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: wp.riskScore > 70 ? C.accent : wp.riskScore > 40 ? C.yellow : C.green, background: wp.riskScore > 70 ? "rgba(220,38,38,0.12)" : wp.riskScore > 40 ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)" }}>
                        Risk: {wp.riskScore}
                      </span>
                    )}
                    {wp?.trustScore !== undefined && (
                      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: C.blue, background: "rgba(0,144,255,0.12)" }}>Trust: {wp.trustScore}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Worker profile */}
              {wp && (
                <div>
                  <span style={sectionLabel}>Personal Details</span>
                  <DetailField label="Full Name"       value={[wp.firstName, wp.lastName].filter(Boolean).join(" ")} />
                  <DetailField label="Date of Birth"   value={wp.dateOfBirth ? new Date(wp.dateOfBirth).toLocaleDateString("en-GB") : null} />
                  <DetailField label="Nationality"     value={wp.nationality} />
                  <DetailField label="Country"         value={wp.countryOfResidence} />
                  <DetailField label="City"            value={wp.city} />
                  <DetailField label="Marital Status"  value={wp.maritalStatus} />
                  <DetailField label="Children"        value={wp.numberOfChildren} />
                  <DetailField label="Profession"      value={wp.profession} />
                  <DetailField label="Experience"      value={wp.yearsExperience ? `${wp.yearsExperience} years` : null} />
                  <DetailField label="Expected Salary" value={wp.expectedSalary} />
                  {wp.passportNumber && <DetailField label="Passport" value={`${wp.passportNumber.slice(0, 3)}****${wp.passportNumber.slice(-2)}`} />}
                </div>
              )}

              {/* Employer profile */}
              {ep && (
                <div>
                  <span style={sectionLabel}>Company Details</span>
                  <DetailField label="Company Name"   value={ep.companyName} />
                  <DetailField label="Contact Person" value={ep.contactPersonName} />
                  <DetailField label="Industry"       value={ep.industry} />
                  <DetailField label="Company Size"   value={ep.companySize} />
                  <DetailField label="Website"        value={ep.website} />
                  <DetailField label="Country"        value={ep.country} />
                  <DetailField label="City"           value={ep.city} />
                  {ep.nipt && <DetailField label="NIPT" value={`${ep.nipt.slice(0, 3)}****`} />}
                </div>
              )}

              {/* Skills */}
              {wp?.skills && wp.skills.length > 0 && (
                <div>
                  <span style={sectionLabel}>Skills</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {wp.skills.map(s => (
                      <span key={s.skill} style={{ padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 500, color: C.blue, background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.2)" }}>
                        {s.skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Languages */}
              {wp?.languages && wp.languages.length > 0 && (
                <div>
                  <span style={sectionLabel}>Languages</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {wp.languages.map(l => (
                      <div key={l.language} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.secondary }}>{l.language}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, color: C.muted, background: "rgba(255,255,255,0.07)" }}>{l.proficiencyLevel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Target countries */}
              {wp?.targetCountries && wp.targetCountries.length > 0 && (
                <div>
                  <span style={sectionLabel}>Target Countries</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {wp.targetCountries.map(c => (
                      <span key={c.country} style={{ padding: "3px 10px", borderRadius: 99, fontSize: 12, color: C.secondary, background: "rgba(255,255,255,0.07)", border: `1px solid ${C.border}` }}>
                        🌍 {c.country}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Media */}
              {workVideo && <div><span style={sectionLabel}>Work Video</span><MediaViewer upload={workVideo} />{renderDocReviewControls(workVideo)}</div>}
              {introVideo && <div><span style={sectionLabel}>Introduction Video</span><MediaViewer upload={introVideo} />{renderDocReviewControls(introVideo)}</div>}
              {medical   && <div><span style={sectionLabel}>Medical Certificate</span><MediaViewer upload={medical} />{renderDocReviewControls(medical)}</div>}
              {bizDoc    && <div><span style={sectionLabel}>Business Document</span><MediaViewer upload={bizDoc} />{renderDocReviewControls(bizDoc)}</div>}

              {/* Previous notes */}
              {detail.verification?.adminNotes && (
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 6 }}>Previous Admin Notes</div>
                  <p style={{ fontSize: 12, color: "rgba(245,158,11,0.85)", lineHeight: 1.6, margin: 0 }}>{detail.verification.adminNotes}</p>
                </div>
              )}
              {detail.verification?.changesRequested && (
                <div style={{ background: "rgba(0,144,255,0.08)", border: "1px solid rgba(0,144,255,0.25)", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 6 }}>Changes Requested</div>
                  <p style={{ fontSize: 12, color: "rgba(0,144,255,0.85)", lineHeight: 1.6, margin: 0 }}>{detail.verification.changesRequested}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && detail && (
          <div style={{ flexShrink: 0, padding: "16px 24px", borderTop: `1px solid ${C.border}`, background: "#1a1a1a", display: "flex", gap: 8 }}>
            <button onClick={() => onReview("APPROVED")}      style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)", color: C.teal,   cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>✓ Approve</button>
            <button onClick={() => onReview("NEEDS_CHANGES")} style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: C.yellow, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>✏ Changes</button>
            <button onClick={() => onReview("REJECTED")}      style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.35)", color: C.accent, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>✕ Reject</button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main page content ──────────────────────────────────────────────────────────

function AdminApprovalsContent() {
  const searchParams = useSearchParams();
  const queryUserId  = searchParams.get("userId") ?? "";

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [statusFilter, setStatusFilter] = useState("SUBMITTED");
  const [roleFilter, setRoleFilter]   = useState("");
  const [search, setSearch]           = useState("");
  const [selectedUserId, setSelected] = useState<string | null>(null);
  const [modal, setModal]             = useState<ReviewModal | null>(null);
  const [notes, setNotes]             = useState("");
  const [changesReq, setChangesReq]   = useState("");
  const [reviewing, setReviewing]     = useState(false);
  const [toast, setToast]             = useState<ToastData>(null);

  const STATUS_OPTIONS = [
    { value: "SUBMITTED",     label: "Submitted" },
    { value: "APPROVED",      label: "Approved" },
    { value: "REJECTED",      label: "Rejected" },
    { value: "NEEDS_CHANGES", label: "Needs Changes" },
  ];
  const ROLE_OPTIONS = [
    { value: "WORKER",   label: "Workers" },
    { value: "EMPLOYER", label: "Employers" },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (statusFilter) params.status = statusFilter;
    if (roleFilter)   params.role   = roleFilter;
    if (search)       params.search = search;
    if (queryUserId)  params.userId = queryUserId;
    const res = await adminApi.getSubmissions(params);
    if (res.success) {
      setSubmissions((res.data as unknown as Submission[]) ?? []);
      setTotal((res as unknown as { total: number }).total ?? 0);
    }
    setLoading(false);
  }, [page, statusFilter, roleFilter, search, queryUserId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!queryUserId) return;
    setStatusFilter(""); setRoleFilter(""); setSearch(""); setPage(1);
    setSelected(queryUserId);
  }, [queryUserId]);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const openReview = (userId: string, decision: ReviewModal["decision"]) => {
    setModal({ userId, decision });
    setNotes("");
    setChangesReq("");
    setSelected(null);
  };

  const handleReview = async () => {
    if (!modal) return;
    setReviewing(true);
    const res = await adminApi.review({
      userId: modal.userId, decision: modal.decision,
      notes: notes || undefined, changesRequested: changesReq || undefined,
    });
    setReviewing(false);
    if (res.success) { showToast(`User ${modal.decision.toLowerCase()} successfully`, "ok"); setModal(null); load(); }
    else showToast(res.error ?? "Review could not be saved", "err");
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, width: "auto", minWidth: 150, cursor: "pointer" };
  const totalPages = Math.ceil(total / 20);
  const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
    background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
    color: disabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
    borderRadius: 8, padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13, fontFamily: "inherit",
  });

  const modalDecisionColor = (d: string) => d === "APPROVED" ? { color: C.teal, bg: "rgba(20,184,166,0.12)" } : d === "REJECTED" ? { color: C.accent, bg: "rgba(220,38,38,0.12)" } : { color: C.yellow, bg: "rgba(245,158,11,0.12)" };
  const modalDecisionLabel = (d: string) => d === "APPROVED" ? "✓ Approve" : d === "REJECTED" ? "✕ Reject" : "✏ Request Changes";

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Approval Queue</h1>
          <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14 }}>{total} submissions total</p>
        </div>
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.secondary, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>↻ Refresh</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && load()}
          placeholder="Search name or email…"
          style={{ ...inputStyle, width: 220 }}
        />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All roles</option>
          {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {["Name / Email", "Role", "Status", "Completion", "Submitted", "Risk", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: "64px 24px", textAlign: "center", color: C.muted, fontSize: 14 }}>Loading…</td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "64px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>📋</div>
                    <div style={{ color: C.muted, fontSize: 15 }}>No submissions found</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginTop: 6 }}>Try adjusting filters.</div>
                  </td>
                </tr>
              ) : submissions.map((sub, idx) => {
                const sBadge = STATUS_BADGE[sub.onboardingStatus] ?? { color: C.muted, bg: "rgba(113,113,122,0.12)" };
                const rColor = sub.role === "WORKER" ? C.blue : C.teal;
                const rBg    = sub.role === "WORKER" ? "rgba(0,144,255,0.12)" : "rgba(20,184,166,0.12)";
                return (
                  <tr
                    key={sub.userId}
                    style={{ borderBottom: idx < submissions.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    onClick={() => setSelected(sub.userId)}
                  >
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ fontWeight: 600, color: C.secondary, fontSize: 13 }}>{sub.name || sub.email}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub.email}</div>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: rColor, background: rBg }}>{sub.role}</span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: sBadge.color, background: sBadge.bg }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: sBadge.color }} />
                        {sub.onboardingStatus?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <div style={{ height: "100%", background: C.blue, borderRadius: 99, width: `${sub.completionPct}%` }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.secondary }}>{sub.completionPct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                      {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {sub.riskScore !== undefined
                        ? <span style={{ fontSize: 13, fontWeight: 700, color: sub.riskScore > 70 ? C.accent : sub.riskScore > 40 ? C.yellow : C.green }}>{sub.riskScore > 70 ? "⚠ " : ""}{sub.riskScore}</span>
                        : <span style={{ color: C.muted, fontSize: 13 }}>—</span>
                      }
                    </td>
                    <td style={{ padding: "14px 20px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => openReview(sub.userId, "APPROVED")}      style={{ padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "rgba(20,184,166,0.12)", border: "1px solid rgba(20,184,166,0.3)", color: C.teal,   fontFamily: "inherit" }}>✓ Approve</button>
                        <button onClick={() => openReview(sub.userId, "NEEDS_CHANGES")} style={{ padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "rgba(245,158,11,0.1)",   border: "1px solid rgba(245,158,11,0.3)", color: C.yellow, fontFamily: "inherit" }}>✏</button>
                        <button onClick={() => openReview(sub.userId, "REJECTED")}      style={{ padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "rgba(220,38,38,0.1)",    border: "1px solid rgba(220,38,38,0.3)",  color: C.accent, fontFamily: "inherit" }}>✕</button>
                        <button onClick={() => setSelected(sub.userId)}                  style={{ padding: "4px 8px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,0.05)",  border: `1px solid ${C.border}`,          color: C.secondary, fontFamily: "inherit" }}>View →</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>Previous</button>
          <span style={{ color: C.muted, fontSize: 13 }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pageBtnStyle(page >= totalPages)}>Next</button>
        </div>
      )}

      {/* Slide-over */}
      {selectedUserId && (
        <SlideOverPanel
          userId={selectedUserId}
          onClose={() => setSelected(null)}
          onReview={decision => openReview(selectedUserId, decision)}
        />
      )}

      {/* Review modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setModal(null)}>
          <div style={{ background: "#141414", border: `1px solid ${C.border}`, borderRadius: 18, width: "100%", maxWidth: 440, padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 99, fontSize: 12, fontWeight: 700, marginBottom: 18, color: modalDecisionColor(modal.decision).color, background: modalDecisionColor(modal.decision).bg }}>
              {modalDecisionLabel(modal.decision)}
            </div>

            {modal.decision === "NEEDS_CHANGES" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 8 }}>Changes Required</label>
                <textarea value={changesReq} onChange={e => setChangesReq(e.target.value)} rows={3} placeholder="Describe what needs to be updated…" style={{ ...inputStyle, resize: "vertical" as const }} />
              </div>
            )}

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 8 }}>
              {modal.decision === "REJECTED" ? "Reason for rejection *" : "Admin notes (optional)"}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder={modal.decision === "APPROVED" ? "Internal notes…" : "Reason for decision…"}
              style={{ ...inputStyle, resize: "vertical" as const }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
              <button
                onClick={handleReview}
                disabled={reviewing || (modal.decision === "REJECTED" && !notes) || (modal.decision === "NEEDS_CHANGES" && !changesReq)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 9, cursor: reviewing ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600, background: modalDecisionColor(modal.decision).bg, border: `1px solid ${modalDecisionColor(modal.decision).color}50`, color: modalDecisionColor(modal.decision).color }}
              >
                {reviewing ? "…" : `Confirm ${modal.decision.replace(/_/g, " ")}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page wrapper ───────────────────────────────────────────────────────────────

export default function AdminApprovalsPage() {
  return (
    <Suspense fallback={<LoadingPage color="amber" />}>
      <AdminApprovalsContent />
    </Suspense>
  );
}
