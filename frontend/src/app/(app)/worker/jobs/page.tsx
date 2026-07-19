"use client";
// src/app/(app)/worker/jobs/page.tsx

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { userApi, workerApi } from "@/lib/api-client";
import { ToastDisplay, type ToastData } from "@/components/ui";

// Initialised once — not inside a component
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption = "match" | "newest" | "salary_high" | "salary_low";

interface Job {
  id: string;
  title: string;
  description: string;
  country: string;
  city?: string | null;
  category?: string | null;
  contractType?: string | null; // real field backing the "work type" filter/badge
  visaSupport?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  matchScore?: number; // canonical field — see backend/src/controllers/worker.controller.ts
  isSaved?: boolean;
  employerProfile?: { companyName?: string | null; country?: string | null };
  requiredSkills?: { skill: string }[];
  createdAt?: string;
  positionsAvailable?: number;
  // External jobs (admin-pasted links — EURES, LinkedIn, Indeed, national
  // boards) are interleaved into this same feed, tagged source: "external".
  // Real jobPost rows are tagged source: "jobpost". See
  // backend/src/lib/external-jobs.ts. No apply/save flow, no match score.
  source?: "jobpost" | "external";
  sourceName?: string;
  externalUrl?: string;
}

interface CountryCardData {
  country: string;
  code: string;
  count: number;
}

interface JobFilterOptions {
  countries: string[];
  categories: string[];
  workTypes: string[];
  visaTypes: string[];
  companies: string[];
  salaryRange?: { min: number | null; max: number | null };
}

interface FiltersState {
  country: string;
  category: string;
  workType: string;
  visaType: string;
  company: string;
  location: string;
  minSalary: string;
  maxSalary: string;
  visaSupport: boolean;
  savedOnly: boolean;
  sort: SortOption;
}

interface FeeBreakdown {
  base: number;            // cents
  regionMultiplier: number;
  salaryMultiplier: number;
  conversionAdj: number;
  matchScore?: number;
}

interface ApplyModalState {
  job: Job;
  feeCents: number;
  feeDisplay: string;
  breakdown: FeeBreakdown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

const INITIAL_FILTERS: FiltersState = {
  country: "", category: "", workType: "", visaType: "", company: "",
  location: "", minSalary: "", maxSalary: "",
  visaSupport: false, savedOnly: false, sort: "match",
};

// workTypes/visaTypes now come back as real backend enum-style values
// (JobPost.contractType, and an honest 2-value mapping of the visaSupport
// boolean — see worker.controller.ts buildJobsWhere/getJobFilterOptions).
// Pretty-print them for the dropdown; fall back to the raw value for
// anything not in this map so a future enum addition doesn't disappear.
const WORK_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  TEMPORARY: "Temporary", INTERNSHIP: "Internship", FREELANCE: "Freelance",
};
const VISA_TYPE_LABELS: Record<string, string> = {
  VISA_SUPPORT_AVAILABLE: "Visa support available",
  NO_VISA_SUPPORT: "No visa support",
};

const COUNTRY_EMOJIS: Record<string, string> = {
  "United Kingdom": "🇬🇧", "Germany": "🇩🇪", "France": "🇫🇷",
  "United States": "🇺🇸", "Canada": "🇨🇦", "Australia": "🇦🇺",
  "Netherlands": "🇳🇱", "Spain": "🇪🇸", "Italy": "🇮🇹",
  "Switzerland": "🇨🇭", "Sweden": "🇸🇪", "Norway": "🇳🇴",
  "Denmark": "🇩🇰", "Portugal": "🇵🇹", "Belgium": "🇧🇪",
  "Poland": "🇵🇱", "Austria": "🇦🇹", "Ireland": "🇮🇪",
  "Singapore": "🇸🇬", "UAE": "🇦🇪", "Japan": "🇯🇵",
  "New Zealand": "🇳🇿", "Finland": "🇫🇮", "Luxembourg": "🇱🇺",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeCountryCode(country: string): string {
  const chunks = country.trim().split(/\s+/).filter(Boolean);
  if (chunks.length >= 2) return `${chunks[0][0]}${chunks[1][0]}`.toUpperCase();
  return country.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function multiplierLabel(m: number): string {
  if (m === 1) return "×1.0 (no adjustment)";
  return m > 1 ? `+${Math.round((m - 1) * 100)}%` : `−${Math.round((1 - m) * 100)}%`;
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#0090FF" : "#f59e0b";
  const r = 18, c = 2 * Math.PI * r;
  const fill = (score / 100) * c;
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${fill} ${c}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 11, fontWeight: 800, color,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {score}
      </div>
    </div>
  );
}

// ─── Pill / Badge ─────────────────────────────────────────────────────────────

function Pill({ children, color = "gray" }: { children: React.ReactNode; color?: string }) {
  const palettes: Record<string, { bg: string; border: string; text: string }> = {
    gray:   { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.09)", text: "#71717a" },
    cyan:   { bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.2)",   text: "#22d3ee" },
    violet: { bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.2)",  text: "#a78bfa" },
    blue:   { bg: "rgba(0,144,255,0.08)",   border: "rgba(0,144,255,0.2)",   text: "#60a5fa" },
    teal:   { bg: "rgba(20,184,166,0.1)",   border: "rgba(20,184,166,0.25)", text: "#2dd4bf" },
    green:  { bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)",   text: "#86efac" },
    amber:  { bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)",  text: "#fcd34d" },
  };
  const p = palettes[color] ?? palettes.gray;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
      background: p.bg, border: `1px solid ${p.border}`, color: p.text,
      whiteSpace: "nowrap", letterSpacing: "0.02em",
    }}>
      {children}
    </span>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} style={{
      display: "flex", alignItems: "center", gap: 8, background: "none",
      border: "none", cursor: "pointer", padding: 0,
    }}>
      <div style={{
        width: 32, height: 18, borderRadius: 9, position: "relative", flexShrink: 0,
        background: checked ? "rgba(20,184,166,0.9)" : "rgba(255,255,255,0.1)",
        transition: "background 0.2s", border: checked ? "1px solid rgba(20,184,166,0.5)" : "1px solid rgba(255,255,255,0.12)",
      }}>
        <div style={{
          position: "absolute", top: 2, width: 12, height: 12, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s", left: checked ? 16 : 2,
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }} />
      </div>
      <span style={{ fontSize: 13, color: checked ? "#e4e4e7" : "#71717a", fontFamily: "inherit" }}>{label}</span>
    </button>
  );
}

// ─── Filter Sidebar ───────────────────────────────────────────────────────────

function FilterPanel({
  filters, options, onFilter, onClear, activeCount,
}: {
  filters: FiltersState;
  options: JobFilterOptions;
  onFilter: <K extends keyof FiltersState>(k: K, v: FiltersState[K]) => void;
  onClear: () => void;
  activeCount: number;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#e4e4e7",
    outline: "none", fontFamily: "inherit", appearance: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 700, color: "#4a4a4a",
    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7,
  };
  return (
    <div style={{
      background: "#111111", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "20px 18px", position: "sticky", top: 88,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Filters</span>
        {activeCount > 0 && (
          <button onClick={onClear} style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, padding: "3px 9px", fontSize: 11, color: "#71717a",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Clear {activeCount}
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>Category</label>
          <select value={filters.category} onChange={e => onFilter("category", e.target.value)} style={inputStyle}>
            <option value="">All categories</option>
            {options.categories.map(c => <option key={c} value={c} style={{ background: "#111" }}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Work type</label>
          <select value={filters.workType} onChange={e => onFilter("workType", e.target.value)} style={inputStyle}>
            <option value="">Any type</option>
            {options.workTypes.map(w => <option key={w} value={w} style={{ background: "#111" }}>{WORK_TYPE_LABELS[w] ?? w}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Visa type</label>
          <select value={filters.visaType} onChange={e => onFilter("visaType", e.target.value)} style={inputStyle}>
            <option value="">Any visa</option>
            {options.visaTypes.map(v => <option key={v} value={v} style={{ background: "#111" }}>{VISA_TYPE_LABELS[v] ?? v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Salary range</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" value={filters.minSalary}
              onChange={e => onFilter("minSalary", e.target.value)}
              placeholder={options.salaryRange?.min ? Math.round(options.salaryRange.min).toLocaleString() : "Min"}
              style={{ ...inputStyle, width: "50%" }} />
            <input type="number" value={filters.maxSalary}
              onChange={e => onFilter("maxSalary", e.target.value)}
              placeholder={options.salaryRange?.max ? Math.round(options.salaryRange.max).toLocaleString() : "Max"}
              style={{ ...inputStyle, width: "50%" }} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Company</label>
          <input value={filters.company} onChange={e => onFilter("company", e.target.value)}
            placeholder={options.companies[0] ? `e.g. ${options.companies[0]}` : "Company name"}
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>City / Location</label>
          <input value={filters.location} onChange={e => onFilter("location", e.target.value)}
            placeholder="City or keyword" style={inputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <ToggleSwitch checked={filters.visaSupport} onChange={() => onFilter("visaSupport", !filters.visaSupport)} label="Visa support only" />
          <ToggleSwitch checked={filters.savedOnly} onChange={() => onFilter("savedOnly", !filters.savedOnly)} label="Saved jobs only" />
        </div>
      </div>
    </div>
  );
}

// ─── Country Grid ─────────────────────────────────────────────────────────────

function CountryGrid({ countries, selected, onSelect }: {
  countries: CountryCardData[];
  selected: string;
  onSelect: (country: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? countries : countries.slice(0, 8);

  if (countries.length === 0) {
    return (
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12, padding: "20px 16px", textAlign: "center",
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🌍</div>
        <div style={{ fontSize: 13, color: "#4a4a4a" }}>No country data for current filters</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        {visible.map(entry => {
          const active = selected === entry.country;
          const emoji = COUNTRY_EMOJIS[entry.country] ?? "🌐";
          return (
            <button key={entry.country} onClick={() => onSelect(active ? "" : entry.country)} style={{
              background: active
                ? "linear-gradient(135deg, rgba(0,144,255,0.15), rgba(20,184,166,0.1))"
                : "rgba(255,255,255,0.02)",
              border: active ? "1px solid rgba(0,144,255,0.35)" : "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: "14px 12px", textAlign: "left",
              cursor: "pointer", transition: "all 0.15s ease", position: "relative", overflow: "hidden",
            }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.15)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; } }}
            >
              {active && (
                <div style={{ position: "absolute", top: 6, right: 8, width: 6, height: 6, borderRadius: "50%", background: "#14b8a6" }} />
              )}
              <div style={{ fontSize: 20, marginBottom: 6 }}>{emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: active ? "#e4e4e7" : "#a1a1aa", lineHeight: 1.3, marginBottom: 4 }}>
                {entry.country}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: active ? "#2dd4bf" : "#4a4a4a" }}>
                {entry.count.toLocaleString()} jobs
              </div>
            </button>
          );
        })}
      </div>
      {countries.length > 8 && (
        <button onClick={() => setExpanded(e => !e)} style={{
          marginTop: 10, background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "#4a4a4a", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {expanded ? "Show less ↑" : `Show all ${countries.length} countries ↓`}
        </button>
      )}
    </div>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job, onApply, onSave, checking, applied, saving }: {
  job: Job;
  onApply: (id: string) => void;
  onSave: (job: Job) => void;
  checking: boolean;
  applied: boolean;
  saving: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const skills = job.requiredSkills?.slice(0, 4) ?? [];
  const salary = job.salaryMin
    ? `${job.currency ?? "EUR"} ${Math.round(job.salaryMin).toLocaleString()}${job.salaryMax ? `–${Math.round(job.salaryMax).toLocaleString()}` : "+"}`
    : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "#161616" : "#121212",
        border: hovered ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "20px 22px",
        transition: "all 0.15s ease", cursor: "default",
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: "linear-gradient(135deg, rgba(0,144,255,0.15), rgba(20,184,166,0.15))",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 800, color: "#60a5fa",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {(job.employerProfile?.companyName ?? job.title)?.[0]?.toUpperCase() ?? "J"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", lineHeight: 1.3, marginBottom: 3 }}>
            {job.title}
          </div>
          <div style={{ fontSize: 12, color: "#71717a" }}>
            {job.employerProfile?.companyName ?? "Company"}
            {job.city && ` · ${job.city}`}
            {job.country && `, ${job.country}`}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          {job.matchScore !== undefined && <ScoreRing score={job.matchScore} />}
          {job.createdAt && <span style={{ fontSize: 11, color: "#3a3a3a" }}>{timeAgo(job.createdAt)}</span>}
        </div>
      </div>

      {job.description && (
        <p style={{
          fontSize: 13, color: "#5a5a5a", lineHeight: 1.7, margin: "0 0 12px",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {job.description}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {salary && <Pill color="green">{salary}</Pill>}
        {job.category && <Pill color="cyan">{job.category}</Pill>}
        {job.contractType && <Pill color="violet">{WORK_TYPE_LABELS[job.contractType] ?? job.contractType}</Pill>}
        {job.visaSupport && <Pill color="teal">✓ Visa support</Pill>}
        {skills.map(s => (
          <span key={s.skill} style={{
            fontSize: 11, padding: "3px 8px", borderRadius: 5,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "#4a4a4a",
          }}>
            {s.skill}
          </span>
        ))}
        {(job.requiredSkills?.length ?? 0) > 4 && (
          <span style={{ fontSize: 11, color: "#3a3a3a", alignSelf: "center" }}>
            +{(job.requiredSkills?.length ?? 0) - 4}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => !applied && !checking && onApply(job.id)}
          disabled={checking || applied}
          style={{
            height: 36, padding: "0 20px", borderRadius: 9,
            border: applied ? "1px solid rgba(16,185,129,0.3)" : "none",
            background: applied
              ? "rgba(16,185,129,0.12)"
              : checking
                ? "rgba(0,144,255,0.3)"
                : "linear-gradient(135deg, #0090FF, #0070cc)",
            color: applied ? "#34d399" : "#fff",
            fontSize: 12, fontWeight: 700,
            cursor: checking || applied ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            boxShadow: applied || checking ? "none" : "0 2px 12px rgba(0,144,255,0.3)",
            transition: "all 0.15s",
          }}
        >
          {applied ? "✓ Applied" : checking ? "Checking fee…" : "Apply now"}
        </button>

        <button
          onClick={() => onSave(job)}
          disabled={saving}
          style={{
            height: 36, padding: "0 14px", borderRadius: 9,
            background: job.isSaved ? "rgba(20,184,166,0.12)" : "rgba(255,255,255,0.04)",
            border: job.isSaved ? "1px solid rgba(20,184,166,0.3)" : "1px solid rgba(255,255,255,0.09)",
            color: job.isSaved ? "#2dd4bf" : "#71717a",
            fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "inherit", transition: "all 0.15s",
          }}
        >
          {saving ? "…" : job.isSaved ? "✓ Saved" : "Save"}
        </button>

        <Link href="/worker/applications" style={{
          height: 36, padding: "0 14px", borderRadius: 9, display: "inline-flex",
          alignItems: "center", textDecoration: "none",
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          color: "#71717a", fontSize: 12, fontWeight: 600,
        }}>
          Track
        </Link>
      </div>
    </div>
  );
}

// ─── External Job Card ──────────────────────────────────────────────────────
// No apply/save flow, no match score, no "Verified" claims — this job lives
// on another site (EURES, LinkedIn, Indeed, a national board); ours is just
// a pointer to it.

function ExternalJobCard({ job }: { job: Job }) {
  const salary = job.salaryMin
    ? `${job.currency ?? "EUR"} ${Math.round(job.salaryMin).toLocaleString()}${job.salaryMax ? `–${Math.round(job.salaryMax).toLocaleString()}` : "+"}`
    : null;

  return (
    <div style={{
      background: "#121212", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "20px 22px",
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17,
        }}>
          🔗
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", lineHeight: 1.3, marginBottom: 3 }}>
            {job.title}
          </div>
          <div style={{ fontSize: 12, color: "#71717a" }}>
            {[job.city, job.country].filter(Boolean).join(", ")}
          </div>
        </div>
        <Pill color="amber">External</Pill>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {salary && <Pill color="green">{salary}</Pill>}
        {job.contractType && <Pill color="violet">{WORK_TYPE_LABELS[job.contractType] ?? job.contractType}</Pill>}
      </div>

      <div style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>
        Hosted on {job.sourceName} — opens in a new tab.
      </div>

      <a
        href={job.externalUrl}
        target="_blank"
        rel="noopener nofollow sponsored"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          height: 36, padding: "0 20px", borderRadius: 9,
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
          color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none",
        }}
      >
        View on {job.sourceName} ↗
      </a>
    </div>
  );
}

// ─── Apply Modal — Stripe payment step (must be inside <Elements>) ─────────────

function PaymentStep({
  jobId, coverLetter, feeDisplay, onSuccess,
}: {
  jobId: string;
  coverLetter: string;
  feeDisplay: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/worker/applications` },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message ?? "Payment failed — please try again.");
      setPaying(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      const res = await workerApi.confirmApplication(jobId, {
        paymentIntentId: paymentIntent.id,
        coverLetter: coverLetter || undefined,
      });
      setPaying(false);
      if (res.success) {
        onSuccess();
      } else {
        setError((res as { error?: string }).error ?? "Payment succeeded but application could not be confirmed — contact support.");
      }
    } else {
      setPaying(false);
      setError("Payment was not completed. Please try again.");
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {error && (
        <div style={{
          marginBottom: 14, padding: "10px 14px",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 8, fontSize: 13, color: "#f87171", lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={paying || !stripe || !elements}
        style={{
          width: "100%", height: 44, borderRadius: 10, border: "none",
          background: paying || !stripe
            ? "rgba(124,58,237,0.3)"
            : "linear-gradient(135deg, #7c3aed, #0090FF)",
          color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: paying || !stripe ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          boxShadow: paying ? "none" : "0 2px 20px rgba(124,58,237,0.35)",
          transition: "all 0.15s",
        }}
      >
        {paying ? "Processing…" : `Pay & Submit ${feeDisplay}`}
      </button>
    </div>
  );
}

// ─── Apply Modal ──────────────────────────────────────────────────────────────

function ApplyModal({
  state, onClose, onApplied,
}: {
  state: ApplyModalState;
  onClose: () => void;
  onApplied: (jobId: string) => void;
}) {
  const { job, feeCents, feeDisplay, breakdown } = state;
  const [coverLetter, setCoverLetter] = useState("");
  const [step, setStep] = useState<"review" | "payment">("review");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<{ clientSecret: string; paymentIntentId: string } | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const handleReviewSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    const res = await workerApi.applyToJob(job.id, {
      cover_letter: coverLetter || undefined,
    });

    if (!res.success) {
      setSubmitError((res as { error?: string }).error ?? "Could not submit application.");
      setSubmitting(false);
      return;
    }

    const data = res.data as {
      requiresPayment: boolean;
      applicationId?: string;
      clientSecret?: string;
      paymentIntentId?: string;
    };

    if (!data.requiresPayment) {
      onApplied(job.id);
      return;
    }

    // Fee required — move to Stripe payment step
    if (!stripePromise) {
      setSubmitError("Payment is not configured — please contact support.");
      setSubmitting(false);
      return;
    }

    setPaymentData({
      clientSecret: data.clientSecret!,
      paymentIntentId: data.paymentIntentId!,
    });
    setStep("payment");
    setSubmitting(false);
  };

  const breakdownRows: { label: string; value: string; color?: string }[] = [
    { label: "Base fee", value: fmtCents(breakdown.base) },
    ...(breakdown.regionMultiplier !== 1 ? [{ label: "Region demand", value: multiplierLabel(breakdown.regionMultiplier) }] : []),
    ...(breakdown.salaryMultiplier !== 1 ? [{ label: "Salary tier", value: multiplierLabel(breakdown.salaryMultiplier) }] : []),
    ...(breakdown.conversionAdj !== 1 ? [{
      label: breakdown.conversionAdj < 1 ? "High match bonus" : "Low match adjustment",
      value: multiplierLabel(breakdown.conversionAdj),
      color: breakdown.conversionAdj < 1 ? "#34d399" : "#f87171",
    }] : []),
    ...(breakdown.matchScore !== undefined ? [{ label: "AI match score", value: String(breakdown.matchScore), color: "#60a5fa" }] : []),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={step === "review" ? onClose : undefined}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1001, width: "min(520px, 95vw)",
        background: "#111", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 18, padding: "28px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.85)",
        maxHeight: "90vh", overflowY: "auto",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#0090FF",
              letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5,
            }}>
              {step === "payment" ? "Complete payment" : "Apply for position"}
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
              {job.title}
            </h2>
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 3 }}>
              {job.employerProfile?.companyName ?? "Company"}
              {job.country && ` · ${job.country}`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 8, width: 32, height: 32, display: "flex",
              alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#71717a", flexShrink: 0, fontSize: 18, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Review step ── */}
        {step === "review" && (
          <>
            {/* Fee display */}
            {feeCents === 0 ? (
              <div style={{
                background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: 10, padding: "11px 16px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>Free application</div>
                  <div style={{ fontSize: 12, color: "#71717a", marginTop: 1 }}>No fee required for this position.</div>
                </div>
              </div>
            ) : (
              <div style={{
                background: "rgba(124,58,237,0.07)", border: "1px solid rgba(124,58,237,0.2)",
                borderRadius: 12, padding: "16px 18px", marginBottom: 20,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
                }}>
                  Application fee
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>
                  {feeDisplay}
                </div>
                <div style={{ fontSize: 12, color: "#71717a", marginBottom: 12 }}>
                  Non-refundable · processed securely via Stripe
                </div>

                <button
                  onClick={() => setShowBreakdown(b => !b)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 11, color: "#7c3aed", padding: 0, fontFamily: "inherit",
                  }}
                >
                  {showBreakdown ? "Hide breakdown ↑" : "How is this calculated? ↓"}
                </button>

                {showBreakdown && (
                  <div style={{
                    marginTop: 12, paddingTop: 12,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    display: "flex", flexDirection: "column", gap: 7,
                  }}>
                    {breakdownRows.map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: row.color ?? "rgba(255,255,255,0.65)" }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cover letter */}
            <div style={{ marginBottom: 22 }}>
              <label style={{
                display: "block", fontSize: 11, fontWeight: 700,
                color: "rgba(255,255,255,0.35)", textTransform: "uppercase",
                letterSpacing: "0.08em", marginBottom: 8,
              }}>
                Cover letter{" "}
                <span style={{ color: "#3a3a3a", fontWeight: 400, textTransform: "none" }}>(optional)</span>
              </label>
              <textarea
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                placeholder="Briefly introduce yourself and explain why you're a great fit for this role…"
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 10, padding: "11px 13px", fontSize: 13, color: "#e4e4e7",
                  outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.6,
                }}
              />
            </div>

            {submitError && (
              <div style={{
                marginBottom: 14, padding: "10px 14px",
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 8, fontSize: 13, color: "#f87171",
              }}>
                {submitError}
              </div>
            )}

            <button
              onClick={handleReviewSubmit}
              disabled={submitting}
              style={{
                width: "100%", height: 44, borderRadius: 10, border: "none",
                background: submitting
                  ? "rgba(0,144,255,0.3)"
                  : feeCents > 0
                    ? "linear-gradient(135deg, #7c3aed, #0090FF)"
                    : "linear-gradient(135deg, #0090FF, #0070cc)",
                color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                boxShadow: submitting ? "none" : "0 2px 20px rgba(0,144,255,0.3)",
                transition: "all 0.15s",
              }}
            >
              {submitting
                ? "Submitting…"
                : feeCents > 0
                  ? `Apply & Pay ${feeDisplay}`
                  : "Submit application"}
            </button>
          </>
        )}

        {/* ── Payment step ── */}
        {step === "payment" && paymentData && stripePromise && (
          <>
            <div style={{
              background: "rgba(124,58,237,0.07)", border: "1px solid rgba(124,58,237,0.15)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 20,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Amount due</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{feeDisplay}</span>
            </div>

            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: paymentData.clientSecret,
                appearance: {
                  theme: "night",
                  variables: {
                    colorPrimary: "#7c3aed",
                    colorBackground: "#1a1a2e",
                    borderRadius: "8px",
                    fontFamily: "Inter, system-ui, sans-serif",
                  },
                },
              }}
            >
              <PaymentStep
                jobId={job.id}
                coverLetter={coverLetter}
                feeDisplay={feeDisplay}
                onSuccess={() => onApplied(job.id)}
              />
            </Elements>

            <button
              onClick={() => { setStep("review"); setPaymentData(null); }}
              style={{
                marginTop: 12, width: "100%", background: "none",
                border: "none", cursor: "pointer", fontSize: 12,
                color: "#71717a", fontFamily: "inherit", padding: "6px 0",
              }}
            >
              ← Back to application
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ background: "#121212", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 22px" }}>
      <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(255,255,255,0.04)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: "55%", height: 14, borderRadius: 6, background: "rgba(255,255,255,0.05)", marginBottom: 8 }} />
          <div style={{ width: "35%", height: 11, borderRadius: 5, background: "rgba(255,255,255,0.03)" }} />
        </div>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
      </div>
      <div style={{ width: "90%", height: 11, borderRadius: 5, background: "rgba(255,255,255,0.03)", marginBottom: 6 }} />
      <div style={{ width: "70%", height: 11, borderRadius: 5, background: "rgba(255,255,255,0.03)", marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 6 }}>
        {[60, 80, 50].map((w, i) => (
          <div key={i} style={{ width: w, height: 22, borderRadius: 6, background: "rgba(255,255,255,0.03)" }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────

function WorkerJobsContent() {
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FiltersState>(INITIAL_FILTERS);
  const [countries, setCountries] = useState<CountryCardData[]>([]);
  const [options, setOptions] = useState<JobFilterOptions>({
    countries: [], categories: [], workTypes: [], visaTypes: [], companies: [],
    salaryRange: { min: null, max: null },
  });
  const [checkingFeeId, setCheckingFeeId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSearchable, setIsSearchable] = useState(true);
  const [toast, setToast] = useState<ToastData>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [applyModal, setApplyModal] = useState<ApplyModalState | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    userApi.getProfile().then(res => {
      if (!res.success) { router.push("/login"); return; }
      const payload = res.data as { profile?: { isSearchable?: boolean } | null };
      setIsSearchable(payload.profile?.isSearchable ?? false);
    });
  }, [router]);

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      page: String(page), limit: String(PAGE_SIZE), sort: filters.sort,
    };
    if (search.trim()) params.search = search.trim();
    if (filters.country) params.country = filters.country;
    if (filters.category) params.category = filters.category;
    if (filters.workType) params.workType = filters.workType;
    if (filters.visaType) params.visaType = filters.visaType;
    if (filters.company) params.company = filters.company;
    if (filters.location) params.location = filters.location;
    if (filters.minSalary) params.minSalary = filters.minSalary;
    if (filters.maxSalary) params.maxSalary = filters.maxSalary;
    if (filters.visaSupport) params.visaSupport = "true";
    if (filters.savedOnly) params.savedOnly = "true";
    return params;
  }, [filters, page, search]);

  const metaParams = useMemo(() => {
    const { page: _p, limit: _l, sort: _s, ...rest } = queryParams;
    return rest;
  }, [queryParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [jobsRes, countriesRes, optionsRes] = await Promise.all([
      workerApi.getJobs(queryParams),
      workerApi.getJobCountries(metaParams),
      workerApi.getJobFilterOptions(metaParams),
    ]);
    if (!jobsRes.success) {
      setError(jobsRes.error ?? "Could not load jobs");
      setJobs([]); setTotal(0); setLoading(false); return;
    }
    setJobs((jobsRes.data as Job[]) ?? []);
    setTotal((jobsRes as { total?: number }).total ?? 0);
    if (countriesRes.success) {
      setCountries(((countriesRes.data as CountryCardData[]) ?? []).map(e => ({
        ...e, code: e.code || safeCountryCode(e.country),
      })));
    }
    if (optionsRes.success) {
      const d = optionsRes.data as JobFilterOptions;
      setOptions({
        countries: d.countries ?? [], categories: d.categories ?? [],
        workTypes: d.workTypes ?? [], visaTypes: d.visaTypes ?? [],
        companies: d.companies ?? [], salaryRange: d.salaryRange ?? { min: null, max: null },
      });
    }
    setLoading(false);
  }, [metaParams, queryParams]);

  useEffect(() => { load(); }, [load]);

  const setFilter = <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
    setPage(1);
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const runSearch = () => { setPage(1); setSearch(searchInput.trim()); };
  const clearAllFilters = () => { setPage(1); setSearch(""); setSearchInput(""); setFilters(INITIAL_FILTERS); };

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (search.trim()) c++;
    if (filters.country) c++;
    if (filters.category) c++;
    if (filters.workType) c++;
    if (filters.visaType) c++;
    if (filters.company) c++;
    if (filters.location) c++;
    if (filters.minSalary) c++;
    if (filters.maxSalary) c++;
    if (filters.visaSupport) c++;
    if (filters.savedOnly) c++;
    if (filters.sort !== "match") c++;
    return c;
  }, [filters, search]);

  // Step 1: fetch fee → Step 2: open modal
  const handleApply = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || appliedIds.has(jobId)) return;

    setCheckingFeeId(jobId);
    const res = await workerApi.getApplicationFee(jobId);
    setCheckingFeeId(null);

    if (!res.success) {
      showToast((res as { error?: string }).error ?? "Could not check application fee.", "err");
      return;
    }

    const d = res.data as { feeCents: number; feeDisplay: string; breakdown: FeeBreakdown };
    setApplyModal({ job, feeCents: d.feeCents, feeDisplay: d.feeDisplay, breakdown: d.breakdown });
  };

  const handleApplied = (jobId: string) => {
    setApplyModal(null);
    setAppliedIds(prev => new Set(prev).add(jobId));
    showToast("✓ Applied successfully!", "ok");
  };

  const handleSave = async (job: Job) => {
    setSavingId(job.id);
    const res = job.isSaved ? await workerApi.unsaveJob(job.id) : await workerApi.saveJob(job.id);
    setSavingId(null);
    if (!res.success) { showToast(res.error ?? "Could not update saved jobs", "err"); return; }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, isSaved: !job.isSaved } : j));
    if (filters.savedOnly && job.isSaved) {
      setJobs(prev => prev.filter(j => j.id !== job.id));
      setTotal(prev => Math.max(0, prev - 1));
    }
    showToast(job.isSaved ? "Removed from saved" : "Job saved", "ok");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", fontFamily: "'Inter', system-ui, sans-serif", color: "#e4e4e7" }}>
      <ToastDisplay toast={toast} />

      {/* Apply modal */}
      {applyModal && (
        <ApplyModal
          state={applyModal}
          onClose={() => setApplyModal(null)}
          onApplied={handleApplied}
        />
      )}

      {/* ── Page Header ── */}
      <div className="px-4 sm:px-6 md:px-10 py-6 md:py-9" style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(0,144,255,0.04) 0%, transparent 100%)",
      }}>
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0090FF", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                🌍 Global Job Explorer
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.2 }}>
                Find your next role
              </h1>
              <p style={{ fontSize: 14, color: "#4a4a4a", margin: "8px 0 0" }}>
                {loading ? "Loading opportunities…" : `${total.toLocaleString()} matching opportunities worldwide`}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {(["match", "newest", "salary_high", "salary_low"] as SortOption[]).map(s => {
                const labels: Record<SortOption, string> = {
                  match: "Best match", newest: "Newest", salary_high: "Salary ↓", salary_low: "Salary ↑",
                };
                const active = filters.sort === s;
                return (
                  <button key={s} onClick={() => setFilter("sort", s)} style={{
                    height: 32, padding: "0 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: active ? "1px solid rgba(0,144,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    background: active ? "rgba(0,144,255,0.12)" : "rgba(255,255,255,0.03)",
                    color: active ? "#60a5fa" : "#71717a",
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}>
                    {labels[s]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-10 py-6 pb-16" style={{ maxWidth: 1300, margin: "0 auto" }}>

        {/* ── Onboarding Banner ── */}
        {!isSearchable && (
          <div style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.07), rgba(245,158,11,0.03))",
            border: "1px solid rgba(245,158,11,0.18)", borderRadius: 14,
            padding: "14px 18px", marginBottom: 24,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 3 }}>
                ⚡ Complete onboarding to become searchable
              </div>
              <div style={{ fontSize: 12, color: "#71717a" }}>
                You can browse and apply now — your profile ranks better after approval.
              </div>
            </div>
            <Link href="/worker/profile/edit" style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              height: 34, padding: "0 16px", borderRadius: 8,
              background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)",
              color: "#f59e0b", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
            }}>
              Edit Profile →
            </Link>
          </div>
        )}

        {/* ── Search Bar ── */}
        <div style={{
          background: "#111", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: "14px 16px", marginBottom: 24,
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.3 }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runSearch()}
              placeholder="Search title, skill, company, visa type…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10, height: 48, padding: "0 12px 0 34px",
                fontSize: 15, color: "#e4e4e7", outline: "none", fontFamily: "inherit",
              }}
            />
          </div>

          <button onClick={runSearch} style={{
            height: 38, padding: "0 20px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #0090FF, #0070cc)",
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 2px 12px rgba(0,144,255,0.3)", whiteSpace: "nowrap",
          }}>
            Search
          </button>

          <button onClick={() => setSidebarOpen(o => !o)} style={{
            height: 38, padding: "0 14px", borderRadius: 10,
            background: activeFilterCount > 0 ? "rgba(0,144,255,0.1)" : "rgba(255,255,255,0.04)",
            border: activeFilterCount > 0 ? "1px solid rgba(0,144,255,0.3)" : "1px solid rgba(255,255,255,0.08)",
            color: activeFilterCount > 0 ? "#60a5fa" : "#71717a",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "savedOnly" as const, label: "Saved" },
              { key: "visaSupport" as const, label: "Visa support" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key, !filters[key])} style={{
                height: 38, padding: "0 12px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                border: filters[key] ? "1px solid rgba(20,184,166,0.35)" : "1px solid rgba(255,255,255,0.08)",
                background: filters[key] ? "rgba(20,184,166,0.1)" : "rgba(255,255,255,0.03)",
                color: filters[key] ? "#2dd4bf" : "#71717a",
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
              }}>
                {filters[key] ? "✓ " : ""}{label}
              </button>
            ))}
          </div>

          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} style={{
              height: 38, padding: "0 12px", borderRadius: 10, fontSize: 12,
              background: "none", border: "1px solid rgba(255,255,255,0.07)",
              color: "#4a4a4a", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}>
              Clear all
            </button>
          )}
        </div>

        {/* ── Country Section ── */}
        <div style={{
          background: "#111", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 14, padding: "18px 20px", marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#3a3a3a", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Jobs by country
            </div>
            {filters.country && (
              <button onClick={() => setFilter("country", "")} style={{
                fontSize: 11, color: "#4a4a4a", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              }}>
                Clear country ×
              </button>
            )}
          </div>
          <CountryGrid countries={countries} selected={filters.country} onSelect={c => setFilter("country", c)} />
        </div>

        {/* ── Main Layout: Sidebar + Jobs ── */}
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

          <div style={{ width: 240, flexShrink: 0, display: sidebarOpen ? "block" : "none" }} className="filter-sidebar">
            <FilterPanel filters={filters} options={options} onFilter={setFilter} onClear={clearAllFilters} activeCount={activeFilterCount} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#4a4a4a" }}>
                {loading ? "Loading…" : (
                  <><strong style={{ color: "#e4e4e7" }}>{total.toLocaleString()}</strong> jobs found
                  {filters.country && <> in <span style={{ color: "#60a5fa" }}>{filters.country}</span></>}
                  </>
                )}
              </div>
              {totalPages > 1 && (
                <div style={{ fontSize: 12, color: "#3a3a3a" }}>Page {page} of {totalPages}</div>
              )}
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 5 }, (_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : error ? (
              <div style={{
                background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
                borderRadius: 14, padding: "32px 24px", textAlign: "center",
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⚠</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f87171", marginBottom: 6 }}>Could not load jobs</div>
                <div style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>{error}</div>
                <button onClick={load} style={{
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 8, padding: "8px 20px", color: "#f87171", fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                }}>
                  Retry
                </button>
              </div>
            ) : jobs.length === 0 ? (
              <div style={{
                background: "#111", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "56px 32px", textAlign: "center",
              }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No jobs found</div>
                <div style={{ fontSize: 13, color: "#4a4a4a", marginBottom: 20 }}>
                  Try broadening your filters or clearing the search.
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} style={{
                    background: "linear-gradient(135deg, #0090FF, #0070cc)", border: "none",
                    borderRadius: 10, padding: "10px 24px", color: "#fff", fontSize: 13,
                    fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    Reset all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobs.map(job => (
                  job.source === "external" ? (
                    <ExternalJobCard key={job.id} job={job} />
                  ) : (
                    <JobCard
                      key={job.id}
                      job={job}
                      onApply={handleApply}
                      onSave={handleSave}
                      checking={checkingFeeId === job.id}
                      applied={appliedIds.has(job.id)}
                      saving={savingId === job.id}
                    />
                  )
                ))}
              </div>
            )}

            {totalPages > 1 && !loading && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 32 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    height: 36, padding: "0 14px", borderRadius: 9,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    color: page === 1 ? "#2a2a2a" : "#71717a", fontSize: 13,
                    cursor: page === 1 ? "not-allowed" : "pointer", fontFamily: "inherit",
                  }}
                >
                  ← Prev
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <button key={p} onClick={() => setPage(p)} style={{
                      width: 36, height: 36, borderRadius: 9, fontSize: 13, fontWeight: 600,
                      border: p === page ? "1px solid rgba(0,144,255,0.4)" : "1px solid rgba(255,255,255,0.07)",
                      background: p === page ? "rgba(0,144,255,0.12)" : "rgba(255,255,255,0.03)",
                      color: p === page ? "#60a5fa" : "#71717a",
                      cursor: "pointer", fontFamily: "inherit",
                    }}>
                      {p}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    height: 36, padding: "0 14px", borderRadius: 9,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    color: page === totalPages ? "#2a2a2a" : "#71717a", fontSize: 13,
                    cursor: page === totalPages ? "not-allowed" : "pointer", fontFamily: "inherit",
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 900px) { .filter-sidebar { display: block !important; } }
        * { box-sizing: border-box; }
        input::placeholder { color: #3a3a3a; }
        select option { background: #111; }
        textarea::placeholder { color: #3a3a3a; }
      `}</style>
    </div>
  );
}

export default function WorkerJobsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(0,144,255,0.15)", borderTop: "2px solid #0090FF", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <WorkerJobsContent />
    </Suspense>
  );
}
