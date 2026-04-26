"use client";
// src/app/(app)/admin/users/pending/page.tsx

import { useEffect, useState, useMemo, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import {
  PageHeader, Card, CardContent, Badge, Button, Avatar,
  Input, Textarea, Spinner, ToastDisplay, type ToastData, EmptyState,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PendingUser {
  id:                       string;
  email:                    string;
  role:                     "WORKER" | "EMPLOYER";
  accountStatus:            string;
  verificationSubmittedAt:  string | null;
  createdAt:                string;
  name:                     string | null;
  companyName:              string | null;
}

interface AuditEntry {
  id:        string;
  action:    string;
  notes:     string | null;
  createdAt: string;
  adminName: string | null;
}

interface WorkerProfile {
  firstName?: string; lastName?: string; dateOfBirth?: string;
  nationality?: string; countryOfResidence?: string; city?: string;
  profession?: string; yearsExperience?: string; expectedSalary?: string;
  maritalStatus?: string; numberOfChildren?: number;
  passportNumber?: string;
  skills?: { skill: string }[];
  languages?: { language: string; proficiencyLevel: string }[];
  targetCountries?: { country: string }[];
}

interface EmployerProfile {
  companyName?: string; contactPersonName?: string; industry?: string;
  companySize?: string; website?: string; country?: string; city?: string;
  businessDescription?: string; nipt?: string;
}

interface UserDetail {
  id:                      string;
  email:                   string;
  role:                    string;
  accountStatus:           string;
  verificationSubmittedAt: string | null;
  approvedAt:              string | null;
  rejectedAt:              string | null;
  rejectionReason:         string | null;
  suspendedAt:             string | null;
  createdAt:               string;
  profile:                 WorkerProfile | EmployerProfile | null;
  recentAuditLogs:         AuditEntry[];
}

type RoleTab = "ALL" | "WORKER" | "EMPLOYER";

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function displayName(user: PendingUser): string {
  return user.name ?? user.companyName ?? user.email;
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

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-50">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <td key={i} className="px-4 py-4">
          <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${40 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── SlideOverPanel ─────────────────────────────────────────────────────────────

function SlideOverPanel({
  userId,
  onClose,
  onApprove,
  onReject,
}: {
  userId:    string;
  onClose:   () => void;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
}) {
  const [detail, setDetail]   = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    adminApi.getUserDetail(userId).then((res) => {
      if (res.success) setDetail(res.data as UserDetail);
      setLoading(false);
    });
  }, [userId]);

  const wp = detail?.role === "WORKER"   ? detail.profile as WorkerProfile   : null;
  const ep = detail?.role === "EMPLOYER" ? detail.profile as EmployerProfile : null;

  const fullName = wp
    ? [wp.firstName, wp.lastName].filter(Boolean).join(" ") || detail?.email
    : ep?.companyName ?? detail?.email;

  const days = daysAgo(detail?.verificationSubmittedAt ?? null);
  const daysColor = days > 7 ? "text-red-600" : days > 3 ? "text-amber-600" : "text-slate-600";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[520px] max-w-full bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Review Profile</h2>
            <p className="text-xs text-slate-400 mt-0.5">{detail?.email ?? "Loading…"}</p>
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
                <Avatar name={fullName ?? "?"} size="xl" />
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 text-base truncate">{fullName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{detail.email}</div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant={detail.role === "WORKER" ? "blue" : "teal"}>{detail.role}</Badge>
                    <Badge variant="amber" dot>Pending Review</Badge>
                    {days > 0 && (
                      <span className={`text-xs font-semibold ${daysColor}`}>
                        {days}d waiting
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Submission timing */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1">
                <DetailField label="Submitted"    value={fmtDate(detail.verificationSubmittedAt)} />
                <DetailField label="Registered"   value={fmtDate(detail.createdAt)} />
                {detail.rejectionReason && (
                  <DetailField label="Prev. Rejection" value={detail.rejectionReason} />
                )}
              </div>

              {/* Worker profile */}
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

              {/* Employer profile */}
              {ep && (
                <div className="space-y-1">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Company Details</h3>
                  <DetailField label="Company Name"    value={ep.companyName} />
                  <DetailField label="Contact Person"  value={ep.contactPersonName} />
                  <DetailField label="Industry"        value={ep.industry} />
                  <DetailField label="Company Size"    value={ep.companySize} />
                  <DetailField label="Website"         value={ep.website} />
                  <DetailField label="Country"         value={ep.country} />
                  <DetailField label="City"            value={ep.city} />
                  {ep.nipt && <DetailField label="NIPT" value={`${ep.nipt.slice(0, 3)}****`} />}
                  {ep.businessDescription && (
                    <div className="py-2">
                      <div className="text-xs text-slate-400 mb-1">Description</div>
                      <p className="text-xs text-slate-700 leading-relaxed">{ep.businessDescription}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Skills */}
              {wp?.skills && wp.skills.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Skills</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {wp.skills.map(s => (
                      <span key={s.skill} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        {s.skill}
                      </span>
                    ))}
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
                        <span className="text-xs font-semibold text-slate-700">{l.language}</span>
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
                    {wp.targetCountries.map(c => (
                      <span key={c.country} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs">
                        🌍 {c.country}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit log */}
              {detail.recentAuditLogs && detail.recentAuditLogs.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recent Actions</h3>
                  <div className="space-y-2">
                    {detail.recentAuditLogs.map(log => (
                      <div key={log.id} className="flex gap-3 text-xs">
                        <span className="text-slate-400 whitespace-nowrap">{fmtDate(log.createdAt)}</span>
                        <span className="font-semibold text-slate-700">{log.action.replace(/_/g, " ")}</span>
                        {log.notes && <span className="text-slate-500 truncate">{log.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && detail && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex gap-2">
            <Button variant="teal"   size="sm" className="flex-1" onClick={() => onApprove(userId)}>
              ✓ Approve
            </Button>
            <Button variant="danger" size="sm" className="flex-1" onClick={() => onReject(userId)}>
              ✕ Reject
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── RejectModal ────────────────────────────────────────────────────────────────

function RejectModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
  loading:   boolean;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 10;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold mb-4 bg-red-100 text-red-700">
            ✕ Reject User
          </div>

          <Textarea
            label="Reason for rejection *"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            placeholder="Explain why this account is being rejected (min. 10 characters)…"
          />
          {!tooShort ? null : reason.length > 0 ? (
            <p className="text-xs text-red-500 mt-1">At least 10 characters required</p>
          ) : null}

          <div className="flex gap-3 mt-5">
            <Button variant="secondary" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={loading}
              disabled={tooShort}
              onClick={() => onConfirm(reason.trim())}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PendingUsersPage() {
  const [users, setUsers]         = useState<PendingUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [roleTab, setRoleTab]     = useState<RoleTab>("ALL");
  const [search, setSearch]       = useState("");
  const [selectedId, setSelected] = useState<string | null>(null);
  const [rejectTargetId, setRejectTarget] = useState<string | null>(null);
  const [acting, setActing]       = useState(false);
  const [toast, setToast]         = useState<ToastData>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminApi.getPendingUsers();
    if (res.success) setUsers((res.data as PendingUser[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const removeUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    if (selectedId === id) setSelected(null);
  };

  const handleApprove = async (id: string) => {
    setActing(true);
    const res = await adminApi.approveUser(id);
    setActing(false);
    if (res.success) {
      showToast("User approved successfully", "ok");
      removeUser(id);
    } else {
      showToast((res as { error?: string }).error ?? "Could not approve user", "err");
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTargetId) return;
    setActing(true);
    const res = await adminApi.rejectUser(rejectTargetId, reason);
    setActing(false);
    if (res.success) {
      showToast("User rejected", "ok");
      removeUser(rejectTargetId);
      setRejectTarget(null);
    } else {
      showToast((res as { error?: string }).error ?? "Could not reject user", "err");
    }
  };

  const openReject = (id: string) => {
    setSelected(null);
    setRejectTarget(id);
  };

  // Client-side filter
  const filtered = useMemo(() => {
    let list = users;
    if (roleTab !== "ALL") list = list.filter(u => u.role === roleTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? "").toLowerCase().includes(q) ||
        (u.companyName ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, roleTab, search]);

  const TABS: { key: RoleTab; label: string }[] = [
    { key: "ALL",      label: "All" },
    { key: "WORKER",   label: "Workers" },
    { key: "EMPLOYER", label: "Employers" },
  ];

  const countFor = (key: RoleTab) =>
    key === "ALL" ? users.length : users.filter(u => u.role === key).length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Pending Review</h1>
          {!loading && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold bg-amber-100 text-amber-700">
              {users.length}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load}>↻ Refresh</Button>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        {/* Role tabs */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setRoleTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                roleTab === tab.key
                  ? "bg-amber-500 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                roleTab === tab.key ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {countFor(tab.key)}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="w-56"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Name", "Email", "Role", "Submitted", "Days waiting", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16">
                      <EmptyState
                        icon="✓"
                        title={search || roleTab !== "ALL" ? "No matches" : "Queue is clear"}
                        description={
                          search || roleTab !== "ALL"
                            ? "Try adjusting your filters."
                            : "No users are pending review right now."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map(user => {
                    const days = daysAgo(user.verificationSubmittedAt);
                    const daysColor =
                      days > 7 ? "text-red-600 font-bold" :
                      days > 3 ? "text-amber-600 font-semibold" :
                      "text-slate-600";

                    return (
                      <tr
                        key={user.id}
                        className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setSelected(user.id)}
                      >
                        {/* Name */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={displayName(user)} size="sm" />
                            <span className="font-semibold text-slate-900 text-sm">
                              {displayName(user)}
                            </span>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3.5 text-xs text-slate-500 max-w-[180px]">
                          <span className="truncate block">{user.email}</span>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3.5">
                          <Badge variant={user.role === "WORKER" ? "blue" : "teal"}>
                            {user.role}
                          </Badge>
                        </td>

                        {/* Submitted */}
                        <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {fmtDate(user.verificationSubmittedAt)}
                        </td>

                        {/* Days waiting */}
                        <td className="px-4 py-3.5">
                          <span className={`text-sm ${daysColor}`}>
                            {days > 0 ? `${days}d` : "Today"}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1.5">
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => setSelected(user.id)}
                            >
                              View →
                            </Button>
                            <Button
                              size="xs"
                              variant="teal"
                              disabled={acting}
                              onClick={() => handleApprove(user.id)}
                            >
                              ✓
                            </Button>
                            <Button
                              size="xs"
                              variant="danger"
                              disabled={acting}
                              onClick={() => openReject(user.id)}
                            >
                              ✕
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Slide-over detail panel */}
      {selectedId && (
        <SlideOverPanel
          userId={selectedId}
          onClose={() => setSelected(null)}
          onApprove={(id) => { setSelected(null); handleApprove(id); }}
          onReject={(id) => openReject(id)}
        />
      )}

      {/* Reject modal */}
      {rejectTargetId && (
        <RejectModal
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          loading={acting}
        />
      )}
    </div>
  );
}
