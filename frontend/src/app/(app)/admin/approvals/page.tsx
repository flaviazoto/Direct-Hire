"use client";
// src/app/(app)/admin/approvals/page.tsx

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api-client";
import {
  LoadingPage, PageHeader, Card, CardContent, Badge, Button, Avatar,
  Input, SelectInput, Textarea, Spinner, Tag, Pagination,
  ToastDisplay, type ToastData, EmptyState,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

type SubmissionStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "NEEDS_CHANGES" | "PENDING_REVIEW" | string;

interface Submission {
  userId:           string;
  email:            string;
  role:             string;
  name:             string;
  onboardingStatus: SubmissionStatus;
  completionPct:    number;
  submittedAt:      string | null;
  verificationStatus: string;
  riskScore?:       number;
  country?:         string;
  industry?:        string;
}

interface UploadRecord {
  id:         string;
  fileType:   string;
  fileName:   string;
  fileUrl:    string;
  signedUrl?: string;
  mimeType:   string;
  sizeBytes:  number;
  status:     string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  uploadedAt: string;
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
  user: { id: string; email: string; role: string; status: string; isEmailVerified: boolean; createdAt: string };
  profile: WorkerProfile | EmployerProfile | null;
  uploads: UploadRecord[];
  onboarding: { onboardingStatus: string; completedSteps: number[]; totalSteps: number } | null;
  verification: { reviewStatus: string; adminNotes?: string; changesRequested?: string } | null;
}

interface ReviewModal {
  userId: string;
  decision: "APPROVED" | "REJECTED" | "NEEDS_CHANGES";
}

// ── Status styles ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED:      "blue",
  APPROVED:       "green",
  REJECTED:       "red",
  NEEDS_CHANGES:  "amber",
  PENDING_REVIEW: "purple",
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
  const url = upload.signedUrl ?? upload.fileUrl;
  if (!url) return null;

  const isVideo = upload.mimeType.startsWith("video/");
  const isImage = upload.mimeType.startsWith("image/");
  const isPdf   = upload.mimeType === "application/pdf";

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
      <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-slate-600">{FILE_LABELS[upload.fileType] ?? upload.fileType}</span>
        <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline font-medium">
          Open ↗
        </a>
      </div>
      {isVideo && (
        <video
          src={url}
          controls
          className="w-full max-h-[280px] bg-black"
          preload="metadata"
        />
      )}
      {isImage && (
        <img
          src={url}
          alt={upload.fileName}
          className="w-full max-h-[280px] object-contain bg-slate-100"
          loading="lazy"
        />
      )}
      {isPdf && (
        <embed
          src={url}
          type="application/pdf"
          className="w-full h-[320px]"
        />
      )}
    </div>
  );
}

// ── DetailField ────────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start py-2 border-b border-slate-50 last:border-0 gap-4">
      <span className="text-xs text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right break-words max-w-[60%]">{String(value)}</span>
    </div>
  );
}

// ── SlideOverPanel ─────────────────────────────────────────────────────────────

function SlideOverPanel({
  userId,
  onClose,
  onReview,
}: {
  userId: string;
  onClose: () => void;
  onReview: (decision: "APPROVED" | "REJECTED" | "NEEDS_CHANGES") => void;
}) {
  const [detail, setDetail]   = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getUserDetail(userId).then((res) => {
      if (res.success) setDetail(res.data as UserDetail);
      setLoading(false);
    });
  }, [userId]);

  const handleDocumentReview = async (
    uploadId: string,
    decision: "PENDING" | "APPROVED" | "REJECTED"
  ) => {
    setReviewingDocId(uploadId);
    const res = await adminApi.reviewDocument(uploadId, { decision });
    setReviewingDocId(null);

    if (!res.success) {
      return;
    }

    const updated = res.data as {
      id: string;
      reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
      reviewNotes?: string | null;
      reviewedAt?: string | null;
    };

    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        uploads: prev.uploads.map((u) =>
          u.id === updated.id
            ? {
                ...u,
                reviewStatus: updated.reviewStatus,
                reviewNotes: updated.reviewNotes ?? null,
                reviewedAt: updated.reviewedAt ?? null,
              }
            : u
        ),
      };
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
    const isPending = upload.reviewStatus === "PENDING";
    const isApproved = upload.reviewStatus === "APPROVED";
    const isRejected = upload.reviewStatus === "REJECTED";

    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={isApproved ? "green" : isRejected ? "red" : "amber"}>
            {upload.reviewStatus}
          </Badge>
          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="teal"
              disabled={reviewingDocId === upload.id || isApproved}
              loading={reviewingDocId === upload.id}
              onClick={() => handleDocumentReview(upload.id, "APPROVED")}
            >
              Approve
            </Button>
            <Button
              size="xs"
              variant="danger"
              disabled={reviewingDocId === upload.id || isRejected}
              loading={reviewingDocId === upload.id}
              onClick={() => handleDocumentReview(upload.id, "REJECTED")}
            >
              Reject
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={reviewingDocId === upload.id || isPending}
              loading={reviewingDocId === upload.id}
              onClick={() => handleDocumentReview(upload.id, "PENDING")}
            >
              Pending
            </Button>
          </div>
        </div>
        {upload.reviewNotes && (
          <p className="text-[11px] text-slate-500 leading-relaxed">{upload.reviewNotes}</p>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[2px] fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[520px] max-w-full bg-white shadow-2xl z-50 flex flex-col slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Review Submission</h2>
            <p className="text-xs text-slate-400 mt-0.5">{detail?.user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 text-lg transition-colors"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : !detail ? (
            <p className="text-center text-slate-400 py-20">Could not load details</p>
          ) : (
            <>
              {/* Identity block */}
              <div className="flex items-start gap-4">
                {profilePhoto ? (
                  <img
                    src={profilePhoto.signedUrl ?? profilePhoto.fileUrl}
                    alt={fullName}
                    className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md flex-shrink-0"
                  />
                ) : (
                  <Avatar name={fullName ?? "?"} size="xl" />
                )}
                <div>
                  <div className="font-bold text-slate-900 text-base">{fullName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{detail.user.email}</div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant={detail.user.role === "WORKER" ? "blue" : "teal"}>{detail.user.role}</Badge>
                    <Badge variant={STATUS_STYLES[detail.onboarding?.onboardingStatus ?? ""] ?? "slate"} dot>
                      {detail.onboarding?.onboardingStatus?.replace(/_/g, " ") ?? "Unknown"}
                    </Badge>
                    <Badge variant="slate">{completionPct}% complete</Badge>
                    {wp?.riskScore !== undefined && (
                      <Badge variant={wp.riskScore > 70 ? "red" : wp.riskScore > 40 ? "amber" : "green"}>
                        Risk: {wp.riskScore}
                      </Badge>
                    )}
                    {wp?.trustScore !== undefined && (
                      <Badge variant="blue">Trust: {wp.trustScore}</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Worker profile details */}
              {wp && (
                <div className="space-y-1">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Personal Details</h3>
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
                  {wp.passportNumber && (
                    <DetailField label="Passport" value={`${wp.passportNumber.slice(0, 3)}****${wp.passportNumber.slice(-2)}`} />
                  )}
                </div>
              )}

              {/* Employer profile details */}
              {ep && (
                <div className="space-y-1">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Company Details</h3>
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
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Skills</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {wp.skills.map(s => <Tag key={s.skill} variant="blue">{s.skill}</Tag>)}
                  </div>
                </div>
              )}

              {/* Languages */}
              {wp?.languages && wp.languages.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Languages</h3>
                  <div className="flex flex-wrap gap-2">
                    {wp.languages.map(l => (
                      <div key={l.language} className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-700">{l.language}</span>
                        <Badge variant="slate">{l.proficiencyLevel}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Target countries */}
              {wp?.targetCountries && wp.targetCountries.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Target Countries</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {wp.targetCountries.map(c => <Tag key={c.country}>🌍 {c.country}</Tag>)}
                  </div>
                </div>
              )}

              {/* Media files */}
              {workVideo && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Work Video</h3>
                  <MediaViewer upload={workVideo} />
                  {renderDocReviewControls(workVideo)}
                </div>
              )}
              {introVideo && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Introduction Video</h3>
                  <MediaViewer upload={introVideo} />
                  {renderDocReviewControls(introVideo)}
                </div>
              )}
              {medical && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Medical Certificate</h3>
                  <MediaViewer upload={medical} />
                  {renderDocReviewControls(medical)}
                </div>
              )}
              {bizDoc && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Business Document</h3>
                  <MediaViewer upload={bizDoc} />
                  {renderDocReviewControls(bizDoc)}
                </div>
              )}

              {/* Previous notes */}
              {detail.verification?.adminNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="text-xs font-bold text-amber-700 mb-1">Previous Admin Notes</div>
                  <p className="text-xs text-amber-800 leading-relaxed">{detail.verification.adminNotes}</p>
                </div>
              )}
              {detail.verification?.changesRequested && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="text-xs font-bold text-blue-700 mb-1">Changes Requested</div>
                  <p className="text-xs text-blue-800 leading-relaxed">{detail.verification.changesRequested}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action footer */}
        {!loading && detail && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex gap-2">
            <Button variant="teal"   size="sm" className="flex-1" onClick={() => onReview("APPROVED")}>✓ Approve</Button>
            <Button variant="amber"  size="sm" className="flex-1" onClick={() => onReview("NEEDS_CHANGES")}>✏ Changes</Button>
            <Button variant="danger" size="sm" className="flex-1" onClick={() => onReview("REJECTED")}>✕ Reject</Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function AdminApprovalsContent() {
  const searchParams = useSearchParams();
  const queryUserId = searchParams.get("userId") ?? "";
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
    setStatusFilter("");
    setRoleFilter("");
    setSearch("");
    setPage(1);
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
    setSelected(null); // close slide-over when opening modal
  };

  const handleReview = async () => {
    if (!modal) return;
    setReviewing(true);
    const res = await adminApi.review({
      userId:           modal.userId,
      decision:         modal.decision,
      notes:            notes || undefined,
      changesRequested: changesReq || undefined,
    });
    setReviewing(false);
    if (res.success) {
      showToast(`User ${modal.decision.toLowerCase()} successfully`, "ok");
      setModal(null);
      load();
    } else {
      showToast(res.error ?? "Review could not be saved", "err");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <ToastDisplay toast={toast} />

      <PageHeader
        title="Approval Queue"
        description={`${total} submissions total`}
        actions={<Button variant="outline" size="sm" onClick={load}>↻ Refresh</Button>}
      />

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && load()}
          placeholder="Search name or email…"
          className="w-56"
        />
        <SelectInput
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
          className="w-44"
        />
        <SelectInput
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          options={ROLE_OPTIONS}
          placeholder="All roles"
          className="w-40"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Name / Email", "Role", "Status", "Completion", "Submitted", "Risk", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-400">
                      <div className="flex justify-center"><Spinner size="md" /></div>
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16">
                      <EmptyState icon="📋" title="No submissions found" description="Try adjusting filters." />
                    </td>
                  </tr>
                ) : submissions.map(sub => (
                  <tr
                    key={sub.userId}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelected(sub.userId)}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 text-sm">{sub.name || sub.email}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{sub.email}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={sub.role === "WORKER" ? "blue" : "teal"}>{sub.role}</Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={STATUS_STYLES[sub.onboardingStatus] ?? "slate"} dot>
                        {sub.onboardingStatus?.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${sub.completionPct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700">{sub.completionPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {sub.submittedAt
                        ? new Date(sub.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {sub.riskScore !== undefined
                        ? <span className={`text-xs font-bold ${sub.riskScore > 70 ? "text-red-600" : sub.riskScore > 40 ? "text-amber-600" : "text-emerald-600"}`}>
                            {sub.riskScore > 70 ? "⚠ " : ""}{sub.riskScore}
                          </span>
                        : <span className="text-slate-300 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <Button size="xs" variant="teal"      onClick={() => openReview(sub.userId, "APPROVED")}>✓ Approve</Button>
                        <Button size="xs" variant="outline"   onClick={() => openReview(sub.userId, "NEEDS_CHANGES")}>✏</Button>
                        <Button size="xs" variant="danger"    onClick={() => openReview(sub.userId, "REJECTED")}>✕</Button>
                        <Button size="xs" variant="secondary" onClick={() => setSelected(sub.userId)}>View →</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Pagination page={page} total={total} pageSize={20} onChange={setPage} className="mt-6" />

      {/* Slide-over detail panel */}
      {selectedUserId && (
        <SlideOverPanel
          userId={selectedUserId}
          onClose={() => setSelected(null)}
          onReview={decision => openReview(selectedUserId, decision)}
        />
      )}

      {/* Review confirmation modal */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 fade-in"
          onClick={() => setModal(null)}
        >
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold mb-4 ${
                modal.decision === "APPROVED"      ? "bg-emerald-100 text-emerald-700" :
                modal.decision === "REJECTED"      ? "bg-red-100 text-red-700" :
                                                     "bg-amber-100 text-amber-700"
              }`}>
                {modal.decision === "APPROVED" ? "✓ Approve" : modal.decision === "REJECTED" ? "✕ Reject" : "✏ Request Changes"}
              </div>

              {modal.decision === "NEEDS_CHANGES" && (
                <div className="mb-4">
                  <Textarea
                    label="Changes Required"
                    value={changesReq}
                    onChange={e => setChangesReq(e.target.value)}
                    rows={3}
                    placeholder="Describe what needs to be updated…"
                  />
                </div>
              )}

              <Textarea
                label={modal.decision === "REJECTED" ? "Reason for rejection *" : "Admin notes (optional)"}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder={modal.decision === "APPROVED" ? "Internal notes…" : "Reason for decision…"}
              />

              <div className="flex gap-3 mt-5">
                <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>Cancel</Button>
                <Button
                  variant={modal.decision === "APPROVED" ? "teal" : modal.decision === "REJECTED" ? "danger" : "amber"}
                  className="flex-1"
                  loading={reviewing}
                  disabled={
                    (modal.decision === "REJECTED" && !notes) ||
                    (modal.decision === "NEEDS_CHANGES" && !changesReq)
                  }
                  onClick={handleReview}
                >
                  Confirm {modal.decision?.replace(/_/g, " ")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminApprovalsPage() {
  return (
    <Suspense fallback={<LoadingPage color="amber" />}>
      <AdminApprovalsContent />
    </Suspense>
  );
}
