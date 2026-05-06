// Shared design constants for all admin pages
// Match the reference: admin/jobs/page.tsx
import type React from "react";

export const C = {
  bg:          "#0A0A0A",
  card:        "#111111",
  cardHover:   "#161616",
  border:      "rgba(255,255,255,0.07)",
  borderHover: "rgba(255,255,255,0.13)",
  text:        "#ffffff",
  muted:       "#71717a",
  secondary:   "#a1a1aa",
  accent:      "#dc2626",   // admin red
  teal:        "#14b8a6",   // action teal
  blue:        "#0090FF",   // info blue
  green:       "#22c55e",   // success
  yellow:      "#f59e0b",   // warning
  inputBg:     "rgba(255,255,255,0.05)",
  inputBorder: "rgba(255,255,255,0.1)",
} as const;

// Reusable style helpers
export const pill = (color: string, bg: string, border: string) => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, fontWeight: 700, padding: "3px 9px",
  borderRadius: 99, color, background: bg,
  border: `1px solid ${border}`, whiteSpace: "nowrap" as const,
});

export const card = (extra?: React.CSSProperties) => ({
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  ...extra,
});

export const inputStyle: React.CSSProperties = {
  background: C.inputBg,
  border: `1px solid ${C.inputBorder}`,
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  color: C.text,
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box" as const,
};
