"use client";
// frontend/src/app/(public)/jobs/JobsFilterClient.tsx
//
// Everything on /jobs that genuinely needs the browser: the filter form
// controls, the whole-card click-to-open quick-view slide-over, the Apply
// flow (auth check → fee preview → Stripe payment), and "Load more"
// pagination. page.tsx (a Server Component) fetches and renders the actual
// page-1 job list content directly in its own JSX so that content is in the
// initial HTML — this file only supplies interactivity around it, via a
// shared context (JobsInteractionProvider) so the click target, the Apply
// button, and the slide-over/modal all agree on which job is active.
//
// Filter changes navigate the URL (router.push/replace with new search
// params) rather than fetching client-side — Next.js re-runs the Server
// Component with the new searchParams, so results, filters, and the URL
// stay in sync the same way they always have, just server-driven now.

import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { publicJobsApi, workerApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { ToastDisplay, type ToastData, ErrorState } from "@/components/ui";
import type { PublicJobListRow } from "@/lib/jobs-ssr";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ── Types ──────────────────────────────────────────────────────────────────────
// Same shape the page previously used, widened from PublicJobListRow with
// the optional detail-only fields the slide-over fills in on open (list rows
// never include description/requirements/benefits — see jobs-ssr.ts).

export interface Job extends Omit<PublicJobListRow, "salaryMin" | "salaryMax"> {
  salaryMin: number | string;
  salaryMax: number | string;
  description?: string;
  requirements?: string;
  benefits?: string;
}

interface AuthState {
  loaded: boolean;
  isLoggedIn: boolean;
  role?: string;
  accountStatus?: string;
}

export type SortKey = "newest" | "salary_high" | "salary_low";

export interface Filters {
  search: string;
  country: string;
  category: string;
  contractTypes: string[];
  salaryMin: string;
  salaryMax: string;
  visaSupport: boolean;
  remote: boolean;
  skills: string[];
  sort: SortKey;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CONTRACT_OPTIONS = [
  { value: "FULL_TIME",  label: "Full-time"  },
  { value: "PART_TIME",  label: "Part-time"  },
  { value: "CONTRACT",   label: "Contract"   },
  { value: "TEMPORARY",  label: "Temporary"  },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "FREELANCE",  label: "Freelance"  },
];

export const CONTRACT_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  TEMPORARY: "Temporary", INTERNSHIP: "Internship", FREELANCE: "Freelance",
};

const EXP_LABEL: Record<number, string> = {
  0: "0–1 yrs", 1: "1–2 yrs", 2: "2–5 yrs", 5: "5–10 yrs", 10: "10+ yrs",
};

const EMPTY_FILTERS: Filters = {
  search: "", country: "", category: "", contractTypes: [],
  salaryMin: "", salaryMax: "", visaSupport: false, remote: false, skills: [], sort: "newest",
};

function filtersFromParams(p: URLSearchParams): Filters {
  return {
    search:        p.get("search")    ?? "",
    country:       p.get("country")   ?? "",
    category:      p.get("category")  ?? "",
    contractTypes: p.getAll("contract_type").flatMap(v => v.split(",")).filter(Boolean),
    salaryMin:     p.get("salary_min") ?? "",
    salaryMax:     p.get("salary_max") ?? "",
    visaSupport:   p.get("visa_support") === "true",
    remote:        p.get("remote") === "true",
    skills:        p.get("skills") ? (p.get("skills") as string).split(",").filter(Boolean) : [],
    sort:          (p.get("sort") as SortKey) ?? "newest",
  };
}

function filtersToParams(f: Filters): Record<string, string> {
  const p: Record<string, string> = { sort: f.sort };
  if (f.search)    p.search    = f.search;
  if (f.country)   p.country   = f.country;
  if (f.category)  p.category  = f.category;
  if (f.contractTypes.length) p.contract_type = f.contractTypes.join(",");
  if (f.salaryMin) p.salary_min = f.salaryMin;
  if (f.salaryMax) p.salary_max = f.salaryMax;
  if (f.visaSupport) p.visa_support = "true";
  if (f.remote)    p.remote = "true";
  if (f.skills.length) p.skills = f.skills.join(",");
  return p;
}

function hasActiveFilters(f: Filters): boolean {
  return !!(f.search || f.country || f.category || f.contractTypes.length ||
    f.salaryMin || f.salaryMax || f.visaSupport || f.remote || f.skills.length);
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30)  return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export function fmtSalary(job: { salaryMin?: number | string | null; salaryMax?: number | string | null; salaryCurrency: string }): string | null {
  const min = typeof job.salaryMin === "string" ? parseFloat(job.salaryMin) : job.salaryMin;
  const max = typeof job.salaryMax === "string" ? parseFloat(job.salaryMax) : job.salaryMax;
  if (!min || !max) return null;
  return `${job.salaryCurrency} ${min.toLocaleString()} – ${max.toLocaleString()} / mo`;
}

// External jobs may have only one of salaryMin/salaryMax (whatever the
// source board disclosed) — fmtSalary above requires both, so this is a
// separate, more permissive formatter rather than loosening fmtSalary's
// contract for every real job everywhere.
export function fmtExternalSalary(job: { salaryMin?: number | string | null; salaryMax?: number | string | null; salaryCurrency?: string }): string | null {
  const min = typeof job.salaryMin === "string" ? parseFloat(job.salaryMin) : job.salaryMin;
  const max = typeof job.salaryMax === "string" ? parseFloat(job.salaryMax) : job.salaryMax;
  if (!min && !max) return null;
  const cur = job.salaryCurrency ?? "";
  if (min && max) return `${cur} ${min.toLocaleString()} – ${max.toLocaleString()}`.trim();
  return `${cur} ${(min ?? max)!.toLocaleString()}`.trim();
}

// ── Tiny inline components ─────────────────────────────────────────────────────
// Kept here (not shared with page.tsx) because page.tsx is a Server
// Component and these are trivial/presentational enough that a shared file
// wasn't worth adding beyond the three files this pass touches; page.tsx
// defines its own copy of Chip for the server-rendered cards.

export function Chip({
  children, color = "gray",
}: { children: React.ReactNode; color?: "gray" | "teal" | "blue" | "violet" | "green" | "amber" }) {
  const s: Record<string, { color: string; bg: string; border: string }> = {
    gray:   { color: "#a1a1aa", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)"  },
    teal:   { color: "#5eead4", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.25)"  },
    blue:   { color: "#93c5fd", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.25)"  },
    violet: { color: "#c4b5fd", bg: "rgba(167,139,250,0.1)",  border: "rgba(167,139,250,0.25)" },
    green:  { color: "#86efac", bg: "rgba(74,222,128,0.1)",   border: "rgba(74,222,128,0.25)"  },
    amber:  { color: "#fcd34d", bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.25)"  },
  };
  const c = s[color];
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "6px 0", width: "100%", textAlign: "left" }}>
      <div style={{ width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: "relative",
        background: checked ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "rgba(255,255,255,0.1)", transition: "background 0.2s" }}>
        <div style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s", left: checked ? 18 : 2, boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
      </div>
      <span style={{ fontSize: 13, color: "#a1a1aa", fontFamily: "inherit" }}>{label}</span>
    </button>
  );
}

function SkillTag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 6,
      background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#5eead4" }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#5eead4", padding: 0, lineHeight: 1, fontSize: 13, fontFamily: "inherit" }}>×</button>
      )}
    </span>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
    </svg>
  );
}

// ── Filter sidebar (form controls) ─────────────────────────────────────────────

function FilterFields({
  filters, onChange, categories, countries, onClear,
}: {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  categories: string[];
  countries: { country: string; count: number }[];
  onClear: () => void;
}) {
  const [skillInput, setSkillInput] = useState("");

  function addSkill() {
    const v = skillInput.trim();
    if (!v || filters.skills.includes(v)) { setSkillInput(""); return; }
    onChange({ skills: [...filters.skills, v] });
    setSkillInput("");
  }

  function toggleContract(val: string) {
    const next = filters.contractTypes.includes(val)
      ? filters.contractTypes.filter(c => c !== val)
      : [...filters.contractTypes, val];
    onChange({ contractTypes: next });
  }

  const LabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "block" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Search */}
      <div>
        <label style={LabelStyle}>Search</label>
        <input
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
          placeholder="Title, company, keyword…"
          className="input-glass" style={{ width: "100%", padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>

      {/* Country */}
      <div>
        <label style={LabelStyle}>Country</label>
        <select value={filters.country} onChange={e => onChange({ country: e.target.value })}
          className="input-glass" style={{ width: "100%", padding: "9px 12px", fontSize: 13, color: filters.country ? "#fff" : "#94a3b8", outline: "none", fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
          <option value="">All countries</option>
          {countries.map(c => (
            <option key={c.country} value={c.country} style={{ background: "#1e293b" }}>
              {c.country} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {/* Category */}
      <div>
        <label style={LabelStyle}>Category</label>
        <select value={filters.category} onChange={e => onChange({ category: e.target.value })}
          className="input-glass" style={{ width: "100%", padding: "9px 12px", fontSize: 13, color: filters.category ? "#fff" : "#94a3b8", outline: "none", fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c} style={{ background: "#1e293b" }}>{c}</option>)}
        </select>
      </div>

      {/* Contract type */}
      <div>
        <label style={LabelStyle}>Contract type</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CONTRACT_OPTIONS.map(opt => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#a1a1aa" }}>
              <input type="checkbox" checked={filters.contractTypes.includes(opt.value)}
                onChange={() => toggleContract(opt.value)}
                style={{ accentColor: "#14b8a6", width: 14, height: 14, cursor: "pointer" }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Salary */}
      <div>
        <label style={LabelStyle}>Salary range</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" value={filters.salaryMin} onChange={e => onChange({ salaryMin: e.target.value })}
            placeholder="Min" className="input-glass" style={{ flex: 1, padding: "9px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", minWidth: 0 }} />
          <input type="number" value={filters.salaryMax} onChange={e => onChange({ salaryMax: e.target.value })}
            placeholder="Max" className="input-glass" style={{ flex: 1, padding: "9px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", minWidth: 0 }} />
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Toggle checked={filters.visaSupport} onChange={v => onChange({ visaSupport: v })} label="Visa support" />
        <Toggle checked={filters.remote} onChange={v => onChange({ remote: v })} label="Remote only" />
      </div>

      {/* Skills */}
      <div>
        <label style={LabelStyle}>Required skills</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {filters.skills.map(s => (
            <SkillTag key={s} label={s} onRemove={() => onChange({ skills: filters.skills.filter(x => x !== s) })} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
            placeholder="Add skill…"
            className="input-glass" style={{ flex: 1, padding: "7px 10px", fontSize: 12, outline: "none", fontFamily: "inherit", minWidth: 0 }} />
          <button onClick={addSkill} style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 8, padding: "7px 12px", color: "#5eead4", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+</button>
        </div>
      </div>

      {/* Clear */}
      {hasActiveFilters(filters) && (
        <button onClick={onClear}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#71717a", padding: "4px 0", textAlign: "left", fontFamily: "inherit", textDecoration: "underline" }}>
          Clear all filters
        </button>
      )}
    </div>
  );
}

// Public entry point — the sidebar (desktop, always visible) + mobile
// toggle bar. Reads the CURRENT filters from the URL (useSearchParams) so it
// stays in sync with whatever page.tsx server-rendered from the same
// params, and writes changes back via router.push — that navigation is what
// triggers page.tsx to re-fetch and re-render server-side with the new
// filters, replacing the old client-side debounced-fetch-on-change.
export function JobsFilterClient({
  categories, countries,
}: {
  categories: string[];
  countries: { country: string; count: number }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback((next: Filters) => {
    const params = new URLSearchParams();
    Object.entries(filtersToParams(next)).forEach(([k, v]) => params.set(k, v));
    const url = params.toString() ? `/jobs?${params.toString()}` : "/jobs";
    router.push(url, { scroll: false });
  }, [router]);

  function updateFilters(partial: Partial<Filters>) {
    const next = { ...filters, ...partial };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(next), 400);
  }

  function clearFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate(EMPTY_FILTERS);
  }

  const activeFilterCount = [
    filters.search, filters.country, filters.category,
    ...filters.contractTypes, filters.salaryMin, filters.salaryMax,
    filters.visaSupport && "v", filters.remote && "r", ...filters.skills,
  ].filter(Boolean).length;

  return (
    <>
      {/* Mobile filter toggle */}
      <div style={{ display: "none" }} className="mobile-filter-bar">
        <div style={{ padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => setMobileOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 16px", cursor: "pointer", color: "#a1a1aa", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
            <FilterIcon /> Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        </div>

        {mobileOpen && (
          <div style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <FilterFields filters={filters} onChange={updateFilters} categories={categories} countries={countries} onClear={clearFilters} />
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <div style={{ width: 260, flexShrink: 0, position: "sticky", top: 88 }} className="desktop-sidebar">
        <div style={{ background: "rgba(30,41,59,0.6)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Filters</div>
          <FilterFields filters={filters} onChange={updateFilters} categories={categories} countries={countries} onClear={clearFilters} />
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .desktop-sidebar { display: none !important; }
          .mobile-filter-bar { display: block !important; }
        }
      `}</style>
    </>
  );
}

// Sort bar — same navigate-on-change mechanism as the filter fields, kept
// separate since it renders inline in page.tsx's results header rather than
// inside the sidebar.
export function SortBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const SORTS: { key: SortKey; label: string }[] = [
    { key: "newest",      label: "Newest" },
    { key: "salary_high", label: "Salary: high to low" },
    { key: "salary_low",  label: "Salary: low to high" },
  ];

  function setSort(sort: SortKey) {
    const params = new URLSearchParams();
    Object.entries(filtersToParams({ ...filters, sort })).forEach(([k, v]) => params.set(k, v));
    router.push(`/jobs?${params.toString()}`, { scroll: false });
  }

  return (
    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 3 }}>
      {SORTS.map(s => (
        <button key={s.key} onClick={() => setSort(s.key)}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: s.key === filters.sort ? 700 : 500, border: "none", cursor: "pointer", fontFamily: "inherit", background: s.key === filters.sort ? "#1f1f1f" : "transparent", color: s.key === filters.sort ? "#fff" : "#71717a", boxShadow: s.key === filters.sort ? "0 1px 4px rgba(0,0,0,0.4)" : "none", transition: "all 0.15s" }}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Apply modal ────────────────────────────────────────────────────────────────

interface FeeData {
  feeCents:   number;
  feeDisplay: string;
  breakdown: {
    base:             number;
    regionMultiplier: number;
    salaryMultiplier: number;
    conversionAdj:    number;
    matchScore:       number;
  };
}

function ApplyPaymentForm({
  jobId, paymentIntentId, coverLetter, onSuccess, onBack,
}: {
  jobId:           string;
  paymentIntentId: string;
  coverLetter:     string;
  onSuccess:       () => void;
  onBack:          () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [paying, setPaying]   = useState(false);
  const [error,  setError]    = useState("");

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError("");

    const { error: stripeErr } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}${window.location.pathname}?dh_apply_job=${jobId}` },
    });

    if (stripeErr) {
      setError(stripeErr.message ?? "Payment failed. Please try again.");
      setPaying(false);
      return;
    }

    const res = await workerApi.confirmApplication(jobId, {
      paymentIntentId,
      ...(coverLetter ? { coverLetter } : {}),
    });

    if (res.success) {
      onSuccess();
    } else {
      setError((res as { error?: string }).error ?? "Application could not be confirmed. Contact support.");
      setPaying(false);
    }
  }

  return (
    <form onSubmit={handlePay}>
      <div style={{ marginBottom: 16 }}>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      {error && (
        <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={paying}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 18px", color: "#a1a1aa", cursor: paying ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={paying || !stripe || !elements}
          style={{ flex: 1, background: paying ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#14b8a6,#0d9488)", border: "none", borderRadius: 10, padding: "9px 22px", color: "#fff", cursor: paying ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {paying && <div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
          {paying ? "Processing…" : "Pay & submit application"}
        </button>
      </div>
    </form>
  );
}

function ApplyModal({
  job, onSuccess, onCancel,
}: {
  job:       Job;
  onSuccess: (jobId: string) => void;
  onCancel:  () => void;
}) {
  const [phase,           setPhase]           = useState<"form" | "payment">("form");
  const [coverLetter,     setCoverLetter]      = useState("");
  const [feeLoading,      setFeeLoading]       = useState(true);
  const [fee,             setFee]              = useState<FeeData | null>(null);
  const [showBreakdown,   setShowBreakdown]    = useState(false);
  const [submitting,      setSubmitting]       = useState(false);
  const [submitError,     setSubmitError]      = useState("");
  const [clientSecret,    setClientSecret]     = useState("");
  const [paymentIntentId, setPaymentIntentId]  = useState("");
  const [actualFeeCents,  setActualFeeCents]   = useState(0);
  const [actualFeeDisplay, setActualFeeDisplay] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !submitting) onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  useEffect(() => {
    workerApi.getApplicationFee(job.id)
      .then(raw => {
        const res = raw as unknown as { success: boolean; data?: FeeData };
        if (res.success && res.data) setFee(res.data);
      })
      .catch(() => {/* non-blocking — still allow apply */})
      .finally(() => setFeeLoading(false));
  }, [job.id]);

  const previewFeeCents   = fee?.feeCents ?? 0;
  const previewFeeDisplay = fee?.feeDisplay ?? "";

  async function handleApply() {
    setSubmitting(true);
    setSubmitError("");

    const res = await workerApi.applyToJob(
      job.id,
      coverLetter.trim() ? { cover_letter: coverLetter.trim() } : undefined,
    ) as {
      success: boolean;
      data?: {
        requiresPayment: boolean;
        clientSecret?:   string;
        paymentIntentId?: string;
        feeCents?:       number;
        feeDisplay?:     string;
        applicationId?:  string;
      };
      error?: string;
    };

    if (!res.success) {
      setSubmitting(false);
      setSubmitError(res.error ?? "Could not submit application. Please try again.");
      return;
    }

    const data = res.data!;

    if (!data.requiresPayment) {
      onSuccess(job.id);
      return;
    }

    setClientSecret(data.clientSecret ?? "");
    setPaymentIntentId(data.paymentIntentId ?? "");
    setActualFeeCents(data.feeCents ?? 0);
    setActualFeeDisplay(data.feeDisplay ?? "");
    setSubmitting(false);
    setPhase("payment");
  }

  return (
    <div
      className="glass-scrim"
      style={{ zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
    >
      <div className="glass-modal" style={{ padding: 28, maxWidth: 480, width: "100%" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
          Apply for {job.title}
        </div>
        <div style={{ fontSize: 12, color: "#71717a", marginBottom: 18 }}>{job.companyName}</div>

        {phase === "form" && (
          <>
            <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {feeLoading ? (
                <span style={{ fontSize: 13, color: "#555" }}>Calculating fee…</span>
              ) : previewFeeCents === 0 ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: "#4ade80" }}>✓ Free application</span>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#a1a1aa" }}>Application fee</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{previewFeeDisplay}</span>
                  </div>
                  <button
                    onClick={() => setShowBreakdown(v => !v)}
                    style={{ marginTop: 6, fontSize: 11, color: "#555", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                  >
                    {showBreakdown ? "Hide" : "Show"} breakdown ▾
                  </button>
                  {showBreakdown && fee?.breakdown && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#555", lineHeight: 1.8 }}>
                      <div>Base fee: ${(fee.breakdown.base / 100).toFixed(2)}</div>
                      <div>Region demand: ×{fee.breakdown.regionMultiplier.toFixed(1)}</div>
                      <div>Salary tier: ×{fee.breakdown.salaryMultiplier}</div>
                      <div>Match adjustment: ×{fee.breakdown.conversionAdj}</div>
                      <div style={{ marginTop: 4, color: "#71717a" }}>Your match score: {fee.breakdown.matchScore.toFixed(0)}%</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Cover letter (optional)
            </label>
            <textarea
              value={coverLetter}
              onChange={e => setCoverLetter(e.target.value)}
              placeholder="Tell the employer why you're a great fit..."
              rows={5}
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", outline: "none", marginBottom: 20 }}
            />

            {submitError && (
              <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{submitError}</div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={onCancel}
                disabled={submitting}
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 18px", color: "#a1a1aa", cursor: submitting ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={submitting || feeLoading}
                style={{ background: submitting || feeLoading ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#14b8a6,#0d9488)", border: "none", borderRadius: 10, padding: "9px 22px", color: "#fff", cursor: submitting || feeLoading ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}
              >
                {submitting && <div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
                {submitting
                  ? "Processing…"
                  : previewFeeCents > 0
                    ? `Apply & Pay ${previewFeeDisplay}`
                    : "Submit application"}
              </button>
            </div>
          </>
        )}

        {phase === "payment" && clientSecret && (
          <>
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#a1a1aa" }}>Application fee</span>
                <span style={{ fontWeight: 700, color: "#fff" }}>{actualFeeDisplay || `$${(actualFeeCents / 100).toFixed(2)}`}</span>
              </div>
              <div style={{ fontSize: 11, color: "#14b8a6", marginTop: 4 }}>
                One-time fee · non-refundable
              </div>
            </div>

            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#14b8a6" } } }}>
              <ApplyPaymentForm
                jobId={job.id}
                paymentIntentId={paymentIntentId}
                coverLetter={coverLetter.trim()}
                onSuccess={() => onSuccess(job.id)}
                onBack={() => { setPhase("form"); setSubmitError(""); }}
              />
            </Elements>
          </>
        )}
      </div>
    </div>
  );
}

// ── Slide-over detail panel ────────────────────────────────────────────────────

function SlideOver({
  job, onClose, onApply, applying, applied, auth,
}: {
  job: Job | null;
  onClose: () => void;
  onApply: (id: string) => void;
  applying: boolean;
  applied: boolean;
  auth: AuthState;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!job) return null;

  const salary = fmtSalary(job);
  const deadline = job.applicationDeadline ? daysLeft(job.applicationDeadline) : null;
  const deadlineUrgent = deadline !== null && deadline <= 7;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", zIndex: 200 }} />

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
        width: "min(560px, 100vw)",
        background: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderLeft: "1px solid rgba(255,255,255,0.1)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", position: "sticky", top: 0, background: "rgba(15,23,42,0.7)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: 6 }}>{job.title}</div>
              <div style={{ fontSize: 13, color: "#71717a" }}>{job.companyName} · {[job.city, job.country].filter(Boolean).join(", ")}</div>
            </div>
            <button onClick={onClose} style={{ flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#a1a1aa", fontSize: 18, fontFamily: "inherit" }}>
              ×
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
            {job.contractType && <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>}
            {job.remoteAllowed && <Chip color="blue">Remote</Chip>}
            {job.visaSupport && <Chip color="teal">Visa support</Chip>}
            {job.accommodation && <Chip color="blue">Accommodation</Chip>}
            {salary && <Chip color="green">{salary}</Chip>}
          </div>

          {deadline !== null && (
            <div style={{ marginTop: 10, fontSize: 12, color: deadlineUrgent ? "#fcd34d" : "#71717a", fontWeight: deadlineUrgent ? 700 : 400 }}>
              {deadlineUrgent ? `⚠ ` : ""}
              {deadline > 0 ? `${deadline} days left to apply` : "Application closed"}
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              ["Salary",      salary],
              ["Experience",  job.experienceRequired !== undefined ? EXP_LABEL[job.experienceRequired] ?? `${job.experienceRequired}+ yrs` : null],
              ["Positions",   job.positionsAvailable],
              ["Category",    job.category],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={String(label)}>
                <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: "#e4e4e7" }}>{String(value)}</div>
              </div>
            ))}
          </div>

          {(job.requiredSkills ?? []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Required Skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(job.requiredSkills ?? []).map(s => <SkillTag key={s} label={s} />)}
              </div>
            </div>
          )}

          {(job.languagesRequired ?? []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Languages</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(job.languagesRequired ?? []).map(l => <Chip key={l} color="blue">{l}</Chip>)}
              </div>
            </div>
          )}

          {job.description && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>About this role</div>
              <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{job.description}</p>
            </div>
          )}

          {job.requirements && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Requirements</div>
              <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{job.requirements}</p>
            </div>
          )}

          {job.benefits && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Benefits</div>
              <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{job.benefits}</p>
            </div>
          )}

          {auth.loaded && auth.isLoggedIn && auth.role === "WORKER" && auth.accountStatus !== "VERIFIED" && (
            <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: 16, fontSize: 13, color: "#fcd34d", lineHeight: 1.6 }}>
              Your account is under review. You can apply once approved.
            </div>
          )}
          {auth.loaded && auth.isLoggedIn && auth.role === "EMPLOYER" && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16, fontSize: 13, color: "#71717a", lineHeight: 1.6 }}>
              Log in as a worker to apply for this position.
            </div>
          )}
        </div>

        <div style={{ padding: "20px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(15,23,42,0.7)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
          {!auth.loaded ? null : !auth.isLoggedIn ? (
            <Link href="/login?redirect=/jobs"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 48, borderRadius: 12, background: "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" }}>
              Sign in to apply
            </Link>
          ) : auth.role === "WORKER" && auth.accountStatus === "VERIFIED" ? (
            applied ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 48, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#555", fontSize: 15, fontWeight: 600, gap: 8 }}>
                ✓ Applied
              </div>
            ) : (
              <button
                onClick={() => onApply(job.id)}
                disabled={applying}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 48, borderRadius: 12, background: applying ? "rgba(99,102,241,0.4)" : "linear-gradient(135deg,#14b8a6,#0d9488)", border: "none", color: "#fff", fontSize: 15, fontWeight: 700, cursor: applying ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: applying ? "none" : "0 4px 16px rgba(99,102,241,0.35)", transition: "all 0.15s" }}>
                {applying ? "Submitting application…" : "Apply now"}
              </button>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}

// ── Shared interaction state (click-to-slideover, apply flow, applied set) ─────

interface JobsInteraction {
  auth: AuthState;
  applyingId: string | null;
  appliedJobIds: Set<string>;
  openJob: (job: Job) => void;
  handleApply: (jobId: string, jobs: Job[]) => void;
}

const JobsInteractionContext = createContext<JobsInteraction | null>(null);

export function useJobsInteraction(): JobsInteraction {
  const ctx = useContext(JobsInteractionContext);
  if (!ctx) throw new Error("useJobsInteraction must be used inside JobsInteractionProvider");
  return ctx;
}

// Wraps the whole results area. Owns the slide-over/modal/applied state that
// used to live in the page component directly, and renders the SlideOver +
// ApplyModal + toast as overlays alongside whatever server-rendered card
// grid is passed as children.
export function JobsInteractionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyModalJob, setApplyModalJob] = useState<Job | null>(null);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastData>(null);

  const { auth: rawAuth, loading: authLoading } = useAuth();
  const auth: AuthState = authLoading
    ? { loaded: false, isLoggedIn: false }
    : rawAuth.isLoggedIn
      ? { loaded: true, isLoggedIn: true, role: rawAuth.role ?? undefined, accountStatus: rawAuth.user?.accountStatus }
      : { loaded: true, isLoggedIn: false };

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const authIsWorker = auth.isLoggedIn && auth.role === "WORKER" && auth.accountStatus === "VERIFIED";

  // Pre-load applied job IDs once auth is confirmed as a verified worker
  useEffect(() => {
    if (!authIsWorker) return;
    workerApi.getApplications({ limit: "200" }).then(r => {
      if (r.success) {
        const ids = ((r.data as { job: { id: string } }[]) ?? []).map(a => a.job.id);
        setAppliedJobIds(new Set(ids));
      } else {
        console.error("[jobs] applied-jobs fetch failed:", r.error);
      }
    }).catch(err => console.error("[jobs] applied-jobs fetch failed:", err));
  }, [authIsWorker]);

  // Clean up any legacy Stripe Checkout query params left in the URL
  useEffect(() => {
    const hasCancelParam = searchParams.get("apply_canceled") === "1";
    const hasAppliedParam = searchParams.get("applied") === "1";
    if (hasCancelParam || hasAppliedParam) router.replace("/jobs");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume after a real off-platform redirect (3DS, bank methods) — see
  // ApplyPaymentForm's return_url and the confirmApplication contract.
  useEffect(() => {
    const clientSecret = searchParams.get("payment_intent_client_secret");
    const jobId = searchParams.get("dh_apply_job");
    if (!clientSecret || !jobId) return;

    (async () => {
      const stripe = await stripePromise;
      if (!stripe) return;
      const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);

      if (paymentIntent?.status === "succeeded") {
        const res = await workerApi.confirmApplication(jobId, { paymentIntentId: paymentIntent.id });
        if (res.success) {
          setAppliedJobIds(prev => new Set([...prev, jobId]));
          showToast("Application submitted successfully!", "ok");
        } else {
          showToast((res as { error?: string }).error ?? "Payment succeeded but application could not be confirmed — contact support.", "err");
        }
      } else {
        showToast("Payment was not completed. Please try again.", "err");
      }

      router.replace("/jobs");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openJob(job: Job) {
    setSelectedJob(job);
    setDetailError(null);
    if (!job.description) {
      setDetailLoading(true);
      try {
        const res = await publicJobsApi.getJob(job.id);
        if (res.success) {
          const full = res.data as Job;
          setSelectedJob(full);
        } else {
          setDetailError(res.error ?? "Could not load job details.");
        }
      } catch {
        setDetailError("Network error - check your connection.");
      } finally {
        setDetailLoading(false);
      }
    }
  }

  function handleApply(jobId: string, jobs: Job[]) {
    if (!auth.isLoggedIn) { router.push("/login?redirect=/jobs"); return; }
    const job = jobs.find(j => j.id === jobId) ?? selectedJob;
    if (job) setApplyModalJob(job);
  }

  function handleApplySuccess(jobId: string) {
    setApplyModalJob(null);
    setAppliedJobIds(prev => new Set([...prev, jobId]));
    showToast("Application submitted successfully!", "ok");
  }

  return (
    <JobsInteractionContext.Provider value={{ auth, applyingId, appliedJobIds, openJob, handleApply }}>
      <ToastDisplay toast={toast} />

      {applyModalJob && (
        <ApplyModal
          job={applyModalJob}
          onSuccess={handleApplySuccess}
          onCancel={() => setApplyModalJob(null)}
        />
      )}

      <SlideOver
        job={detailLoading || detailError ? null : selectedJob}
        onClose={() => { setSelectedJob(null); setDetailError(null); }}
        onApply={id => handleApply(id, selectedJob ? [selectedJob] : [])}
        applying={applyingId === selectedJob?.id}
        applied={selectedJob ? appliedJobIds.has(selectedJob.id) : false}
        auth={auth}
      />
      {selectedJob && detailLoading && (
        <>
          <div onClick={() => setSelectedJob(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", zIndex: 200 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px,100vw)", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderLeft: "1px solid rgba(255,255,255,0.1)", zIndex: 201, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(99,102,241,0.2)", borderTop: "2px solid #14b8a6", animation: "spin 0.8s linear infinite" }} />
          </div>
        </>
      )}
      {selectedJob && detailError && (
        <>
          <div onClick={() => { setSelectedJob(null); setDetailError(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", zIndex: 200 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px,100vw)", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderLeft: "1px solid rgba(255,255,255,0.1)", zIndex: 201, display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
            <ErrorState
              message={detailError}
              retry={() => selectedJob && openJob(selectedJob)}
              title="Could not load job details"
            />
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {children}
    </JobsInteractionContext.Provider>
  );
}

// ── Per-card interactivity wrapper ──────────────────────────────────────────────
// Wraps server-rendered card content (children): adds the whole-card click
// (opens the slide-over), hover state, and the Apply button/CTA — all of
// which need client state (auth, applying/applied) that a Server Component
// can't hold. The card's title/company/salary/chips/skills stay exactly
// where page.tsx put them (as `children`), so they're still part of the
// initial server-rendered HTML; this wrapper only adds behavior around them.

export function JobCardInteractive({ job, allJobs, children }: { job: Job; allJobs: Job[]; children: React.ReactNode }) {
  const { auth, applyingId, appliedJobIds, openJob, handleApply } = useJobsInteraction();
  const [hovered, setHovered] = useState(false);
  const applied = appliedJobIds.has(job.id);
  const applying = applyingId === job.id;

  return (
    <div
      onClick={() => openJob(job)}
      style={{
        background: hovered ? "rgba(30,41,59,0.8)" : "rgba(30,41,59,0.6)",
        border: hovered ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16, padding: 20, cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}

      {/* Apply button */}
      <div onClick={e => e.stopPropagation()} style={{ marginTop: 4 }}>
        {!auth.isLoggedIn ? (
          <Link href="/login?redirect=/jobs"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 36, padding: "0 18px", borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#a1a1aa", fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: "inherit" }}>
            Sign in to apply
          </Link>
        ) : auth.role === "WORKER" && auth.accountStatus === "VERIFIED" ? (
          applied ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 36, padding: "0 16px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#555", fontSize: 12, fontWeight: 600 }}>
              ✓ Applied
            </span>
          ) : (
            <button
              onClick={() => handleApply(job.id, allJobs)}
              disabled={applying}
              style={{ height: 36, padding: "0 18px", borderRadius: 9, background: applying ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg,#14b8a6,#0d9488)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: applying ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "opacity 0.15s" }}>
              {applying ? "Applying…" : "Apply now"}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

// ── Load more (client-side pagination continuation) ─────────────────────────────
// page.tsx server-renders page 1 only. Clicking "Load more" fetches
// subsequent pages via the same browser-side publicJobsApi.getJobs() the
// page always used, and appends cards here — this content is inherently
// client-only (it doesn't exist until a visitor clicks), so it's out of
// scope for "content in initial HTML" and renders its own copy of the card
// display since it can't reuse page.tsx's server-only render functions.

function ClientJobCardContent({ job }: { job: Job }) {
  const salary = fmtSalary(job);
  const skills = job.requiredSkills ?? [];
  const visibleSkills = skills.slice(0, 4);
  const extra = skills.length - 4;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <Link
            href={`/jobs/${job.id}`}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4, display: "block", textDecoration: "none" }}
          >
            {job.title}
          </Link>
          <div style={{ fontSize: 12, color: "#71717a" }}>
            {job.companyName} · {[job.city, job.country].filter(Boolean).join(", ")}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>{timeAgo(job.createdAt)}</div>
      </div>

      {salary && <div style={{ fontSize: 13, fontWeight: 600, color: "#86efac", marginBottom: 10 }}>{salary}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {job.contractType && <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>}
        {job.remoteAllowed && <Chip color="blue">Remote</Chip>}
        {job.visaSupport && <Chip color="teal">Visa support</Chip>}
        {job.accommodation && <Chip color="blue">Accommodation</Chip>}
      </div>

      {visibleSkills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
          {visibleSkills.map(s => (
            <span key={s} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }}>{s}</span>
          ))}
          {extra > 0 && <span style={{ fontSize: 11, color: "#555", alignSelf: "center" }}>+{extra} more</span>}
        </div>
      )}
    </>
  );
}

function ClientExternalJobCard({ job }: { job: Job }) {
  const salary = fmtExternalSalary(job);
  return (
    <div style={{ background: "rgba(30,41,59,0.6)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4 }}>{job.title}</div>
          <div style={{ fontSize: 12, color: "#71717a" }}>{[job.city, job.country].filter(Boolean).join(", ")}</div>
        </div>
        <Chip color="amber">External</Chip>
      </div>
      {salary && <div style={{ fontSize: 13, fontWeight: 600, color: "#86efac", marginBottom: 10 }}>{salary}</div>}
      {job.contractType && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>Hosted on {job.sourceName} — opens in a new tab.</div>
      <a
        href={job.externalUrl}
        target="_blank"
        rel="noopener nofollow sponsored"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 36, padding: "0 18px", borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
      >
        View on {job.sourceName} ↗
      </a>
    </div>
  );
}

export function LoadMoreJobs({
  initialCount, total,
}: {
  initialCount: number;
  total: number;
}) {
  const searchParams = useSearchParams();
  const [extraJobs, setExtraJobs] = useState<Job[]>([]);
  const [page, setPage] = useState(1); // page 1 already rendered server-side
  const [loading, setLoading] = useState(false);

  const loadedCount = initialCount + extraJobs.length;
  if (loadedCount >= total) {
    return extraJobs.length === 0 ? null : <ExtraGrid jobs={extraJobs} />;
  }

  async function loadMore() {
    setLoading(true);
    const params: Record<string, string> = {};
    searchParams.forEach((v, k) => { params[k] = v; });
    params.page = String(page + 1);
    params.limit = "20";
    try {
      const res = await publicJobsApi.getJobs(params);
      if (res.success) {
        setExtraJobs(prev => [...prev, ...((res.data as Job[]) ?? [])]);
        setPage(p => p + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {extraJobs.length > 0 && <ExtraGrid jobs={extraJobs} />}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
        <button
          onClick={loadMore}
          disabled={loading}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "11px 32px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#a1a1aa"; }}>
          {loading ? "Loading…" : `Load more (${(total - loadedCount).toLocaleString()} remaining)`}
        </button>
      </div>
    </>
  );
}

function ExtraGrid({ jobs }: { jobs: Job[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      {jobs.map(job => job.source === "external" ? (
        <ClientExternalJobCard key={job.id} job={job} />
      ) : (
        <JobCardInteractive key={job.id} job={job} allJobs={jobs}>
          <ClientJobCardContent job={job} />
        </JobCardInteractive>
      ))}
    </div>
  );
}
