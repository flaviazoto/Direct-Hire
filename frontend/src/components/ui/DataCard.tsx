// frontend/src/components/ui/DataCard.tsx
import React from "react";

interface DataCardProps {
  title:    string;
  action?:  React.ReactNode;
  children: React.ReactNode;
  style?:   React.CSSProperties;
  noPad?:   boolean; // skip body padding (for tables that need edge-to-edge rows)
}

export function DataCard({ title, action, children, style, noPad }: DataCardProps) {
  return (
    <div className="dh-data-card" style={{
      background: "var(--dh-navy-2, #0b1120)",
      border: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
      borderRadius: "var(--dh-radius-lg, 16px)",
      overflow: "hidden",
      minWidth: 0,
      ...style,
    }}>
      {/* Header */}
      <div className="dh-data-card-header" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "16px 20px",
        borderBottom: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
      }}>
        <h3 style={{
          fontFamily: "var(--font-display, 'Sora', sans-serif)",
          fontWeight: 700,
          fontSize: "0.9375rem",
          color: "var(--dh-white, #f8fafc)",
          margin: 0,
          letterSpacing: "-0.02em",
        }}>
          {title}
        </h3>
        {action && (
          <div style={{ fontSize: "0.8125rem", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            {action}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: noPad ? 0 : 20, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
