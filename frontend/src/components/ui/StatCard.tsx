// frontend/src/components/ui/StatCard.tsx
import React from "react";

type ChangeType = "up" | "down" | "neutral";

interface StatCardProps {
  label:       string;
  value:       string | number;
  change?:     string;
  changeType?: ChangeType;
  icon?:       React.ReactNode;
  accent?:     string; // CSS color for the value
  style?:      React.CSSProperties;
}

export function StatCard({ label, value, change, changeType = "neutral", icon, accent, style }: StatCardProps) {
  const changeColor =
    changeType === "up"   ? "#34d399" :
    changeType === "down" ? "#f87171" :
    "var(--dh-muted, rgba(248,250,252,0.55))";

  const changePrefix =
    changeType === "up"   ? "↑ " :
    changeType === "down" ? "↓ " :
    "";

  return (
    <div style={{
      background: "var(--dh-navy-2, #0b1120)",
      border: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
      borderRadius: "var(--dh-radius-lg, 16px)",
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      ...style,
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(59,130,246,0.3)";
        (e.currentTarget as HTMLDivElement).style.boxShadow   = "var(--dh-shadow-glow, 0 0 60px rgba(59,130,246,0.15))";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--dh-border, rgba(59,130,246,0.15))";
        (e.currentTarget as HTMLDivElement).style.boxShadow   = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          fontSize: 11, fontWeight: 700,
          color: "var(--dh-muted, rgba(248,250,252,0.55))",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          {label}
        </span>
        {icon && (
          <div style={{
            width: 36, height: 36,
            borderRadius: "var(--dh-radius, 12px)",
            background: "rgba(59,130,246,0.1)",
            border: "1px solid var(--dh-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>

      <div style={{
        fontFamily: "var(--font-display, 'Sora', sans-serif)",
        fontSize: "clamp(1.5rem, 2vw, 1.75rem)",
        fontWeight: 800,
        color: accent ?? "var(--dh-white, #f8fafc)",
        letterSpacing: "-0.04em",
        lineHeight: 1,
      }}>
        {value}
      </div>

      {change && (
        <div style={{
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          fontSize: 12,
          fontWeight: 600,
          color: changeColor,
        }}>
          {changePrefix}{change}
        </div>
      )}
    </div>
  );
}
