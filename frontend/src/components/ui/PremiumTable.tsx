// frontend/src/components/ui/PremiumTable.tsx
"use client";
import React, { useState } from "react";

export interface Column<T> {
  key:     string;
  header:  string;
  render?: (row: T, i: number) => React.ReactNode;
  width?:  string; // e.g. "120px"
}

interface PremiumTableProps<T extends Record<string, unknown>> {
  columns:     Column<T>[];
  rows:        T[];
  rowKey:      (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyText?:  string;
  stickyHead?: boolean;
}

export function PremiumTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyText  = "No data available",
  stickyHead = true,
}: PremiumTableProps<T>) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  return (
    <div className="dh-table-scroll" style={{ overflowX: "auto", width: "100%", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead style={{
          position: stickyHead ? "sticky" : "static",
          top: 0,
          zIndex: 1,
          background: "var(--dh-navy-2, #0b1120)",
        }}>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: "10px 16px",
                textAlign: "left",
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--dh-muted, rgba(248,250,252,0.55))",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                borderBottom: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
                whiteSpace: "nowrap",
                width: col.width,
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{
                padding: "40px 16px",
                textAlign: "center",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
                color: "var(--dh-muted)",
              }}>
                {emptyText}
              </td>
            </tr>
          ) : rows.map((row, i) => {
            const key = rowKey(row);
            const isHovered = hoveredRow === key;
            return (
              <tr key={key}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => setHoveredRow(key)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  cursor:     onRowClick ? "pointer" : "default",
                  background: isHovered
                    ? "rgba(59,130,246,0.05)"
                    : i % 2 === 0
                      ? "transparent"
                      : "rgba(255,255,255,0.01)",
                  transition: "background 0.12s ease",
                  borderBottom: "1px solid var(--dh-border, rgba(59,130,246,0.15))",
                }}>
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding: "12px 16px",
                    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    fontSize: "0.875rem",
                    color: "var(--dh-white, #f8fafc)",
                    verticalAlign: "middle",
                    whiteSpace: col.width ? "nowrap" : undefined,
                  }}>
                    {col.render ? col.render(row, i) : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
