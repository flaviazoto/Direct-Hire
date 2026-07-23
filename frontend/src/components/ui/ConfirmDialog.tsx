"use client";
// src/components/ui/ConfirmDialog.tsx

import { useEffect } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

export interface ConfirmDialogProps {
  open:          boolean;
  title?:        string;
  message:       string;
  confirmLabel?: string;
  cancelLabel?:  string;
  danger?:       boolean;
  onConfirm:     () => void;
  onCancel:      () => void;
}

/* ─── ConfirmDialog ──────────────────────────────────────────────────────────── */

export function ConfirmDialog({
  open, title = "Are you sure?", message,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  danger = true, onConfirm, onCancel,
}: ConfirmDialogProps) {

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBg = danger
    ? "linear-gradient(135deg, #dc2626, #ef4444)"
    : "linear-gradient(135deg, var(--glass-indigo), var(--glass-purple))";
  const confirmShadow = danger
    ? "0 4px 18px rgba(220,38,38,0.4)"
    : "0 4px 18px rgba(99,102,241,0.35)";

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onCancel}
        className="glass-scrim"
        style={{ zIndex: 9990, animation: "fadeIn 0.15s ease" }}
      />

      {/* Dialog card */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 9991,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}>
        <div className="glass-modal" style={{
          padding: "36px 32px",
          maxWidth: 420, width: "100%",
          fontFamily: "var(--font-body, 'DM Sans', system-ui, sans-serif)",
          animation: "scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}>

          {/* Icon */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", margin: "0 auto 4px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: danger ? "rgba(220,38,38,0.12)" : "rgba(99,102,241,0.15)",
              fontSize: 22,
            }}>
              {danger ? "⚠️" : "❓"}
            </div>
          </div>

          {/* Title */}
          <h2 style={{
            fontFamily: "var(--font-display, 'Sora', sans-serif)",
            fontWeight: 700, fontSize: 20,
            color: "#ffffff",
            textAlign: "center", margin: "0 0 12px",
            letterSpacing: "-0.5px",
          }}>{title}</h2>

          {/* Message */}
          <p style={{
            fontSize: 14, color: "#94a3b8",
            textAlign: "center", lineHeight: 1.65, margin: "0 0 28px",
          }}>{message}</p>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            {/* Cancel — ghost */}
            <button
              onClick={onCancel}
              className="btn-glass"
              style={{
                flex: 1, padding: "12px 20px",
                fontFamily: "var(--font-body, 'DM Sans', system-ui, sans-serif)",
                fontSize: 14,
              }}
            >{cancelLabel}</button>

            {/* Confirm — filled */}
            <button
              onClick={onConfirm}
              style={{
                flex: 1, padding: "12px 20px", borderRadius: 10,
                background: confirmBg, border: "none",
                color: "#fff",
                fontFamily: "var(--font-body, 'DM Sans', system-ui, sans-serif)",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                boxShadow: confirmShadow,
                transition: "opacity 0.15s, transform 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
            >{confirmLabel}</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.94) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </>
  );
}
