"use client";
// src/components/ui/Toast.tsx

import { useEffect, useState, useCallback, createContext, useContext } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id:      string;
  message: string;
  type:    ToastType;
}

/* ─── Config per type ────────────────────────────────────────────────────────── */

const TOAST_CONFIG: Record<ToastType, { icon: string; borderColor: string; textColor: string; bg: string }> = {
  success: { icon: "✓", borderColor: "rgba(16,185,129,0.7)",  textColor: "#34d399", bg: "rgba(16,185,129,0.08)"  },
  error:   { icon: "✕", borderColor: "rgba(244,63,94,0.7)",   textColor: "#f87171", bg: "rgba(244,63,94,0.08)"   },
  info:    { icon: "i", borderColor: "rgba(59,130,246,0.7)",   textColor: "#60a5fa", bg: "rgba(59,130,246,0.08)"  },
  warning: { icon: "!", borderColor: "rgba(245,158,11,0.7)",   textColor: "#fbbf24", bg: "rgba(245,158,11,0.08)"  },
};

/* ─── Single toast ───────────────────────────────────────────────────────────── */

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const cfg = TOAST_CONFIG[item.type];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(item.id), 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      minWidth: 280, maxWidth: 380,
      background: "rgba(30,41,59,0.9)",
      backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderLeft: `4px solid ${cfg.borderColor}`,
      borderRadius: 12,
      padding: "14px 16px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      fontFamily: "var(--font-body, 'DM Sans', system-ui, sans-serif)",
      transform: visible ? "translateX(0)" : "translateX(120%)",
      opacity:   visible ? 1 : 0,
      transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease",
    }}>
      {/* Icon */}
      <div style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: cfg.bg, color: cfg.textColor,
        fontSize: 11, fontWeight: 800,
      }}>{cfg.icon}</div>

      {/* Message */}
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#ffffff", lineHeight: 1.5, paddingTop: 3 }}>
        {item.message}
      </span>

      {/* Close */}
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(item.id), 300); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#94a3b8", fontSize: 16, lineHeight: 1,
          flexShrink: 0, padding: "2px 4px", borderRadius: 4,
          transition: "color 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "#ffffff"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; }}
        aria-label="Dismiss"
      >×</button>
    </div>
  );
}

/* ─── Toast container ────────────────────────────────────────────────────────── */

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 10,
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem item={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

/* ─── Context-based hook (optional, for global usage) ────────────────────────── */

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/* ─── Standalone hook (no context required) ──────────────────────────────────── */

export function useLocalToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((message: string, type: ToastType = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const ToastSlot = () => <ToastContainer toasts={toasts} onDismiss={dismiss} />;

  return { show, ToastSlot };
}
