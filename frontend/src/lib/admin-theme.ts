// Shared design constants for all admin pages — DirectHire glassmorphism
// design system (Phase 3). Admin role = gold (desaturated, never the
// warning/orange hue) on the shared dark glass surface — all three roles
// now share one glass shell (DashboardHeader.tsx), so admin page content
// uses the same translucent/blurred surface language, just accented gold.
import type React from "react";

export const C = {
  bg:          "var(--glass-base)",
  card:        "rgba(255,255,255,0.05)",
  cardHover:   "rgba(255,255,255,0.07)",
  border:      "rgba(255,255,255,0.1)",
  borderHover: "rgba(255,255,255,0.18)",
  text:        "#ffffff",
  muted:       "#94a3b8",
  secondary:   "#cbd5e1",
  accent:      "#E0B020", // admin-400 (gold, lightened for legibility on dark glass) — BRAND color only. Never use for destructive actions/status — use `danger` below.
  teal:        "#2DD4BF", // worker-400 — only for cross-role references (e.g. a worker row shown on an admin page)
  blue:        "#2563EB", // info
  green:       "#16A34A", // success
  yellow:      "#EA580C", // warning
  // Explicit semantic aliases — same values as green/blue/yellow above, named
  // for clarity at destructive/status call sites so they're never confused
  // with the `accent` (admin brand) color.
  success:     "#16A34A",
  danger:      "#DC2626",
  warning:     "#EA580C",
  info:        "#2563EB",
  inputBg:     "rgba(255,255,255,0.05)",
  inputBorder: "rgba(255,255,255,0.1)",
} as const;

// Reusable style helpers
export const pill = (color: string, bg: string, border: string) => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, fontWeight: 700, padding: "3px 9px",
  borderRadius: 6, color, background: bg,
  border: `1px solid ${border}`, whiteSpace: "nowrap" as const,
});

// .glass-card equivalent, expressed as a JS object for call sites that spread
// it into an inline style (mirrors the exact recipe in globals.css so this
// stays one visual token, not a second one) — container-level use only, see
// the performance rule for table rows/lists (no per-row blur).
export const card = (extra?: React.CSSProperties) => ({
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 8px 32px rgba(200,145,22,0.08)",
  ...extra,
});

// Table/list row background — solid translucent, NEVER blurred (admin tables
// can be 50+ rows; per-row backdrop-filter is the exact cost the performance
// rule exists to avoid).
export const rowBg = "rgba(30,41,59,0.6)";

export const inputStyle: React.CSSProperties = {
  background: C.inputBg,
  border: `1px solid ${C.inputBorder}`,
  borderRadius: 6,
  padding: "9px 12px",
  fontSize: 13,
  color: C.text,
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box" as const,
};
