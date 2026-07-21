"use client";
// src/app/jobs/page.tsx
// Public job board — no auth required to browse.
// Authenticated workers can apply directly; guests are redirected to login.

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { publicJobsApi, workerApi } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { ToastDisplay, type ToastData, ErrorState } from "@/components/ui";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ── Types ──────────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  title: string;
  companyName: string;
  country: string;
  city: string;
  category: string;
  contractType: string;
  salaryMin: number | string;
  salaryMax: number | string;
  salaryCurrency: string;
  remoteAllowed: boolean;
  visaSupport: boolean;
  accommodation: boolean;
  requiredSkills: string[];
  languagesRequired: string[];
  applicationDeadline?: string | null;
  positionsAvailable: number;
  viewCount: number;
  applicationCount: number;
  createdAt: string;
  // full detail (from /:id)
  description?: string;
  requirements?: string;
  benefits?: string;
  experienceRequired?: number;
  // External jobs (admin-pasted links — EURES, LinkedIn, Indeed, national
  // boards) share this same list response, tagged source: "external".
  // Real jobPost rows are tagged source: "jobpost". See
  // backend/src/lib/external-jobs.ts. Never has a /jobs/[id] detail page —
  // its canonical home is the external site.
  source?: "jobpost" | "external";
  sourceName?: string;
  externalUrl?: string;
}

interface AuthState {
  loaded: boolean;
  isLoggedIn: boolean;
  role?: string;
  accountStatus?: string;
}

type SortKey = "newest" | "salary_high" | "salary_low";

interface Filters {
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

const CONTRACT_LABEL: Record<string, string> = {
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

function filtersFromParams(p: URLSearchParams | ReadonlyURLSearchParams): Filters {
  return {
    search:        p.get("search")    ?? "",
    country:       p.get("country")   ?? "",
    category:      p.get("category")  ?? "",
    contractTypes: p.getAll("contract_type"),
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

function timeAgo(iso: string): string {
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

function fmtSalary(job: Job): string | null {
  const min = typeof job.salaryMin === "string" ? parseFloat(job.salaryMin) : job.salaryMin;
  const max = typeof job.salaryMax === "string" ? parseFloat(job.salaryMax) : job.salaryMax;
  if (!min || !max) return null;
  return `${job.salaryCurrency} ${min.toLocaleString()} – ${max.toLocaleString()} / mo`;
}

// External jobs may have only one of salaryMin/salaryMax (whatever the
// source board disclosed) — fmtSalary above requires both, so this is a
// separate, more permissive formatter rather than loosening fmtSalary's
// contract for every real job everywhere.
function fmtExternalSalary(job: Job): string | null {
  const min = typeof job.salaryMin === "string" ? parseFloat(job.salaryMin) : job.salaryMin;
  const max = typeof job.salaryMax === "string" ? parseFloat(job.salaryMax) : job.salaryMax;
  if (!min && !max) return null;
  const cur = job.salaryCurrency ?? "";
  if (min && max) return `${cur} ${min.toLocaleString()} – ${max.toLocaleString()}`.trim();
  return `${cur} ${(min ?? max)!.toLocaleString()}`.trim();
}

// ── Tiny inline components ─────────────────────────────────────────────────────

function Chip({
  children, color = "gray",
}: { children: React.ReactNode; color?: "gray" | "teal" | "blue" | "violet" | "green" | "amber" }) {
  const s: Record<string, { color: string; bg: string; border: string }> = {
    gray:   { color: "#a1a1aa", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)"  },
    teal:   { color: "#5eead4", bg: "rgba(0,144,255,0.1)",   border: "rgba(0,144,255,0.25)"  },
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
      background: "rgba(0,144,255,0.1)", border: "1px solid rgba(0,144,255,0.25)", color: "#5eead4" }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#5eead4", padding: 0, lineHeight: 1, fontSize: 13, fontFamily: "inherit" }}>×</button>
      )}
    </span>
  );
}

// ── Filter sidebar ─────────────────────────────────────────────────────────────

function FilterSidebar({
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
          style={{ width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>

      {/* Country */}
      <div>
        <label style={LabelStyle}>Country</label>
        <select value={filters.country} onChange={e => onChange({ country: e.target.value })}
          style={{ width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: filters.country ? "#fff" : "#71717a", outline: "none", fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
          <option value="">All countries</option>
          {countries.map(c => (
            <option key={c.country} value={c.country} style={{ background: "#1a1a1a" }}>
              {c.country} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {/* Category */}
      <div>
        <label style={LabelStyle}>Category</label>
        <select value={filters.category} onChange={e => onChange({ category: e.target.value })}
          style={{ width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: filters.category ? "#fff" : "#71717a", outline: "none", fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c} style={{ background: "#1a1a1a" }}>{c}</option>)}
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
            placeholder="Min" style={{ flex: 1, background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit", minWidth: 0 }} />
          <input type="number" value={filters.salaryMax} onChange={e => onChange({ salaryMax: e.target.value })}
            placeholder="Max" style={{ flex: 1, background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit", minWidth: 0 }} />
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
            style={{ flex: 1, background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#fff", outline: "none", fontFamily: "inherit", minWidth: 0 }} />
          <button onClick={addSkill} style={{ background: "rgba(0,144,255,0.12)", border: "1px solid rgba(0,144,255,0.25)", borderRadius: 8, padding: "7px 12px", color: "#5eead4", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+</button>
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

// ── ApplyPaymentForm (must render inside <Elements>) ─────────────────────────

function ApplyPaymentForm({
  jobId,
  paymentIntentId,
  coverLetter,
  onSuccess,
  onBack,
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

    // return_url is required by Stripe even with redirect:"if_required" —
    // most payment methods never navigate away, but redirect-based ones
    // (3DS off-platform challenges, certain bank methods) do. dh_apply_job
    // tells the on-mount return handler below which job to resume confirming.
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

    // Payment succeeded — confirm with backend to create the application
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

// ── ApplyModal ────────────────────────────────────────────────────────────────

function ApplyModal({
  job,
  onSuccess,
  onCancel,
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
      // Free application — done
      onSuccess(job.id);
      return;
    }

    // Paid — move to payment phase
    setClientSecret(data.clientSecret ?? "");
    setPaymentIntentId(data.paymentIntentId ?? "");
    setActualFeeCents(data.feeCents ?? 0);
    setActualFeeDisplay(data.feeDisplay ?? "");
    setSubmitting(false);
    setPhase("payment");
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
    >
      <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 28, maxWidth: 480, width: "100%" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
          Apply for {job.title}
        </div>
        <div style={{ fontSize: 12, color: "#71717a", marginBottom: 18 }}>{job.companyName}</div>

        {/* ── Phase 1: cover letter + fee preview ── */}
        {phase === "form" && (
          <>
            {/* Fee card */}
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

        {/* ── Phase 2: Stripe inline payment ── */}
        {phase === "payment" && clientSecret && (
          <>
            {/* Confirmed cost summary */}
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

// ── Job card ───────────────────────────────────────────────────────────────────

function JobCard({
  job, onClick, onApply, applying, applied, auth,
}: {
  job: Job;
  onClick: () => void;
  onApply: (id: string) => void;
  applying: boolean;
  applied: boolean;
  auth: AuthState;
}) {
  const salary = fmtSalary(job);
  const skills = job.requiredSkills ?? [];
  const visibleSkills = skills.slice(0, 4);
  const extra = skills.length - 4;

  return (
    <div
      onClick={onClick}
      style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, cursor: "pointer", transition: "border-color 0.15s, background 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.background = "#1a1a1a"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "#161616"; }}
    >
      {/* Title row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          {/* Real, crawlable link to the SSR detail page — the rest of the
              card still opens the quick-view slide-over on click (see
              onClick on the outer div); this anchor is what lets Google (and
              anyone sharing a link) reach a specific job directly. */}
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

      {/* Salary */}
      {salary && <div style={{ fontSize: 13, fontWeight: 600, color: "#86efac", marginBottom: 10 }}>{salary}</div>}

      {/* Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {job.contractType && <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>}
        {job.remoteAllowed && <Chip color="blue">Remote</Chip>}
        {job.visaSupport && <Chip color="teal">Visa support</Chip>}
        {job.accommodation && <Chip color="blue">Accommodation</Chip>}
      </div>

      {/* Skills */}
      {visibleSkills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
          {visibleSkills.map(s => (
            <span key={s} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }}>{s}</span>
          ))}
          {extra > 0 && <span style={{ fontSize: 11, color: "#555", alignSelf: "center" }}>+{extra} more</span>}
        </div>
      )}

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
              onClick={() => onApply(job.id)}
              disabled={applying}
              style={{ height: 36, padding: "0 18px", borderRadius: 9, background: applying ? "rgba(0,144,255,0.3)" : "linear-gradient(135deg,#14b8a6,#0d9488)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: applying ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "opacity 0.15s" }}>
              {applying ? "Applying…" : "Apply now"}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

// External jobs never open the quick-view slide-over (there's no
// /jobs/[id] page for them — see backend/src/controllers/public-jobs.controller.ts) and
// never claim verification or run application-fee logic; the whole card is
// honest about being hosted elsewhere.
function ExternalJobCard({ job }: { job: Job }) {
  const salary = fmtExternalSalary(job);

  return (
    <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 4 }}>
            {job.title}
          </div>
          <div style={{ fontSize: 12, color: "#71717a" }}>
            {[job.city, job.country].filter(Boolean).join(", ")}
          </div>
        </div>
        <Chip color="amber">External</Chip>
      </div>

      {salary && <div style={{ fontSize: 13, fontWeight: 600, color: "#86efac", marginBottom: 10 }}>{salary}</div>}

      {job.contractType && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>
        </div>
      )}

      <div style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>
        Hosted on {job.sourceName} — opens in a new tab.
      </div>

      <a
        href={job.externalUrl}
        target="_blank"
        rel="noopener nofollow sponsored"
        onClick={e => e.stopPropagation()}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 36, padding: "0 18px", borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
      >
        View on {job.sourceName} ↗
      </a>
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
  // trap focus / close on Escape
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
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", zIndex: 200 }} />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
        width: "min(560px, 100vw)",
        background: "#161616",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", position: "sticky", top: 0, background: "#161616", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: 6 }}>{job.title}</div>
              <div style={{ fontSize: 13, color: "#71717a" }}>{job.companyName} · {[job.city, job.country].filter(Boolean).join(", ")}</div>
            </div>
            <button onClick={onClose} style={{ flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#a1a1aa", fontSize: 18, fontFamily: "inherit" }}>
              ×
            </button>
          </div>

          {/* Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
            {job.contractType && <Chip color="violet">{CONTRACT_LABEL[job.contractType] ?? job.contractType}</Chip>}
            {job.remoteAllowed && <Chip color="blue">Remote</Chip>}
            {job.visaSupport && <Chip color="teal">Visa support</Chip>}
            {job.accommodation && <Chip color="blue">Accommodation</Chip>}
            {salary && <Chip color="green">{salary}</Chip>}
          </div>

          {/* Deadline */}
          {deadline !== null && (
            <div style={{ marginTop: 10, fontSize: 12, color: deadlineUrgent ? "#fcd34d" : "#71717a", fontWeight: deadlineUrgent ? 700 : 400 }}>
              {deadlineUrgent ? `⚠ ` : ""}
              {deadline > 0 ? `${deadline} days left to apply` : "Application closed"}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Key facts */}
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

          {/* Skills */}
          {(job.requiredSkills ?? []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Required Skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(job.requiredSkills ?? []).map(s => <SkillTag key={s} label={s} />)}
              </div>
            </div>
          )}

          {/* Languages */}
          {(job.languagesRequired ?? []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Languages</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(job.languagesRequired ?? []).map(l => <Chip key={l} color="blue">{l}</Chip>)}
              </div>
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>About this role</div>
              <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{job.description}</p>
            </div>
          )}

          {/* Requirements */}
          {job.requirements && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Requirements</div>
              <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{job.requirements}</p>
            </div>
          )}

          {/* Benefits */}
          {job.benefits && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Benefits</div>
              <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{job.benefits}</p>
            </div>
          )}

          {/* Auth notices */}
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

        {/* Footer CTA */}
        <div style={{ padding: "20px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "#161616" }}>
          {!auth.loaded ? null : !auth.isLoggedIn ? (
            <Link href="/login?redirect=/jobs"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 48, borderRadius: 12, background: "linear-gradient(135deg,#0090FF,#0070cc)", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" }}>
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
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 48, borderRadius: 12, background: applying ? "rgba(0,144,255,0.4)" : "linear-gradient(135deg,#14b8a6,#0d9488)", border: "none", color: "#fff", fontSize: 15, fontWeight: 700, cursor: applying ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: applying ? "none" : "0 4px 16px rgba(0,144,255,0.35)", transition: "all 0.15s" }}>
                {applying ? "Submitting application…" : "Apply now"}
              </button>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}

// ── Main page content ──────────────────────────────────────────────────────────

function JobBoardContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [countries, setCountries]   = useState<{ country: string; count: number }[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [applyingId,    setApplyingId]    = useState<string | null>(null);
  const [applyModalJob, setApplyModalJob] = useState<Job | null>(null);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [toast,         setToast]         = useState<ToastData>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // ── Auth — sourced from root AuthContext (no extra fetch needed) ──────────
  const { auth: rawAuth, loading: authLoading } = useAuth();
  const auth: AuthState = authLoading
    ? { loaded: false, isLoggedIn: false }
    : rawAuth.isLoggedIn
      ? { loaded: true, isLoggedIn: true, role: rawAuth.role ?? undefined, accountStatus: rawAuth.user?.accountStatus }
      : { loaded: true, isLoggedIn: false };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Pre-load applied job IDs once auth is confirmed as a verified worker
  const authIsWorker = auth.isLoggedIn && (auth as { role?: string }).role === "WORKER"
    && (auth as { accountStatus?: string }).accountStatus === "VERIFIED";

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

  // ── Resume after a real off-platform redirect (3DS, bank methods) ─────────
  // redirect: "if_required" means most payment methods never leave this page,
  // but the few that do land back here with Stripe's own payment_intent /
  // payment_intent_client_secret query params appended, plus our own
  // dh_apply_job marker (set in ApplyPaymentForm's return_url) saying which
  // job to resume confirming. Runs once on mount; the apply modal is already
  // closed on a fresh page load, so this surfaces the result via toast the
  // same way handleApplySuccess already does — no cover letter is resent
  // (lost with the reloaded page state), matching the confirmApplication
  // contract where coverLetter is optional.
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

  // ── Fetch meta (categories + countries) once ─────────────────────────────

  useEffect(() => {
    Promise.all([publicJobsApi.getCategories(), publicJobsApi.getCountries()]).then(([catRes, ctryRes]) => {
      if (catRes.success) setCategories((catRes.data as string[]) ?? []);
      else console.error("[jobs] categories fetch failed:", catRes.error);
      if (ctryRes.success) setCountries((ctryRes.data as { country: string; count: number }[]) ?? []);
      else console.error("[jobs] countries fetch failed:", ctryRes.error);
    }).catch(err => console.error("[jobs] filter-meta fetch failed:", err));
  }, []);

  // ── Build API query params ────────────────────────────────────────────────

  const apiParams = useMemo(() => {
    const p = filtersToParams(filters);
    p.page  = String(page);
    p.limit = "20";
    // Opt-in flag — ONLY this page passes it. The sitemap/detail-page SSR
    // helpers (lib/jobs-ssr.ts) call the same /public/jobs endpoint without
    // it, so external jobs structurally never reach the sitemap.
    p.includeExternal = "true";
    return p;
  }, [filters, page]);

  // ── Whether the next page should be appended (load more) vs replace ─────

  const isAppend = useRef(false);

  // ── Fetch jobs (debounced) ────────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    const append = isAppend.current;
    if (append) setLoadingMore(true); else { setLoading(true); setError(null); }

    try {
      const res = await publicJobsApi.getJobs(apiParams);
      if (res.success) {
        const rows = (res.data as Job[]) ?? [];
        setJobs(prev => append ? [...prev, ...rows] : rows);
        setTotal((res as { total?: number }).total ?? 0);
        if (!append) setError(null);
      } else if (!append) {
        setError(res.error ?? "Could not load jobs.");
      }
    } catch {
      if (!append) setError("Network error - check your connection.");
    } finally {
      isAppend.current = false;
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, [apiParams]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchJobs(), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchJobs]);

  // ── Update URL params when filters change ─────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams();
    const f = filtersToParams(filters);
    Object.entries(f).forEach(([k, v]) => params.set(k, v));
    const newUrl = params.toString() ? `/jobs?${params.toString()}` : "/jobs";
    router.replace(newUrl, { scroll: false });
  }, [filters, router]);

  // ── Filter change handler ─────────────────────────────────────────────────

  function updateFilters(partial: Partial<Filters>) {
    setFilters(f => ({ ...f, ...partial }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  // ── Open job detail ───────────────────────────────────────────────────────

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
          // Patch the job in list too
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...full } : j));
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

  // ── Apply ─────────────────────────────────────────────────────────────────

  function handleApply(jobId: string) {
    if (!auth.isLoggedIn) { router.push("/login?redirect=/jobs"); return; }
    const job = jobs.find(j => j.id === jobId) ?? selectedJob;
    if (job) setApplyModalJob(job);
  }

  function handleApplySuccess(jobId: string) {
    setApplyModalJob(null);
    setAppliedJobIds(prev => new Set([...prev, jobId]));
    showToast("Application submitted successfully!", "ok");
  }

  // ── Sort bar ──────────────────────────────────────────────────────────────

  const SORTS: { key: SortKey; label: string }[] = [
    { key: "newest",      label: "Newest" },
    { key: "salary_high", label: "Salary: high to low" },
    { key: "salary_low",  label: "Salary: low to high" },
  ];

  const activeFilterCount = [
    filters.search, filters.country, filters.category,
    ...filters.contractTypes, filters.salaryMin, filters.salaryMax,
    filters.visaSupport && "v", filters.remote && "r", ...filters.skills,
  ].filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <ToastDisplay toast={toast} />

      {/* Apply modal */}
      {applyModalJob && (
        <ApplyModal
          job={applyModalJob}
          onSuccess={handleApplySuccess}
          onCancel={() => setApplyModalJob(null)}
        />
      )}

      {/* Slide-over */}
      <SlideOver
        job={detailLoading || detailError ? null : selectedJob}
        onClose={() => { setSelectedJob(null); setDetailError(null); }}
        onApply={handleApply}
        applying={applyingId === selectedJob?.id}
        applied={selectedJob ? appliedJobIds.has(selectedJob.id) : false}
        auth={auth}
      />
      {/* Loading overlay for detail */}
      {selectedJob && detailLoading && (
        <>
          <div onClick={() => setSelectedJob(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", zIndex: 200 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px,100vw)", background: "#161616", borderLeft: "1px solid rgba(255,255,255,0.08)", zIndex: 201, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(0,144,255,0.2)", borderTop: "2px solid #14b8a6", animation: "spin 0.8s linear infinite" }} />
          </div>
        </>
      )}
      {/* Error overlay for detail */}
      {selectedJob && detailError && (
        <>
          <div onClick={() => { setSelectedJob(null); setDetailError(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", zIndex: 200 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px,100vw)", background: "#161616", borderLeft: "1px solid rgba(255,255,255,0.08)", zIndex: 201, display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
            <ErrorState
              message={detailError}
              retry={() => selectedJob && openJob(selectedJob)}
              title="Could not load job details"
            />
          </div>
        </>
      )}

      <div style={{ paddingTop: 72 }}>
        {/* Page header */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "32px 40px 24px", background: "rgba(0,0,0,0.3)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Find your next role</div>
            <div style={{ fontSize: 14, color: "#71717a" }}>Browse {total > 0 ? `${total.toLocaleString()} approved` : "global"} opportunities — no account required</div>
          </div>
        </div>

        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 40px" }}>
          {/* Mobile filter toggle */}
          <div style={{ display: "none" }} className="mobile-filter-bar">
            <div style={{ padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                onClick={() => setMobileFiltersOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 16px", cursor: "pointer", color: "#a1a1aa", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
                <FilterIcon /> Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
              </button>
              <div style={{ fontSize: 13, color: "#71717a" }}>{total.toLocaleString()} jobs</div>
            </div>

            {mobileFiltersOpen && (
              <div style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <FilterSidebar filters={filters} onChange={updateFilters} categories={categories} countries={countries} onClear={clearFilters} />
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 32, paddingTop: 32, paddingBottom: 48, alignItems: "flex-start" }}>
            {/* ── LEFT SIDEBAR ── */}
            <div style={{ width: 260, flexShrink: 0, position: "sticky", top: 88 }} className="desktop-sidebar">
              <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Filters</div>
                <FilterSidebar filters={filters} onChange={updateFilters} categories={categories} countries={countries} onClear={clearFilters} />
              </div>
            </div>

            {/* ── RIGHT CONTENT ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Sort bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "#71717a" }}>
                  {loading ? "Loading…" : <><strong style={{ color: "#fff" }}>{total.toLocaleString()}</strong> jobs found</>}
                </div>
                <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 3 }}>
                  {SORTS.map(s => (
                    <button key={s.key} onClick={() => updateFilters({ sort: s.key })}
                      style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: s.key === filters.sort ? 700 : 500, border: "none", cursor: "pointer", fontFamily: "inherit", background: s.key === filters.sort ? "#1f1f1f" : "transparent", color: s.key === filters.sort ? "#fff" : "#71717a", boxShadow: s.key === filters.sort ? "0 1px 4px rgba(0,0,0,0.4)" : "none", transition: "all 0.15s" }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Job list */}
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, height: 140, opacity: 1 - i * 0.12 }}>
                      <div style={{ width: "60%", height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 6, marginBottom: 10 }} />
                      <div style={{ width: "40%", height: 12, background: "rgba(255,255,255,0.04)", borderRadius: 6 }} />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <ErrorState message={error} retry={fetchJobs} title="Could not load jobs" />
              ) : jobs.length === 0 ? (
                <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "56px 32px", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No jobs found</div>
                  <div style={{ fontSize: 13, color: "#71717a", marginBottom: 20 }}>Try adjusting your filters or clearing the search.</div>
                  {hasActiveFilters(filters) && (
                    <button onClick={clearFilters} style={{ background: "linear-gradient(135deg,#14b8a6,#0d9488)", border: "none", borderRadius: 10, padding: "10px 24px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      Clear all filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {jobs.map(job => (
                      job.source === "external" ? (
                        <ExternalJobCard key={job.id} job={job} />
                      ) : (
                        <JobCard
                          key={job.id}
                          job={job}
                          onClick={() => openJob(job)}
                          onApply={handleApply}
                          applying={applyingId === job.id}
                          applied={appliedJobIds.has(job.id)}
                          auth={auth}
                        />
                      )
                    ))}
                  </div>

                  {/* Load more */}
                  {jobs.length < total && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
                      <button
                        onClick={() => { isAppend.current = true; setPage(p => p + 1); }}
                        disabled={loadingMore}
                        style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "11px 32px", color: "#a1a1aa", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "#fff"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#a1a1aa"; }}>
                        {loadingMore ? "Loading…" : `Load more (${(total - jobs.length).toLocaleString()} remaining)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1024px) {
          .desktop-sidebar { display: none !important; }
          .mobile-filter-bar { display: block !important; }
        }
        @media (max-width: 640px) {
          .mobile-filter-bar + div { padding-top: 20px !important; padding-bottom: 32px !important; }
        }
      `}</style>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
    </svg>
  );
}

export default function JobBoardPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(0,144,255,0.2)", borderTop: "2px solid #14b8a6", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <JobBoardContent />
    </Suspense>
  );
}
