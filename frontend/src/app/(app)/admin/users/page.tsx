"use client";
// src/app/(app)/admin/users/page.tsx

import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import {
  PageHeader, Card, CardContent, Badge, Button, Avatar,
  Input, SelectInput, Textarea, Spinner, Pagination,
  ToastDisplay, type ToastData, EmptyState,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

type AccountStatus =
  | "PENDING_EMAIL_VERIFICATION"
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";

interface UserRow {
  id:                      string;
  email:                   string;
  role:                    "WORKER" | "EMPLOYER" | "ADMIN";
  accountStatus:           AccountStatus;
  isEmailVerified:         boolean;
  createdAt:               string;
  verificationSubmittedAt: string | null;
  name:                    string | null;
  companyName:             string | null;
}

type StatusTab = "ALL" | AccountStatus;

// ── Status display config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AccountStatus, { label: string; variant: string }> = {
  VERIFIED:                    { label: "Verified",          variant: "green"  },
  PENDING_REVIEW:              { label: "Pending Review",    variant: "amber"  },
  REJECTED:                    { label: "Rejected",          variant: "red"    },
  SUSPENDED:                   { label: "Suspended",         variant: "slate"  },
  PENDING_EMAIL_VERIFICATION:  { label: "Email Unverified",  variant: "blue"   },
};

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "ALL",                         label: "All"           },
  { key: "VERIFIED",                    label: "Verified"      },
  { key: "PENDING_REVIEW",              label: "Pending"       },
  { key: "REJECTED",                    label: "Rejected"      },
  { key: "SUSPENDED",                   label: "Suspended"     },
  { key: "PENDING_EMAIL_VERIFICATION",  label: "Unverified"    },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function displayName(u: UserRow): string {
  return u.name ?? u.companyName ?? u.email;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-50">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <td key={i} className="px-4 py-4">
          <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${35 + (i * 17) % 45}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── SuspendModal ───────────────────────────────────────────────────────────────

function SuspendModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
  loading:   boolean;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 5;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold mb-4 bg-slate-100 text-slate-700">
            Suspend Account
          </div>
          <Textarea
            label="Reason for suspension *"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Briefly explain why this account is being suspended…"
          />
          <div className="flex gap-3 mt-5">
            <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
            <Button variant="danger" className="flex-1" loading={loading} disabled={tooShort} onClick={() => onConfirm(reason.trim())}>
              Suspend
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ReinstateModal ─────────────────────────────────────────────────────────────

function ReinstateModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel:  () => void;
  loading:   boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-emerald-600 text-xl">↩</span>
          </div>
          <h3 className="font-bold text-slate-900 mb-1">Restore this account?</h3>
          <p className="text-sm text-slate-500 mb-5">The user will regain full access to their account.</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
            <Button variant="teal" className="flex-1" loading={loading} onClick={onConfirm}>Reinstate</Button>
          </div>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold mb-4 bg-red-100 text-red-700">
            ✕ Reject Account
          </div>
          <Textarea
            label="Reason for rejection *"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            placeholder="Explain why this account is being rejected (min. 10 characters)…"
          />
          <div className="flex gap-3 mt-5">
            <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
            <Button variant="danger" className="flex-1" loading={loading} disabled={tooShort} onClick={() => onConfirm(reason.trim())}>
              Confirm Rejection
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers]         = useState<UserRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");
  const [roleFilter, setRole]     = useState("");
  const [search, setSearch]       = useState("");
  const [toast, setToast]         = useState<ToastData>(null);

  // Modal state
  const [suspendTarget,   setSuspendTarget]   = useState<string | null>(null);
  const [reinstateTarget, setReinstateTarget] = useState<string | null>(null);
  const [rejectTarget,    setRejectTarget]    = useState<string | null>(null);
  const [acting,          setActing]          = useState(false);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (statusTab !== "ALL") params.status = statusTab;
    if (roleFilter)          params.role   = roleFilter;
    if (search.trim())       params.search = search.trim();
    const res = await adminApi.getUsers(params);
    if (res.success) {
      setUsers((res.data as UserRow[]) ?? []);
      setTotal((res as unknown as { total: number }).total ?? 0);
    }
    setLoading(false);
  }, [page, statusTab, roleFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Reset page when filters change
  const setTab = (t: StatusTab) => { setStatusTab(t); setPage(1); };
  const setRole2 = (r: string)   => { setRole(r);     setPage(1); };

  // ── Actions ──

  const handleApprove = async (id: string) => {
    setActing(true);
    const res = await adminApi.approveUser(id);
    setActing(false);
    if (res.success) { showToast("User approved", "ok"); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  const handleSuspendConfirm = async (reason: string) => {
    if (!suspendTarget) return;
    setActing(true);
    const res = await adminApi.suspendUserAccount(suspendTarget, reason);
    setActing(false);
    if (res.success) { showToast("Account suspended", "ok"); setSuspendTarget(null); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  const handleReinstateConfirm = async () => {
    if (!reinstateTarget) return;
    setActing(true);
    const res = await adminApi.reinstateUser(reinstateTarget);
    setActing(false);
    if (res.success) { showToast("Account reinstated", "ok"); setReinstateTarget(null); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    setActing(true);
    const res = await adminApi.rejectUser(rejectTarget, reason);
    setActing(false);
    if (res.success) { showToast("User rejected", "ok"); setRejectTarget(null); load(); }
    else showToast((res as { error?: string }).error ?? "Failed", "err");
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <ToastDisplay toast={toast} />

      <PageHeader
        title="User Management"
        description={`${total.toLocaleString()} users total`}
        actions={<Button variant="outline" size="sm" onClick={load}>↻ Refresh</Button>}
      />

      {/* Status tabs */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              statusTab === tab.key
                ? "bg-amber-500 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex gap-3 flex-wrap mb-5">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && load()}
          placeholder="Search name or email…"
          className="w-56"
        />
        <SelectInput
          value={roleFilter}
          onChange={e => setRole2(e.target.value)}
          placeholder="All roles"
          options={[
            { value: "WORKER",   label: "Workers"   },
            { value: "EMPLOYER", label: "Employers" },
            { value: "ADMIN",    label: "Admins"    },
          ]}
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
                  {["Name", "Email", "Role", "Status", "Joined", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16">
                      <EmptyState icon="👥" title="No users found" description="Try adjusting your filters." />
                    </td>
                  </tr>
                ) : users.map(u => {
                  const statusCfg = STATUS_CONFIG[u.accountStatus] ?? { label: u.accountStatus, variant: "slate" };
                  const name = displayName(u);

                  return (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">

                      {/* Name */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} size="sm" />
                          <span className="font-semibold text-slate-900 text-sm max-w-[140px] truncate">
                            {name === u.email ? "—" : name}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3.5 text-xs text-slate-500 max-w-[180px]">
                        <span className="truncate block">{u.email}</span>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <Badge variant={u.role === "WORKER" ? "blue" : u.role === "EMPLOYER" ? "teal" : "purple"}>
                          {u.role}
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <Badge variant={statusCfg.variant as Parameters<typeof Badge>[0]["variant"]} dot>
                          {statusCfg.label}
                        </Badge>
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(u.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1.5 flex-wrap">
                          {u.accountStatus === "PENDING_REVIEW" && (
                            <>
                              <Button size="xs" variant="teal"    onClick={() => handleApprove(u.id)}>✓ Approve</Button>
                              <Button size="xs" variant="danger"  onClick={() => setRejectTarget(u.id)}>✕ Reject</Button>
                            </>
                          )}
                          {u.accountStatus === "VERIFIED" && u.role !== "ADMIN" && (
                            <Button size="xs" variant="outline" onClick={() => setSuspendTarget(u.id)}>Suspend</Button>
                          )}
                          {(u.accountStatus === "REJECTED" || u.accountStatus === "SUSPENDED") && (
                            <Button size="xs" variant="outline" onClick={() => setReinstateTarget(u.id)}>↩ Reinstate</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Pagination page={page} total={total} pageSize={20} onChange={setPage} className="mt-6" />

      {/* Suspend modal */}
      {suspendTarget && (
        <SuspendModal
          onConfirm={handleSuspendConfirm}
          onCancel={() => setSuspendTarget(null)}
          loading={acting}
        />
      )}

      {/* Reinstate modal */}
      {reinstateTarget && (
        <ReinstateModal
          onConfirm={handleReinstateConfirm}
          onCancel={() => setReinstateTarget(null)}
          loading={acting}
        />
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          loading={acting}
        />
      )}
    </div>
  );
}
