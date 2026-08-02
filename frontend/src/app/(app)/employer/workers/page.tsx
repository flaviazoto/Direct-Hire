"use client";
// src/app/(app)/employer/workers/page.tsx
// Employer-facing worker search page with lock visibility.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { employerApi } from "@/lib/api-client";
import { LoadingPage, ToastDisplay, type ToastData, ErrorState } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkerResult {
  userId:             string;
  name:               string;
  profession:         string | null;
  countryOfResidence: string | null;
  yearsExperience:    string | null;
  trustScore:         number | null;
  profileScore:       number | null;
  aiMatchScore:       number | undefined;
  account_status:     string;
  is_locked:          boolean;
  locked_by_me:       boolean;
  in_group:           boolean;
  has_profile:        boolean;
  documents_verified: boolean;
  skills:             { skill: string }[];
  languages:          { language: string; proficiencyLevel: string }[];
}

interface WorkersResponse {
  data:  WorkerResult[];
  total: number;
  page:  number;
  limit: number;
}

// ── Worker group / bulk quote types (Phase 4, Step 2) ────────────────────────

interface GroupMember {
  workerId: string;
  worker: { id: string; email: string; workerProfile: { firstName: string | null; lastName: string | null } | null };
}
interface BulkQuoteRequest {
  id: string;
  status: "REQUESTED" | "QUOTE_PREPARED" | "SENT";
  workerCountAtRequest: number;
  quoteAmountUsd: string | null;
  quoteNotes: string | null;
  requestedAt: string;
  quoteSentAt: string | null;
}

const MIN_GROUP_SIZE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  { bg: "rgba(0,144,255,0.18)",  color: "#2dd4bf" },
  { bg: "rgba(96,165,250,0.18)",  color: "#60a5fa" },
  { bg: "rgba(167,139,250,0.18)", color: "#c4b5fd" },
  { bg: "rgba(251,191,36,0.18)",  color: "#fbbf24" },
  { bg: "rgba(251,113,133,0.18)", color: "#fb7185" },
];

function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── Account status helpers ────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  VERIFIED:                  { label: "Verified",   color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  PENDING_REVIEW:            { label: "Pending",    color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  PENDING_EMAIL_VERIFICATION:{ label: "Unverified", color: "#71717a", bg: "rgba(113,113,122,0.1)" },
  SUSPENDED:                 { label: "Suspended",  color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};

// ── Worker card ───────────────────────────────────────────────────────────────

function WorkerCard({ worker, onToggleGroup, groupBusy }: {
  worker: WorkerResult;
  onToggleGroup: (workerId: string, add: boolean) => void;
  groupBusy: boolean;
}) {
  const aColor      = avatarColor(worker.name);
  const locked      = worker.is_locked;
  const hasProfile  = worker.has_profile;
  const statusBadge = STATUS_BADGE[worker.account_status] ?? STATUS_BADGE.PENDING_EMAIL_VERIFICATION;
  // Addable to the employer's group if available, or locked by this same
  // employer — never if reserved by a different employer.
  const addableToGroup = !worker.is_locked || worker.locked_by_me;

  const card = (
    <div style={{
      display:      "block",
      background:   "#161616",
      border:       "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      overflow:     "hidden",
      opacity:      locked ? 0.65 : 1,
      transition:   "border-color 0.15s, opacity 0.15s",
    }}>
      <div style={{ padding: "18px 20px" }}>
        {/* Top: avatar + name + match score */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{
            width:          42,
            height:         42,
            borderRadius:   "50%",
            background:     aColor.bg,
            border:         `1.5px solid ${aColor.color}33`,
            flexShrink:     0,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            fontSize:       14,
            fontWeight:     800,
            color:          aColor.color,
          }}>
            {initials(worker.name)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
                {worker.name}
              </span>
              {worker.documents_verified && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                  color: "#4ade80", background: "rgba(74,222,128,0.1)",
                  border: "1px solid rgba(74,222,128,0.3)", flexShrink: 0, whiteSpace: "nowrap",
                }}>
                  ✓ Verified
                </span>
              )}
            </div>
            {worker.profession ? (
              <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>{worker.profession}</div>
            ) : (
              <div style={{ fontSize: 12, color: "#444", marginTop: 2, fontStyle: "italic" }}>No profile yet</div>
            )}
          </div>

          {worker.aiMatchScore != null && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#2dd4bf",
              background: "rgba(0,144,255,0.08)", border: "1px solid rgba(0,144,255,0.2)",
              borderRadius: 99, padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap",
            }}>
              {worker.aiMatchScore}% match
            </span>
          )}
        </div>

        {/* Skills row */}
        {worker.skills.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
            {worker.skills.slice(0, 5).map(({ skill }) => (
              <span key={skill} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 6,
                color: "#71717a", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}>
                {skill}
              </span>
            ))}
            {worker.skills.length > 5 && (
              <span style={{ fontSize: 11, color: "#555" }}>+{worker.skills.length - 5}</span>
            )}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#555", marginBottom: 14, flexWrap: "wrap" }}>
          {worker.countryOfResidence && <span>{worker.countryOfResidence}</span>}
          {worker.yearsExperience    && <span>{worker.yearsExperience} yrs exp</span>}
          {worker.trustScore != null && <span style={{ color: "#60a5fa" }}>Trust {worker.trustScore}</span>}
          {/* Account status badge */}
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99,
            color: statusBadge.color, background: statusBadge.bg,
          }}>
            {statusBadge.label}
          </span>
        </div>

        {/* Bottom row: lock status + CTA */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {locked ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>Reserved</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "#71717a" }}>Available</span>
            </div>
          )}

          <span style={{
            fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 8,
            border:      hasProfile
              ? (locked ? "1px solid rgba(113,113,122,0.3)" : "1px solid rgba(0,144,255,0.3)")
              : "1px solid rgba(255,255,255,0.08)",
            color:       hasProfile ? (locked ? "#71717a" : "#2dd4bf") : "#444",
            background:  hasProfile
              ? (locked ? "rgba(113,113,122,0.06)" : "rgba(0,144,255,0.06)")
              : "rgba(255,255,255,0.03)",
            cursor:      hasProfile ? "pointer" : "default",
            transition:  "all 0.15s",
          }}>
            {hasProfile ? "View profile →" : "No profile"}
          </span>
        </div>

        {/* Group toggle — gold accent, admin-adjacent action distinct from the platform-blue "view profile" CTA */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {worker.in_group ? (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleGroup(worker.userId, false); }}
              disabled={groupBusy}
              style={{
                width: "100%", padding: "7px 0", borderRadius: 8,
                border: "1px solid rgba(224,176,32,0.35)", background: "rgba(224,176,32,0.1)",
                color: "#E0B020", fontSize: 12, fontWeight: 700,
                cursor: groupBusy ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              ✓ In group — remove
            </button>
          ) : addableToGroup ? (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleGroup(worker.userId, true); }}
              disabled={groupBusy}
              style={{
                width: "100%", padding: "7px 0", borderRadius: 8,
                border: "1px solid rgba(224,176,32,0.25)", background: "transparent",
                color: "#E0B020", fontSize: 12, fontWeight: 700,
                cursor: groupBusy ? "default" : "pointer", fontFamily: "inherit",
                opacity: groupBusy ? 0.5 : 1,
              }}
            >
              + Add to group
            </button>
          ) : (
            <div style={{ textAlign: "center", fontSize: 11, color: "#555", padding: "7px 0" }}>
              Reserved by another employer
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Workers without a profile can't be viewed — render non-clickable card
  if (!hasProfile) return card;

  return (
    <Link
      href={`/employer/workers/${worker.userId}`}
      style={{ display: "block", textDecoration: "none" }}
      onMouseEnter={e => { (e.currentTarget.firstElementChild as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)"; }}
      onMouseLeave={e => { (e.currentTarget.firstElementChild as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
    >
      {card}
    </Link>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: "50%", height: 13, background: "rgba(255,255,255,0.07)", borderRadius: 6, marginBottom: 7 }} />
          <div style={{ width: "35%", height: 11, background: "rgba(255,255,255,0.05)", borderRadius: 6 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[80, 70, 60].map(w => <div key={w} style={{ width: w, height: 18, background: "rgba(255,255,255,0.05)", borderRadius: 6 }} />)}
      </div>
      <div style={{ width: "60%", height: 11, background: "rgba(255,255,255,0.04)", borderRadius: 6 }} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ availableOnly }: { availableOnly: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px", color: "#555", gridColumn: "1 / -1" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#71717a", marginBottom: 6 }}>
        {availableOnly ? "No available workers match your search" : "No workers found"}
      </div>
      <div style={{ fontSize: 13, color: "#555", maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
        {availableOnly
          ? "Try turning off the 'Available only' filter to see all workers including reserved ones."
          : "Try adjusting your search or filters."}
      </div>
    </div>
  );
}

// ── Group panel (sticky) ──────────────────────────────────────────────────────
// Phase 4, Step 2 — no mockup file was found in the repo for this screen
// either (same as Phase 3's two admin screens), so this was built from the
// prompt's textual description: directory grid left, sticky group panel
// right with member count/progress/remove/request-quote.

function GroupPanel({
  members, pendingRequest, latestSentQuote, requesting, onRemove, onRequestQuote,
}: {
  members: GroupMember[];
  pendingRequest: BulkQuoteRequest | null;
  latestSentQuote: BulkQuoteRequest | null;
  requesting: boolean;
  onRemove: (workerId: string) => void;
  onRequestQuote: () => void;
}) {
  const count = members.length;
  const pct = Math.min(100, Math.round((count / MIN_GROUP_SIZE) * 100));
  const canRequest = count >= MIN_GROUP_SIZE && !pendingRequest;

  return (
    <div style={{
      position: "sticky", top: 16, alignSelf: "start",
      background: "#161616", border: "1px solid rgba(224,176,32,0.2)",
      borderRadius: 14, padding: 20,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Worker group</div>
      <div style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>
        Add 10+ workers to request a bulk hiring quote.
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: "#e4e4e7", fontWeight: 700 }}>{count} / {MIN_GROUP_SIZE}</span>
          <span style={{ color: "#555" }}>{count >= MIN_GROUP_SIZE ? "Ready" : `${MIN_GROUP_SIZE - count} more needed`}</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#E0B020", transition: "width 0.2s" }} />
        </div>
      </div>

      {/* Member list */}
      {count === 0 ? (
        <div style={{ fontSize: 12, color: "#555", padding: "16px 0", textAlign: "center" }}>
          No workers added yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, maxHeight: 280, overflowY: "auto" }}>
          {members.map(m => {
            const name = [m.worker.workerProfile?.firstName, m.worker.workerProfile?.lastName].filter(Boolean).join(" ") || m.worker.email;
            return (
              <div key={m.workerId} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8,
              }}>
                <span style={{ fontSize: 12, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <button
                  onClick={() => onRemove(m.workerId)}
                  style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13, padding: "0 4px", fontFamily: "inherit" }}
                  title="Remove from group"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Delivered quote */}
      {latestSentQuote && (
        <div style={{
          background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.25)",
          borderRadius: 10, padding: "12px 14px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
            Quote delivered
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
            ${latestSentQuote.quoteAmountUsd ?? "—"}
          </div>
          {latestSentQuote.quoteNotes && (
            <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 6, lineHeight: 1.5 }}>{latestSentQuote.quoteNotes}</div>
          )}
        </div>
      )}

      {/* Request button */}
      {pendingRequest ? (
        <div style={{ fontSize: 12, color: "#fbbf24", textAlign: "center", padding: "9px 0" }}>
          {pendingRequest.status === "QUOTE_PREPARED" ? "Quote is being finalized…" : "Request sent — awaiting a quote"}
        </div>
      ) : (
        <button
          onClick={onRequestQuote}
          disabled={!canRequest || requesting}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
            background: canRequest ? "#E0B020" : "rgba(255,255,255,0.06)",
            color: canRequest ? "#08142A" : "#555",
            fontSize: 13, fontWeight: 800, fontFamily: "inherit",
            cursor: canRequest && !requesting ? "pointer" : "not-allowed",
          }}
        >
          {requesting ? "Requesting…" : "Request bulk quote"}
        </button>
      )}
      {!canRequest && !pendingRequest && (
        <div style={{ fontSize: 11, color: "#555", textAlign: "center", marginTop: 8 }}>
          Add {MIN_GROUP_SIZE - count} more worker{MIN_GROUP_SIZE - count !== 1 ? "s" : ""} to unlock this.
        </div>
      )}
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

function WorkersContent() {
  const [workers,       setWorkers]       = useState<WorkerResult[]>([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [hasMore,       setHasMore]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [search,        setSearch]        = useState("");
  const [country,       setCountry]       = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [toast,         setToast]         = useState<ToastData>(null);

  // Worker group (Phase 4, Step 2)
  const [groupMembers,    setGroupMembers]    = useState<GroupMember[]>([]);
  const [quoteRequests,   setQuoteRequests]   = useState<BulkQuoteRequest[]>([]);
  const [groupBusyId,     setGroupBusyId]     = useState<string | null>(null);
  const [requestingQuote, setRequestingQuote] = useState(false);

  const loadGroup = useCallback(async () => {
    const res = await employerApi.getMyWorkerGroup();
    if (res.success) {
      const d = res.data as { members?: GroupMember[]; bulkQuoteRequests?: BulkQuoteRequest[] } | undefined;
      setGroupMembers(d?.members ?? []);
      setQuoteRequests(d?.bulkQuoteRequests ?? []);
    }
  }, []);

  useEffect(() => { loadGroup(); }, [loadGroup]);

  async function handleToggleGroup(workerId: string, add: boolean) {
    setGroupBusyId(workerId);
    const res = add ? await employerApi.addWorkerToGroup(workerId) : await employerApi.removeWorkerFromGroup(workerId);
    setGroupBusyId(null);
    if (res.success) {
      setToast({ msg: add ? "Added to group" : "Removed from group", type: "ok" });
      setWorkers(prev => prev.map(w => w.userId === workerId ? { ...w, in_group: add } : w));
      loadGroup();
    } else {
      setToast({ msg: res.error ?? "Could not update group", type: "err" });
    }
    setTimeout(() => setToast(null), 3500);
  }

  async function handleRequestQuote() {
    setRequestingQuote(true);
    const res = await employerApi.requestBulkQuote();
    setRequestingQuote(false);
    if (res.success) {
      setToast({ msg: "Bulk quote requested", type: "ok" });
      loadGroup();
    } else {
      setToast({ msg: res.error ?? "Could not request a quote", type: "err" });
    }
    setTimeout(() => setToast(null), 3500);
  }

  const pendingQuoteRequest = quoteRequests.find(q => q.status !== "SENT") ?? null;
  const latestSentQuote = quoteRequests.find(q => q.status === "SENT") ?? null;

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchWorkers = useCallback(async (pageNum: number, append = false) => {
    if (pageNum === 1) { setLoading(true); setError(null); } else setLoadingMore(true);
    try {
      const params: Record<string, string> = {
        page:  String(pageNum),
        limit: String(PAGE_SIZE),
      };
      if (debouncedSearch) params.search         = debouncedSearch;
      if (country)         params.country        = country;
      if (availableOnly)   params.available_only = "true";

      const res = await employerApi.getWorkers(params);
      if (res.success) {
        const d = res as unknown as WorkersResponse;
        const rows = d.data ?? [];
        setWorkers(prev => append ? [...prev, ...rows] : rows);
        setTotal(d.total ?? 0);
        setHasMore(pageNum * PAGE_SIZE < (d.total ?? 0));
      } else if (pageNum === 1) {
        setError(res.error ?? "Could not load workers.");
      }
    } catch {
      if (pageNum === 1) setError("Network error - check your connection.");
    } finally {
      if (pageNum === 1) setLoading(false); else setLoadingMore(false);
    }
  }, [debouncedSearch, country, availableOnly]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
    setWorkers([]);
    fetchWorkers(1);
  }, [fetchWorkers]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    fetchWorkers(next, true);
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <ToastDisplay toast={toast} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
      <div style={{ minWidth: 0 }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>Find workers</div>
        <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
          {!loading && `${total} worker${total !== 1 ? "s" : ""} found`}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        marginBottom: 24,
        flexWrap:     "wrap",
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search by name, profession, skill…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex:         "1 1 260px",
            height:       48,
            padding:      "0 14px",
            background:   "rgba(255,255,255,0.04)",
            border:       "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            color:        "#e4e4e7",
            fontSize:     15,
            fontFamily:   "inherit",
            outline:      "none",
            minWidth:     0,
          }}
        />

        {/* Country filter */}
        <input
          type="text"
          placeholder="Country…"
          value={country}
          onChange={e => setCountry(e.target.value)}
          style={{
            flex:         "0 1 160px",
            height:       48,
            padding:      "0 14px",
            background:   "rgba(255,255,255,0.04)",
            border:       "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            color:        "#e4e4e7",
            fontSize:     14,
            fontFamily:   "inherit",
            outline:      "none",
          }}
        />

        {/* Available only toggle */}
        <label style={{
          display:    "flex",
          alignItems: "center",
          gap:        8,
          cursor:     "pointer",
          userSelect: "none",
          padding:    "8px 14px",
          borderRadius: 10,
          border:     availableOnly
            ? "1px solid rgba(74,222,128,0.35)"
            : "1px solid rgba(255,255,255,0.1)",
          background: availableOnly
            ? "rgba(74,222,128,0.07)"
            : "rgba(255,255,255,0.03)",
          transition: "all 0.15s",
          whiteSpace: "nowrap",
        }}>
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={e => setAvailableOnly(e.target.checked)}
            style={{ display: "none" }}
          />
          {/* Custom checkbox */}
          <span style={{
            width:          16,
            height:         16,
            borderRadius:   4,
            border:         availableOnly ? "none" : "1.5px solid rgba(255,255,255,0.2)",
            background:     availableOnly ? "#4ade80" : "transparent",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
            fontSize:       10,
            color:          "#000",
            fontWeight:     800,
            transition:     "all 0.15s",
          }}>
            {availableOnly && "✓"}
          </span>
          <span style={{
            fontSize:   12,
            fontWeight: 600,
            color:      availableOnly ? "#4ade80" : "#71717a",
          }}>
            Available only
          </span>
        </label>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} retry={() => fetchWorkers(1)} title="Could not load workers" />
      ) : workers.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <EmptyState availableOnly={availableOnly} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map(w => (
            <WorkerCard key={w.userId} worker={w} onToggleGroup={handleToggleGroup} groupBusy={groupBusyId === w.userId} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            style={{
              padding:      "10px 32px",
              background:   "rgba(255,255,255,0.05)",
              border:       "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              color:        "#a1a1aa",
              fontSize:     13,
              fontWeight:   600,
              cursor:       loadingMore ? "not-allowed" : "pointer",
              opacity:      loadingMore ? 0.5 : 1,
              fontFamily:   "inherit",
            }}
          >
            {loadingMore ? "Loading…" : `Load more (${total - workers.length} remaining)`}
          </button>
        </div>
      )}
      </div>

      <GroupPanel
        members={groupMembers}
        pendingRequest={pendingQuoteRequest}
        latestSentQuote={latestSentQuote}
        requesting={requestingQuote}
        onRemove={workerId => handleToggleGroup(workerId, false)}
        onRequestQuote={handleRequestQuote}
      />
      </div>
    </div>
  );
}

export default function WorkersPage() {
  return (
    <Suspense fallback={<LoadingPage color="blue" />}>
      <WorkersContent />
    </Suspense>
  );
}
