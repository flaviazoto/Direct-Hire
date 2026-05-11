"use client";
// src/app/(app)/employer/workers/page.tsx
// Employer-facing worker search page with lock visibility.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { employerApi } from "@/lib/api-client";
import { LoadingPage, ToastDisplay, type ToastData } from "@/components/ui";

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

function WorkerCard({ worker }: { worker: WorkerResult }) {
  const aColor      = avatarColor(worker.name);
  const locked      = worker.is_locked;
  const hasProfile  = worker.has_profile;
  const statusBadge = STATUS_BADGE[worker.account_status] ?? STATUS_BADGE.PENDING_EMAIL_VERIFICATION;

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

// ── Main content ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

function WorkersContent() {
  const [workers,       setWorkers]       = useState<WorkerResult[]>([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [hasMore,       setHasMore]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [search,        setSearch]        = useState("");
  const [country,       setCountry]       = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [toast,         setToast]         = useState<ToastData>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchWorkers = useCallback(async (pageNum: number, append = false) => {
    if (pageNum === 1) setLoading(true); else setLoadingMore(true);
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
      }
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
      ) : workers.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <EmptyState availableOnly={availableOnly} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map(w => <WorkerCard key={w.userId} worker={w} />)}
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
  );
}

export default function WorkersPage() {
  return (
    <Suspense fallback={<LoadingPage color="blue" />}>
      <WorkersContent />
    </Suspense>
  );
}
