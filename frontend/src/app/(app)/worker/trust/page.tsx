"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { workerApi } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tier = "new" | "verified" | "trusted" | "elite";

interface CompletenessItem {
  label: string;
  done:  boolean;
  field: string;
}

interface ScoreBreakdown {
  profile_completeness:  number;
  hire_success_rate:     number;
  employer_rating_avg:   number;
  document_verification: number;
}

interface HistoryEntry {
  score:      number;
  reason:     string;
  created_at: string;
}

interface TrustData {
  trust_score:        number;
  tier:               Tier;
  tier_thresholds:    { verified: number; trusted: number; elite: number };
  completeness_score: number;
  completeness_items: CompletenessItem[];
  score_breakdown:    ScoreBreakdown;
  history:            HistoryEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAL_600 = "#0F6E56";
const TEAL_500 = "#1D9E75";
const TEAL_400 = "#2DB896";
const TEAL_50  = "#E1F5EE";
const TEAL_800 = "#115e59";

const TIER_COLORS: Record<Tier, { bg: string; color: string }> = {
  new:      { bg: "#f1f5f9", color: "#64748b" },
  verified: { bg: "#dbeafe", color: "#1d4ed8" },
  trusted:  { bg: TEAL_50,   color: TEAL_800  },
  elite:    { bg: "#fef9c3", color: "#92400e" },
};

const TIER_DESCRIPTIONS: Record<Tier, string> = {
  new:      "You're just getting started. Complete your profile to unlock more opportunities.",
  verified: "Your profile is verified. Keep applying to improve your hire success rate.",
  trusted:  "Employers trust your profile. A strong track record puts you in the top tier.",
  elite:    "You're in the top tier. Your profile is maximally visible to employers.",
};

function nextTierMsg(score: number, thresholds: TrustData["tier_thresholds"]): string {
  if (score < thresholds.verified) return `${thresholds.verified - score} points to Verified`;
  if (score < thresholds.trusted)  return `${thresholds.trusted  - score} points to Trusted`;
  if (score < thresholds.elite)    return `${thresholds.elite    - score} points to Elite`;
  return "You've reached the highest tier";
}

// Field → profile anchor map for "Add now →" links
const FIELD_LINKS: Record<string, string> = {
  profile_photo_url:       "/worker/profile#photo",
  work_video_url:          "/worker/profile#video",
  intro_video_url:         "/worker/profile#video",
  worker_skills:           "/worker/profile#skills",
  worker_languages:        "/worker/profile#languages",
  worker_target_countries: "/worker/profile#countries",
  expected_salary:         "/worker/profile#salary",
  worker_family:           "/worker/profile#family",
  medical_certificate_url: "/worker/profile#documents",
};

// ─── SVG ring chart ───────────────────────────────────────────────────────────

function RingChart({ score, tier }: { score: number; tier: Tier }) {
  const size        = 80;
  const stroke      = 8;
  const r           = (size - stroke) / 2;
  const circ        = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circ); // starts at full offset = empty arc

  useEffect(() => {
    // Defer so the element is painted at offset=circ first, then transitions
    const id = requestAnimationFrame(() => {
      setOffset(circ - (score / 100) * circ);
    });
    return () => cancelAnimationFrame(id);
  }, [score, circ]);

  const tierLabel: Record<Tier, string> = {
    new: "New", verified: "Verified", trusted: "Trusted", elite: "Elite",
  };

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={TEAL_50}
          strokeWidth={stroke}
        />
        {/* Fill arc */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={TEAL_500}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>

      {/* Center text */}
      <div
        style={{
          position:   "absolute",
          inset:      0,
          display:    "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap:        0,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, color: TIER_COLORS[tier].color, lineHeight: 1.2 }}>
          {tierLabel[tier]}
        </span>
      </div>
    </div>
  );
}

// ─── Sub-score bar ────────────────────────────────────────────────────────────

function SubScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "#64748b", width: 150, flexShrink: 0 }}>
        {label}
      </span>
      <div
        style={{
          flex:         1,
          height:       6,
          background:   "#f1f5f9",
          borderRadius: 3,
          overflow:     "hidden",
        }}
      >
        <div
          style={{
            height:     "100%",
            width:      `${value}%`,
            background: `linear-gradient(90deg, ${TEAL_600}, ${TEAL_400})`,
            borderRadius: 3,
            transition: "width 0.8s ease-out",
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: "#94a3b8", width: 32, textAlign: "right", flexShrink: 0 }}>
        {value}
      </span>
    </div>
  );
}

// ─── History bar chart ────────────────────────────────────────────────────────

function relDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1)  return "today";
  if (days < 7)  return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

// Teal stop sequence: most recent = darkest
const BAR_TEAL = [
  "#0F6E56", "#1D9E75", "#2DB896", "#3ECFAA",
  "#52D8B4", "#70DEC0", "#91E5CC", "#AEECD8",
  "#C5F0E4", "#D8F5EC", "#E8FAF4", "#F1FDF9",
];

function HistoryChart({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) {
    return (
      <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>
        No history yet — scores are recorded each time you visit this page.
      </p>
    );
  }

  const maxScore = 100;
  const CHART_H  = 80; // px height for 100%

  return (
    <div
      style={{
        display:    "flex",
        alignItems: "flex-end",
        gap:        6,
        height:     CHART_H + 24, // bars + label space
        paddingTop: 8,
      }}
    >
      {entries.map((entry, i) => {
        const barH   = Math.max(4, Math.round((entry.score / maxScore) * CHART_H));
        const color  = BAR_TEAL[i] ?? BAR_TEAL[BAR_TEAL.length - 1];
        const tipTxt = `${entry.score} — ${entry.reason} (${new Date(entry.created_at).toLocaleDateString()})`;

        return (
          <div
            key={i}
            style={{
              flex:           1,
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "flex-end",
              gap:            4,
              height:         "100%",
            }}
          >
            <div
              title={tipTxt}
              style={{
                width:        "100%",
                height:       barH,
                background:   color,
                borderRadius: "4px 4px 0 0",
                cursor:       "default",
                transition:   "opacity 0.12s",
                minHeight:    4,
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.75"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            />
            <span style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>
              {relDate(entry.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkerTrustPage() {
  const [data,    setData]    = useState<TrustData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    workerApi.getTrust().then(res => {
      setLoading(false);
      if (!res.success) { setError(true); return; }
      setData(res.data as TrustData);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div
            style={{
              width:          36,
              height:         36,
              border:         "3px solid #e2e8f0",
              borderTopColor: TEAL_500,
              borderRadius:   "50%",
              animation:      "spin 0.7s linear infinite",
              margin:         "0 auto 12px",
            }}
          />
          <p style={{ fontSize: 14 }}>Loading trust score…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "40px 28px", textAlign: "center", color: "#94a3b8" }}>
        <p style={{ fontSize: 16 }}>Could not load trust score. Please try again later.</p>
      </div>
    );
  }

  const { trust_score, tier, tier_thresholds, completeness_score,
          completeness_items, score_breakdown, history } = data;

  const tierColor = TIER_COLORS[tier];
  const doneCount = completeness_items.filter(i => i.done).length;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 740, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
        Trust score
      </h1>

      {/* ── Card 1: Hero ────────────────────────────────────────────────────── */}
      <div
        style={{
          background:   "#fff",
          border:       "1px solid #e2e8f0",
          borderRadius: 16,
          padding:      "24px",
        }}
      >
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Ring chart */}
          <RingChart score={trust_score} tier={tier} />

          {/* Right content */}
          <div style={{ flex: 1, minWidth: 220 }}>
            {/* Tier badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  display:     "inline-flex",
                  alignItems:  "center",
                  gap:         6,
                  padding:     "4px 12px",
                  borderRadius: 20,
                  background:  tierColor.bg,
                  color:       tierColor.color,
                  fontSize:    13,
                  fontWeight:  700,
                }}
              >
                <ShieldCheck size={14} strokeWidth={2} />
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {nextTierMsg(trust_score, tier_thresholds)}
              </span>
            </div>

            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.6 }}>
              {TIER_DESCRIPTIONS[tier]}
            </p>

            {/* Sub-score breakdown bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SubScoreBar label="Profile completeness"  value={score_breakdown.profile_completeness}  />
              <SubScoreBar label="Hire success rate"     value={score_breakdown.hire_success_rate}     />
              <SubScoreBar label="Employer rating"       value={score_breakdown.employer_rating_avg}   />
              <SubScoreBar label="Document verification" value={score_breakdown.document_verification} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 2: Profile completeness ────────────────────────────────────── */}
      <div
        style={{
          background:   "#fff",
          border:       "1px solid #e2e8f0",
          borderRadius: 16,
          padding:      "24px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <span style={{ fontSize: 40, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
              {completeness_score}%
            </span>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Complete your profile to increase trust score
            </p>
          </div>
          <span style={{ fontSize: 13, color: "#94a3b8", paddingBottom: 4 }}>
            {doneCount}/{completeness_items.length} items
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height:       8,
            background:   "#f1f5f9",
            borderRadius: 4,
            overflow:     "hidden",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              height:     "100%",
              width:      `${completeness_score}%`,
              background: `linear-gradient(90deg, ${TEAL_600}, ${TEAL_400})`,
              borderRadius: 4,
              transition: "width 0.8s ease-out",
            }}
          />
        </div>

        {/* Item list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {completeness_items.map(item => (
            <div
              key={item.field}
              style={{
                display:      "flex",
                alignItems:   "center",
                justifyContent: "space-between",
                padding:      "9px 12px",
                borderRadius: 8,
                background:   item.done ? "#f8fafc" : "#fff",
                border:       `1px solid ${item.done ? "#f1f5f9" : "#fee2e2"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {item.done ? (
                  <CheckCircle2 size={16} color="#16a34a" strokeWidth={2} style={{ flexShrink: 0 }} />
                ) : (
                  <XCircle size={16} color="#dc2626" strokeWidth={2} style={{ flexShrink: 0 }} />
                )}
                <span
                  style={{
                    fontSize:       13,
                    fontWeight:     500,
                    color:          item.done ? "#475569" : "#0f172a",
                    textDecoration: item.done ? "line-through" : "none",
                  }}
                >
                  {item.label}
                </span>
              </div>

              {!item.done && FIELD_LINKS[item.field] && (
                <Link
                  href={FIELD_LINKS[item.field]}
                  style={{
                    fontSize:       12,
                    fontWeight:     600,
                    color:          TEAL_600,
                    textDecoration: "none",
                    whiteSpace:     "nowrap",
                    flexShrink:     0,
                  }}
                >
                  Add now →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Card 3: Score history ────────────────────────────────────────────── */}
      <div
        style={{
          background:   "#fff",
          border:       "1px solid #e2e8f0",
          borderRadius: 16,
          padding:      "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Score history
          </h2>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            Last {history.length} entries
          </span>
        </div>

        <HistoryChart entries={history} />

        <p style={{ fontSize: 11, color: "#cbd5e1", margin: "12px 0 0", textAlign: "right" }}>
          Hover a bar to see score + reason
        </p>
      </div>
    </div>
  );
}
