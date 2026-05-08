"use client";

import type React from "react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData } from "@/components/ui";
import { C, inputStyle } from "@/lib/admin-theme";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PendingUser {
  id:                      string;
  email:                   string;
  role:                    "WORKER" | "EMPLOYER";
  accountStatus:           string;
  verificationSubmittedAt: string | null;
  createdAt:               string;
  name:                    string | null;
  companyName:             string | null;
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${C.border}`, gap: 16 }}>
      <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.secondary, textAlign: "right", wordBreak: "break-word", maxWidth: "60%" }}>{String(value)}</span>
    </div>
  );
}

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <td key={i} style={{ padding: "16px 20px" }}>
          <div style={{ height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 6, width: `${40 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── SlideOverPanel ─────────────────────────────────────────────────────────────

function SlideOverPanel({
  userId, onClose, onApprove, onReject,
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

  const days      = daysAgo(detail?.verificationSubmittedAt ?? null);
  const daysColor = days > 7 ? C.accent : days > 3 ? C.yellow : C.secondary;

  const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 };

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", zIndex: 40 }} onClick={onClose} />

      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, height: "100%", width: 520, maxWidth: "100%", background: "#161616", borderLeft: `1px solid ${C.border}`, zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "-24px 0 60px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontWeight: 700, color: C.text, fontSize: 15 }}>Review Profile</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: C.muted }}>{detail?.email ?? "Loading…"}</p>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontFamily: "inherit" }}
          >
            ×
          </button>
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
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: C.secondary, flexShrink: 0 }}>
                  {(fullName ?? "?")[0]?.toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{detail.email}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: detail.role === "WORKER" ? C.blue : C.teal, background: detail.role === "WORKER" ? "rgba(0,144,255,0.12)" : "rgba(20,184,166,0.12)" }}>{detail.role}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: C.yellow, background: "rgba(245,158,11,0.12)" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.yellow }} />
                      Pending Review
                    </span>
                    {days > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: daysColor }}>{days}d waiting</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Submission timing */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px" }}>
                <DetailField label="Submitted"       value={fmtDate(detail.verificationSubmittedAt)} />
                <DetailField label="Registered"      value={fmtDate(detail.createdAt)} />
                {detail.rejectionReason && <DetailField label="Prev. Rejection" value={detail.rejectionReason} />}
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
                  {wp.passportNumber && (
                    <DetailField label="Passport" value={`${wp.passportNumber.slice(0, 3)}****${wp.passportNumber.slice(-2)}`} />
                  )}
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
                  {ep.businessDescription && (
                    <div style={{ paddingTop: 8 }}>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Description</div>
                      <p style={{ fontSize: 12, color: C.secondary, lineHeight: 1.6, margin: 0 }}>{ep.businessDescription}</p>
                    </div>
                  )}
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

              {/* Audit log */}
              {detail.recentAuditLogs && detail.recentAuditLogs.length > 0 && (
                <div>
                  <span style={sectionLabel}>Recent Actions</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detail.recentAuditLogs.map(log => (
                      <div key={log.id} style={{ display: "flex", gap: 12, fontSize: 12 }}>
                        <span style={{ color: C.muted, whiteSpace: "nowrap" }}>{fmtDate(log.createdAt)}</span>
                        <span style={{ fontWeight: 600, color: C.secondary }}>{log.action.replace(/_/g, " ")}</span>
                        {log.notes && <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.notes}</span>}
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
          <div style={{ flexShrink: 0, padding: "16px 24px", borderTop: `1px solid ${C.border}`, background: "#1a1a1a", display: "flex", gap: 10 }}>
            <button
              onClick={() => onApprove(userId)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)", color: C.teal, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => onReject(userId)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.35)", color: C.accent, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
            >
              ✕ Reject
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── RejectModal ────────────────────────────────────────────────────────────────

function RejectModal({ onConfirm, onCancel, loading }: { onConfirm: (r: string) => void; onCancel: () => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 10;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onCancel}>
      <div style={{ background: "#141414", border: `1px solid ${C.border}`, borderRadius: 18, width: "100%", maxWidth: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 99, background: "rgba(220,38,38,0.12)", color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 18 }}>
          ✕ Reject User
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 8 }}>Reason for rejection *</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={4}
          placeholder="Explain why this account is being rejected (min. 10 characters)…"
          style={{ ...inputStyle, resize: "vertical" as const }}
        />
        {!tooShort ? null : reason.length > 0 ? (
          <p style={{ fontSize: 12, color: C.accent, marginTop: 6 }}>At least 10 characters required</p>
        ) : null}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={tooShort || loading}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, background: tooShort || loading ? "rgba(113,113,122,0.1)" : "rgba(220,38,38,0.15)", border: `1px solid ${tooShort || loading ? C.border : "rgba(220,38,38,0.4)"}`, color: tooShort || loading ? C.muted : C.accent, cursor: tooShort || loading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
          >
            {loading ? "…" : "Confirm Rejection"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PendingUsersPage() {
  const [users, setUsers]               = useState<PendingUser[]>([]);
  const [loading, setLoading]           = useState(true);
  const [roleTab, setRoleTab]           = useState<RoleTab>("ALL");
  const [search, setSearch]             = useState("");
  const [selectedId, setSelected]       = useState<string | null>(null);
  const [rejectTargetId, setRejectTarget] = useState<string | null>(null);
  const [acting, setActing]             = useState(false);
  const [toast, setToast]               = useState<ToastData>(null);

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
    if (res.success) { showToast("User approved successfully", "ok"); removeUser(id); }
    else showToast((res as { error?: string }).error ?? "Could not approve user", "err");
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTargetId) return;
    setActing(true);
    const res = await adminApi.rejectUser(rejectTargetId, reason);
    setActing(false);
    if (res.success) { showToast("User rejected", "ok"); removeUser(rejectTargetId); setRejectTarget(null); }
    else showToast((res as { error?: string }).error ?? "Could not reject user", "err");
  };

  const openReject = (id: string) => { setSelected(null); setRejectTarget(id); };

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
    <div className="admin-page-root" style={{ padding: 32, maxWidth: 1100 }}>
      <ToastDisplay toast={toast} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Pending Review</h1>
          {!loading && (
            <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 99, fontSize: 13, fontWeight: 700, background: "rgba(245,158,11,0.15)", color: C.yellow }}>
              {users.length}
            </span>
          )}
        </div>
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.secondary, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
          ↻ Refresh
        </button>
      </div>

      {/* Tabs + Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setRoleTab(tab.key)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer", background: roleTab === tab.key ? C.teal : "transparent", color: roleTab === tab.key ? "#000" : C.muted, border: `1px solid ${roleTab === tab.key ? C.teal : C.border}`, transition: "all 0.15s", fontFamily: "inherit" }}
            >
              {tab.label}
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: roleTab === tab.key ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.07)", color: roleTab === tab.key ? "#000" : C.muted }}>
                {countFor(tab.key)}
              </span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email…"
          style={{ ...inputStyle, width: 220 }}
        />
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                {["Name", "Email", "Role", "Submitted", "Days Waiting", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "64px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>✓</div>
                    <div style={{ color: C.muted, fontSize: 15 }}>{search || roleTab !== "ALL" ? "No matches" : "Queue is clear"}</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginTop: 6 }}>
                      {search || roleTab !== "ALL" ? "Try adjusting your filters." : "No users are pending review right now."}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((user, idx) => {
                  const days      = daysAgo(user.verificationSubmittedAt);
                  const daysColor = days > 7 ? C.accent : days > 3 ? C.yellow : C.secondary;
                  const name      = displayName(user);

                  return (
                    <tr
                      key={user.id}
                      style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      onClick={() => setSelected(user.id)}
                    >
                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.secondary, flexShrink: 0 }}>
                            {name[0]?.toUpperCase() ?? "?"}
                          </div>
                          <span style={{ fontWeight: 600, color: C.secondary, fontSize: 13 }}>{name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px", maxWidth: 200 }}>
                        <span style={{ fontSize: 12, color: C.muted, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: user.role === "WORKER" ? C.blue : C.teal, background: user.role === "WORKER" ? "rgba(0,144,255,0.12)" : "rgba(20,184,166,0.12)" }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: "14px 20px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                        {fmtDate(user.verificationSubmittedAt)}
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{ fontSize: 13, fontWeight: days > 3 ? 700 : 400, color: daysColor }}>
                          {days > 0 ? `${days}d` : "Today"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 20px" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setSelected(user.id)} style={{ padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.secondary, fontFamily: "inherit" }}>View →</button>
                          <button disabled={acting} onClick={() => handleApprove(user.id)} style={{ padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: acting ? "not-allowed" : "pointer", background: "rgba(20,184,166,0.12)", border: "1px solid rgba(20,184,166,0.3)", color: acting ? C.muted : C.teal, fontFamily: "inherit" }}>✓</button>
                          <button disabled={acting} onClick={() => openReject(user.id)} style={{ padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: acting ? "not-allowed" : "pointer", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: acting ? C.muted : C.accent, fontFamily: "inherit" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <SlideOverPanel
          userId={selectedId}
          onClose={() => setSelected(null)}
          onApprove={(id) => { setSelected(null); handleApprove(id); }}
          onReject={(id) => openReject(id)}
        />
      )}

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
