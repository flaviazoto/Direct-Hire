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
    <div style={{
      background: "var(--dh-navy-2, #0b1120)",
      border: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
      borderRadius: "var(--dh-radius-lg, 16px)",
      overflow: "hidden",
      ...style,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
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
          <div style={{ fontSize: "0.8125rem" }}>
            {action}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: noPad ? 0 : 20 }}>
        {children}
      </div>
    </div>
  );
}
