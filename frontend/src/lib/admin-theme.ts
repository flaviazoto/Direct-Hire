// Shared design constants for all admin pages — DirectHire design system.
// Admin role = gold (desaturated, never the warning/orange hue) + light
// surfaces for page content. The sidebar itself stays dark (bg-ink-950) per
// the design system's "admin sidebar is dark; worker/employer are light"
// rule — that's handled in DashboardHeader.tsx, not here.
import type React from "react";

export const C = {
  bg:          "#F8FAFC", // ink-50
  card:        "#FFFFFF",
  cardHover:   "#F8FAFC", // ink-50
  border:      "#F1F5F9", // ink-100
  borderHover: "#CBD5E1", // ink-300
  text:        "#0B1120", // ink-950
  muted:       "#64748B", // ink-500
  secondary:   "#1E293B", // ink-800
  accent:      "#C89116", // admin-500 (gold) — BRAND color only. Never use for destructive actions/status — use `danger` below.
  teal:        "#14B8A6", // worker-500 — only for cross-role references (e.g. a worker row shown on an admin page)
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
  inputBg:     "#FFFFFF",
  inputBorder: "#CBD5E1", // ink-300
} as const;

// Reusable style helpers
export const pill = (color: string, bg: string, border: string) => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, fontWeight: 700, padding: "3px 9px",
  borderRadius: 6, color, background: bg,
  border: `1px solid ${border}`, whiteSpace: "nowrap" as const,
});

export const card = (extra?: React.CSSProperties) => ({
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  boxShadow: "0 1px 2px rgba(11,17,32,0.04)",
  ...extra,
});

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
