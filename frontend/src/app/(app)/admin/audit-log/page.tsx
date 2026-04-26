"use client";
// src/app/(app)/admin/audit-log/page.tsx

import { useEffect, useState, useCallback, useMemo } from "react";
import { adminApi } from "@/lib/api-client";
import {
  PageHeader, Card, CardContent, Badge, Button,
  Input, SelectInput, Spinner, Pagination,
  ToastDisplay, type ToastData, EmptyState,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AuditUser {
  id:         string;
  email:      string;
  first_name: string | null;
  last_name:  string | null;
}

interface AuditEntry {
  id:          string;
  action:      string;
  notes:       string | null;
  metadata?:   Record<string, unknown> | null;
  created_at:  string;
  admin:       AuditUser & { role?: string };
  target_user: AuditUser & { role: string };
}

// ── Action config ──────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; variant: string }> = {
  USER_APPROVED:         { label: "Approved",   variant: "green"  },
  USER_REJECTED:         { label: "Rejected",   variant: "red"    },
  USER_SUSPENDED:        { label: "Suspended",  variant: "amber"  },
  USER_REINSTATED:       { label: "Reinstated", variant: "blue"   },
  JOB_APPROVED:          { label: "Job OK",     variant: "green"  },
  JOB_REJECTED:          { label: "Job Rejected", variant: "red"  },
  LOCK_OVERRIDDEN:       { label: "Lock Override", variant: "purple" },
  AI_DECISION_OVERRIDDEN:{ label: "AI Override",  variant: "purple" },
};

const ACTION_OPTIONS = [
  { value: "USER_APPROVED",   label: "Approved"   },
  { value: "USER_REJECTED",   label: "Rejected"   },
  { value: "USER_SUSPENDED",  label: "Suspended"  },
  { value: "USER_REINSTATED", label: "Reinstated" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function userName(u: AuditUser): string {
  if (u.first_name) return [u.first_name, u.last_name].filter(Boolean).join(" ");
  return u.email;
}

function fmtTimestamp(s: string): string {
  return new Date(s).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateOnly(s: string): string {
  return new Date(s).toISOString().split("T")[0];
}

// ── MetadataViewer ─────────────────────────────────────────────────────────────

function MetadataViewer({ entry }: { entry: AuditEntry }) {
  const meta = entry.metadata;

  return (
    <tr className="bg-slate-50/70 border-b border-slate-100">
      <td colSpan={5} className="px-6 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* IDs */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Identifiers</div>
            <Row label="Log ID"         value={entry.id} mono />
            <Row label="Admin ID"       value={entry.admin.id} mono />
            <Row label="Target User ID" value={entry.target_user.id} mono />
          </div>

          {/* Admin + target detail */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Parties</div>
            <Row label="Admin"        value={`${userName(entry.admin)} <${entry.admin.email}>`} />
            <Row label="Target"       value={`${userName(entry.target_user)} <${entry.target_user.email}>`} />
            <Row label="Target role"  value={entry.target_user.role} />
            <Row label="Timestamp"    value={fmtTimestamp(entry.created_at)} />
          </div>

          {/* Notes */}
          {entry.notes && (
            <div className="sm:col-span-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Notes / Reason</div>
              <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                {entry.notes}
              </p>
            </div>
          )}

          {/* Raw metadata */}
          {meta && Object.keys(meta).length > 0 && (
            <div className="sm:col-span-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Metadata</div>
              <div className="bg-slate-800 text-slate-100 rounded-lg p-3 overflow-x-auto">
                <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
                  {JSON.stringify(meta, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-slate-400 w-28 flex-shrink-0">{label}:</span>
      <span className={`text-slate-700 break-all ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-50">
      {[1, 2, 3, 4, 5].map(i => (
        <td key={i} className="px-4 py-4">
          <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${30 + (i * 19) % 50}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminAuditLogPage() {
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [actionFilter, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast]       = useState<ToastData>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (actionFilter) params.action = actionFilter;
    if (dateFrom)     params.from   = dateFrom;
    if (dateTo)       params.to     = dateTo;
    const res = await adminApi.getAuditLog(params);
    if (res.success) {
      setEntries((res.data as AuditEntry[]) ?? []);
      setTotal((res as unknown as { total: number }).total ?? 0);
    } else {
      setToast({ msg: "Failed to load audit log", type: "err" });
      setTimeout(() => setToast(null), 4000);
    }
    setLoading(false);
  }, [page, actionFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Client-side search filter (on current page)
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      e.admin.email.toLowerCase().includes(q) ||
      (e.admin.first_name ?? "").toLowerCase().includes(q) ||
      (e.admin.last_name  ?? "").toLowerCase().includes(q) ||
      e.target_user.email.toLowerCase().includes(q) ||
      (e.target_user.first_name ?? "").toLowerCase().includes(q) ||
      (e.target_user.last_name  ?? "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const resetFilters = () => {
    setAction(""); setDateFrom(""); setDateTo(""); setSearch(""); setPage(1);
  };

  const hasFilters = actionFilter || dateFrom || dateTo || search;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <ToastDisplay toast={toast} />

      <PageHeader
        title="Audit Log"
        description="All admin actions across the platform"
        actions={
          <div className="flex gap-2">
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={resetFilters}>✕ Clear</Button>
            )}
            <Button variant="outline" size="sm" onClick={load}>↻ Refresh</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap mb-5 items-end">
        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            max={dateTo || fmtDateOnly(new Date().toISOString())}
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400"
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            min={dateFrom}
            max={fmtDateOnly(new Date().toISOString())}
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400"
          />
        </div>

        {/* Action */}
        <SelectInput
          value={actionFilter}
          onChange={e => { setAction(e.target.value); setPage(1); }}
          placeholder="All actions"
          options={ACTION_OPTIONS}
          className="w-44"
        />

        {/* Search */}
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search admin or user…"
          className="w-56"
        />
      </div>

      {/* Stats strip */}
      {!loading && (
        <p className="text-xs text-slate-400 mb-4">
          Showing {filtered.length} of {total.toLocaleString()} events
          {hasFilters ? " (filtered)" : ""}
        </p>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Timestamp", "Admin", "Action", "User affected", "Notes"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16">
                      <EmptyState
                        icon="📋"
                        title="No events found"
                        description={hasFilters ? "Try adjusting your filters." : "No audit events recorded yet."}
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map(entry => {
                    const cfg = ACTION_CONFIG[entry.action] ?? { label: entry.action.replace(/_/g, " "), variant: "slate" };
                    const isOpen = expanded === entry.id;

                    return [
                      <tr
                        key={entry.id}
                        className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors cursor-pointer ${isOpen ? "bg-slate-50/70" : ""}`}
                        onClick={() => setExpanded(isOpen ? null : entry.id)}
                      >
                        {/* Timestamp */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="text-xs font-semibold text-slate-700">
                            {new Date(entry.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(entry.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>

                        {/* Admin */}
                        <td className="px-4 py-3.5 max-w-[160px]">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {userName(entry.admin)}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{entry.admin.email}</div>
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3.5">
                          <Badge variant={cfg.variant as Parameters<typeof Badge>[0]["variant"]}>
                            {cfg.label}
                          </Badge>
                        </td>

                        {/* Target user */}
                        <td className="px-4 py-3.5 max-w-[180px]">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {userName(entry.target_user)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-slate-400 truncate">{entry.target_user.email}</span>
                            <Badge variant={entry.target_user.role === "WORKER" ? "blue" : "teal"} className="text-[9px] px-1.5 py-0">
                              {entry.target_user.role}
                            </Badge>
                          </div>
                        </td>

                        {/* Notes + expand indicator */}
                        <td className="px-4 py-3.5 max-w-[180px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-500 truncate">
                              {entry.notes ? entry.notes.slice(0, 60) + (entry.notes.length > 60 ? "…" : "") : "—"}
                            </span>
                            <span className="text-slate-300 text-xs flex-shrink-0">
                              {isOpen ? "▲" : "▼"}
                            </span>
                          </div>
                        </td>
                      </tr>,

                      // Expanded metadata row
                      ...(isOpen ? [<MetadataViewer key={`${entry.id}-meta`} entry={entry} />] : []),
                    ];
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Pagination page={page} total={total} pageSize={20} onChange={p => { setPage(p); setExpanded(null); }} className="mt-6" />
    </div>
  );
}
