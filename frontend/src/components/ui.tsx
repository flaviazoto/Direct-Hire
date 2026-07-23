"use client";
// src/components/ui.tsx — DirectHire Dark Premium UI component library

import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg";
  color?: "blue" | "white" | "teal" | "amber" | "violet";
  className?: string;
}

const SPIN_SZ: Record<string, string> = {
  xs: "w-3 h-3 border",
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-[3px]",
};

const SPIN_CLR: Record<string, string> = {
  white:  "border-white/20 border-t-white",
  blue:   "border-blue-500/20 border-t-[#0090FF]",
  teal:   "border-worker-500/20 border-t-worker-600",
  amber:  "border-admin-500/20 border-t-admin-500",
  violet: "border-employer-500/20 border-t-employer-600",
};

export function Spinner({ size = "md", color = "blue", className }: SpinnerProps) {
  return (
    <div
      className={cn(
        "rounded-full animate-spin flex-shrink-0",
        SPIN_SZ[size],
        SPIN_CLR[color],
        className
      )}
    />
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
// DirectHire design system: primary is role-scoped (bg-{role}-600, hover
// bg-{role}-700) — pass `role` so it knows which one. Secondary/ghost/
// destructive are role-agnostic by design (never brand-colored). Sentence-
// case, active-voice labels are a call-site concern, not this component's.

export type DHRole = "worker" | "employer" | "admin";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // "outline"/"teal"/"amber" are legacy aliases kept only for call sites not
  // yet converted to the role-scoped system (outline -> secondary, teal ->
  // primary role="worker", amber -> primary role="admin") — new code should
  // use variant + role instead of these.
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline" | "teal" | "amber";
  role?: DHRole;
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

type ButtonStyleMap = {
  base: React.CSSProperties;
  hover: React.CSSProperties;
};

const ROLE_BUTTON_COLORS: Record<DHRole, { base: string; hover: string }> = {
  worker:   { base: "#0D9488", hover: "#0F766E" }, // worker-600 / 700
  employer: { base: "#7C3AED", hover: "#6D28D9" }, // employer-600 / 700
  admin:    { base: "#C89116", hover: "#A9780D" }, // admin-500 / 600
};

function getButtonStyle(variant: string, role: DHRole | undefined): ButtonStyleMap {
  switch (variant) {
    case "primary": {
      const colors = ROLE_BUTTON_COLORS[role ?? "worker"];
      return {
        base:  { background: colors.base, color: "#ffffff", border: "none" },
        hover: { background: colors.hover },
      };
    }
    case "secondary":
      return {
        base:  { background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#ffffff" },
        hover: { background: "rgba(255,255,255,0.05)" },
      };
    case "ghost":
      return {
        base:  { background: "transparent", border: "none", color: "#ffffff" },
        hover: { background: "rgba(255,255,255,0.05)" },
      };
    case "danger":
      return {
        base:  { background: "#DC2626", border: "none", color: "#ffffff" },
        hover: { background: "#B91C1C" },
      };
    case "outline":
      return {
        base:  { background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#ffffff" },
        hover: { background: "rgba(255,255,255,0.05)" },
      };
    case "teal":
      return {
        base:  { background: ROLE_BUTTON_COLORS.worker.base, color: "#ffffff", border: "none" },
        hover: { background: ROLE_BUTTON_COLORS.worker.hover },
      };
    case "amber":
      return {
        base:  { background: ROLE_BUTTON_COLORS.admin.base, color: "#ffffff", border: "none" },
        hover: { background: ROLE_BUTTON_COLORS.admin.hover },
      };
    default: {
      const colors = ROLE_BUTTON_COLORS[role ?? "worker"];
      return {
        base:  { background: colors.base, color: "#ffffff", border: "none" },
        hover: { background: colors.hover },
      };
    }
  }
}

const BTN_SIZE_STYLES: Record<string, React.CSSProperties> = {
  xs: { height: "28px", padding: "0 12px", fontSize: "12px", borderRadius: "10px", gap: "4px" },
  sm: { height: "36px", padding: "0 16px", fontSize: "13px", borderRadius: "10px", gap: "6px" },
  md: { height: "40px", padding: "0 20px", fontSize: "14px", borderRadius: "10px", gap: "8px" },
  lg: { height: "48px", padding: "0 28px", fontSize: "15px", borderRadius: "10px", gap: "8px" },
};

export function Button({
  variant = "primary",
  role,
  size = "md",
  loading,
  leftIcon,
  rightIcon,
  children,
  className,
  asChild,
  style,
  ...props
}: ButtonProps) {
  const styleMap = getButtonStyle(variant, role);
  const sizeStyle = BTN_SIZE_STYLES[size];

  const combinedStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-body,'Inter',system-ui,sans-serif)",
    fontWeight: 500,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "normal",
    transition: "background 0.15s ease",
    outline: "none",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    opacity: props.disabled || loading ? 0.5 : 1,
    pointerEvents: props.disabled || loading ? "none" : undefined,
    ...sizeStyle,
    ...styleMap.base,
    ...style,
  };

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string; style?: React.CSSProperties }>;
    return React.cloneElement(child, {
      className: cn(className, child.props.className),
      style: { ...combinedStyle, ...child.props.style },
    });
  }

  return (
    <button
      style={combinedStyle}
      className={cn(className)}
      disabled={props.disabled || loading}
      onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLButtonElement).style, styleMap.hover)}
      onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLButtonElement).style, styleMap.base)}
      {...props}
    >
      {loading ? <Spinner size="xs" color="white" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────

type AlertVariant = "info" | "success" | "warning" | "error";

const ALERT_STYLES: Record<AlertVariant, { bg: string; border: string; color: string; icon: string }> = {
  info:    { bg: "rgba(37,99,235,0.06)",  border: "1px solid rgba(37,99,235,0.2)",  color: "#2563EB", icon: "ℹ" },
  success: { bg: "rgba(22,163,74,0.06)",  border: "1px solid rgba(22,163,74,0.2)",  color: "#16A34A", icon: "✓" },
  warning: { bg: "rgba(234,88,12,0.06)",  border: "1px solid rgba(234,88,12,0.2)",  color: "#EA580C", icon: "⚠" },
  error:   { bg: "rgba(220,38,38,0.06)",  border: "1px solid rgba(220,38,38,0.2)",  color: "#DC2626", icon: "✕" },
};

export function Alert({
  variant = "info",
  title,
  children,
  onDismiss,
  className,
}: {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const s = ALERT_STYLES[variant];
  return (
    <div
      className={cn("flex gap-3 fade-up", className)}
      style={{
        background: s.bg,
        border: s.border,
        borderRadius: "12px",
        padding: "14px 16px",
        color: s.color,
        fontSize: "14px",
      }}
    >
      <span style={{ fontWeight: 700, flexShrink: 0, marginTop: "1px", fontSize: "15px", lineHeight: 1 }}>
        {s.icon}
      </span>
      <div style={{ flex: 1 }}>
        {title && (
          <div style={{ fontWeight: 600, marginBottom: "2px", fontSize: "13px" }}>{title}</div>
        )}
        <div style={{ lineHeight: 1.6, fontSize: title ? "12px" : "13px", opacity: title ? 0.85 : 1 }}>
          {children}
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            flexShrink: 0,
            opacity: 0.5,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "inherit",
            fontSize: "18px",
            lineHeight: 1,
            marginTop: "1px",
            padding: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "flat" | "ghost";
}

export function Card({
  children,
  className,
  onClick,
  onMouseEnter,
  onMouseLeave,
  variant = "default",
  style,
  ...rest
}: CardProps) {
  // Flat is the resting state everywhere: white card + 1px ink-100 border +
  // shadow-sm. "elevated" is for the rare non-modal/non-dropdown case that
  // genuinely needs more lift; still capped at shadow-md, never a decorative
  // shadow.
  // "Flat" glass is the resting state — container-level card, translucent +
  // blurred (see the .glass-card token in globals.css; kept as this JS object
  // for call sites that use <Card> directly rather than className="glass-card").
  // NEVER use Card for a repeated list row — see the performance rule; list
  // rows should use the solid-translucent-no-blur pattern (admin-theme.ts's
  // `rowBg`) instead.
  const variantStyles: Record<string, React.CSSProperties> = {
    default:  { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 8px 32px rgba(99,102,241,0.08)" },
    elevated: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6), 0 8px 32px rgba(99,102,241,0.12)" },
    flat:     { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" },
    ghost:    { background: "transparent", border: "none", borderRadius: "16px" },
  };

  return (
    <div
      {...rest}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={className}
      style={{
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
        cursor: onClick ? "pointer" : undefined,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function CardHeader({
  title,
  description,
  action,
  className,
  style,
  ...rest
}: CardHeaderProps) {
  return (
    <div
      {...rest}
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        ...style,
      }}
    >
      <div>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#ffffff",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        {description && (
          <p style={{ fontSize: "14px", color: "#94a3b8", margin: "3px 0 0 0" }}>{description}</p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0, marginLeft: "16px" }}>{action}</div>}
    </div>
  );
}

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardContent({
  children,
  className,
  style,
  ...rest
}: CardContentProps) {
  return (
    <div
      {...rest}
      className={className}
      style={{ padding: "24px", ...style }}
    >
      {children}
    </div>
  );
}

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardFooter({
  children,
  className,
  style,
  ...rest
}: CardFooterProps) {
  return (
    <div
      {...rest}
      className={className}
      style={{
        padding: "16px 24px",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(0,0,0,0.15)",
        borderRadius: "0 0 16px 16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
// Design system rule: text-xs, rounded-[6px], 4px/10px padding, background =
// 10% tint of the color, text = full color, no border. `variant` is still a
// flat color key (badges are semantic-status, not role-branded), but the
// legacy names below now point at the exact success/danger/warning/info hex
// values rather than ad-hoc dark-mode shades.

type BadgeVariantKey =
  | "blue" | "green" | "red" | "amber" | "purple"
  | "teal" | "slate" | "cyan" | "orange";

const BADGE_STYLES: Record<BadgeVariantKey, { bg: string; color: string; dot: string }> = {
  blue:   { bg: "rgba(37,99,235,0.10)",  color: "#2563EB", dot: "#2563EB" }, // info
  green:  { bg: "rgba(22,163,74,0.10)",  color: "#16A34A", dot: "#16A34A" }, // success
  red:    { bg: "rgba(220,38,38,0.10)",  color: "#DC2626", dot: "#DC2626" }, // danger
  amber:  { bg: "rgba(234,88,12,0.10)",  color: "#EA580C", dot: "#EA580C" }, // warning
  purple: { bg: "rgba(124,58,237,0.14)", color: "#A78BFA", dot: "#A78BFA" }, // employer-400 — -600 fails AA as text on the dark glass base
  teal:   { bg: "rgba(13,148,136,0.14)", color: "#2DD4BF", dot: "#2DD4BF" }, // worker-400 — same reason
  slate:  { bg: "rgba(255,255,255,0.08)", color: "#94a3b8", dot: "#94a3b8" }, // slate-400 on translucent white
  cyan:   { bg: "rgba(37,99,235,0.10)",  color: "#2563EB", dot: "#2563EB" }, // alias of info
  orange: { bg: "rgba(234,88,12,0.10)",  color: "#EA580C", dot: "#EA580C" }, // alias of warning
};

// Status → semantic-color mapping the spec calls for: pending→warning,
// shortlisted/interview→info, hired/approved→success, rejected/suspended→danger.
const STATUS_BADGE_VARIANT: Record<string, BadgeVariantKey> = {
  PENDING: "amber", PENDING_REVIEW: "amber", DRAFT: "slate",
  SHORTLISTED: "blue", INTERVIEW: "blue", INTERVIEWED: "blue", APPLICATION_INTERVIEW_REQUESTED: "blue",
  HIRED: "green", APPROVED: "green", ACCEPTED: "green", ACTIVE: "green", SUCCEEDED: "green",
  REJECTED: "red", SUSPENDED: "red", FAILED: "red", REVOKED: "red",
};

export function statusBadgeVariant(status: string): BadgeVariantKey {
  return STATUS_BADGE_VARIANT[status.toUpperCase()] ?? "slate";
}

export function Badge({
  children,
  variant = "slate",
  dot,
  className,
}: {
  children: React.ReactNode;
  variant?: string;
  dot?: boolean;
  className?: string;
}) {
  const s = BADGE_STYLES[variant as BadgeVariantKey] ?? BADGE_STYLES.slate;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 10px",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.01em",
        background: s.bg,
        color: s.color,
        lineHeight: 1.4,
      }}
    >
      {dot && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: s.dot,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: string;
  iconBg?: string;
  trend?: { direction: "up" | "down" | "neutral"; label: string };
  valueColor?: string;
  subtitle?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  iconBg = "#6366F1",
  trend,
  valueColor,
  subtitle,
  className,
}: StatCardProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: hovered ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.1)",
        borderRadius: "16px",
        padding: "24px",
        transition: "all 0.2s ease",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
        {icon ? (
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              flexShrink: 0,
              background: `${iconBg}26`,
            }}
          >
            {icon}
          </div>
        ) : (
          <div />
        )}
        {trend && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: "999px",
              background:
                trend.direction === "up"
                  ? "rgba(34,197,94,0.12)"
                  : trend.direction === "down"
                  ? "rgba(239,68,68,0.12)"
                  : "rgba(255,255,255,0.06)",
              color:
                trend.direction === "up"
                  ? "#4ade80"
                  : trend.direction === "down"
                  ? "#f87171"
                  : "#a1a1aa",
              border:
                trend.direction === "up"
                  ? "1px solid rgba(34,197,94,0.2)"
                  : trend.direction === "down"
                  ? "1px solid rgba(239,68,68,0.2)"
                  : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "—"} {trend.label}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: valueColor ?? "#ffffff",
          lineHeight: 1,
          marginBottom: "6px",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500 }}>{label}</div>
      {subtitle && (
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>{subtitle}</div>
      )}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
}

export function Input({ label, error, hint, leftIcon, className, id, style, ...props }: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const [focused, setFocused] = React.useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: error
      ? "1px solid #ef4444"
      : focused
      ? "1px solid #6366F1"
      : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: leftIcon ? "10px 14px 10px 40px" : "10px 14px",
    fontSize: "14px",
    color: "#ffffff",
    outline: "none",
    transition: "all 0.15s ease",
    fontFamily: "var(--font-body,'DM Sans',system-ui,sans-serif)",
    boxShadow: focused
      ? error
        ? "0 0 0 3px rgba(239,68,68,0.12)"
        : "0 0 0 3px rgba(99,102,241,0.15)"
      : "none",
    ...style,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }} className={className}>
      {label && (
        <label
          htmlFor={inputId}
          style={{ fontSize: "12px", fontWeight: 500, color: "#a1a1aa" }}
        >
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        {leftIcon && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              display: "flex",
              alignItems: "center",
              paddingLeft: "12px",
              pointerEvents: "none",
              color: "#555555",
            }}
          >
            <span style={{ width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {leftIcon}
            </span>
          </div>
        )}
        <input
          id={inputId}
          style={inputStyle}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
      </div>
      {hint && !error && (
        <p style={{ fontSize: "12px", color: "#71717a", margin: 0 }}>{hint}</p>
      )}
      {error && (
        <p style={{ fontSize: "12px", color: "#f87171", margin: 0, fontWeight: 500 }}>{error}</p>
      )}
    </div>
  );
}

// ─── SelectInput ──────────────────────────────────────────────────────────────

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function SelectInput({
  label,
  error,
  options,
  placeholder,
  className,
  id,
  style,
  ...props
}: SelectInputProps) {
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const [focused, setFocused] = React.useState(false);

  const selectStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: error
      ? "1px solid #ef4444"
      : focused
      ? "1px solid #6366F1"
      : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: "10px 36px 10px 14px",
    fontSize: "14px",
    color: "#ffffff",
    outline: "none",
    transition: "all 0.15s ease",
    fontFamily: "var(--font-body,'DM Sans',system-ui,sans-serif)",
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    boxShadow: focused
      ? error
        ? "0 0 0 3px rgba(239,68,68,0.12)"
        : "0 0 0 3px rgba(99,102,241,0.15)"
      : "none",
    ...style,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }} className={className}>
      {label && (
        <label
          htmlFor={selectId}
          style={{ fontSize: "12px", fontWeight: 500, color: "#a1a1aa" }}
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        style={selectStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      >
        {placeholder && (
          <option value="" style={{ background: "#1e293b", color: "#ffffff" }}>
            {placeholder}
          </option>
        )}
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: "#1e293b", color: "#ffffff" }}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p style={{ fontSize: "12px", color: "#f87171", margin: 0, fontWeight: 500 }}>{error}</p>
      )}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className, id, style, ...props }: TextareaProps) {
  const textId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const [focused, setFocused] = React.useState(false);

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: error
      ? "1px solid #ef4444"
      : focused
      ? "1px solid #6366F1"
      : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "#ffffff",
    outline: "none",
    transition: "all 0.15s ease",
    fontFamily: "var(--font-body,'DM Sans',system-ui,sans-serif)",
    resize: "vertical",
    minHeight: "100px",
    boxShadow: focused
      ? error
        ? "0 0 0 3px rgba(239,68,68,0.12)"
        : "0 0 0 3px rgba(99,102,241,0.15)"
      : "none",
    ...style,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }} className={className}>
      {label && (
        <label
          htmlFor={textId}
          style={{ fontSize: "12px", fontWeight: 500, color: "#a1a1aa" }}
        >
          {label}
        </label>
      )}
      <textarea
        id={textId}
        style={textareaStyle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {hint && !error && (
        <p style={{ fontSize: "12px", color: "#71717a", margin: 0 }}>{hint}</p>
      )}
      {error && (
        <p style={{ fontSize: "12px", color: "#f87171", margin: 0, fontWeight: 500 }}>{error}</p>
      )}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_SZ_STYLES: Record<string, { width: string; height: string; fontSize: string }> = {
  xs: { width: "24px",  height: "24px",  fontSize: "9px"  },
  sm: { width: "28px",  height: "28px",  fontSize: "10px" },
  md: { width: "36px",  height: "36px",  fontSize: "13px" },
  lg: { width: "44px",  height: "44px",  fontSize: "15px" },
  xl: { width: "56px",  height: "56px",  fontSize: "19px" },
};

function getAvatarGradient(name: string): string {
  const code = name.charCodeAt(0) || 65;
  const hue = (code * 47) % 360;
  const hue2 = (hue + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue},65%,35%), hsl(${hue2},70%,45%))`;
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const initials =
    name
      .split(" ")
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const sizeStyle = AVATAR_SZ_STYLES[size];

  return (
    <div
      className={className}
      style={{
        ...sizeStyle,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: "#ffffff",
        flexShrink: 0,
        background: getAvatarGradient(name),
        border: "1px solid rgba(255,255,255,0.1)",
        fontFamily: "var(--font-body,'DM Sans',system-ui,sans-serif)",
      }}
    >
      {initials}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 32px",
        textAlign: "center",
      }}
    >
      {icon && (
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px",
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontSize: "18px",
          fontWeight: 600,
          color: "#ffffff",
          marginTop: "20px",
          letterSpacing: "-0.02em",
          fontFamily: "var(--font-body,'Inter',system-ui,sans-serif)",
        }}
      >
        {title}
      </div>
      {description && (
        <p
          style={{
            fontSize: "14px",
            color: "#94a3b8",
            maxWidth: "400px",
            lineHeight: 1.6,
            margin: "8px 0 0 0",
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: "24px" }}>{action}</div>}
    </div>
  );
}

// ─── ErrorState ───────────────────────────────────────────────────────────────
// Replaces the content area on a failed fetch — distinct from EmptyState (which
// means "the request succeeded, there's genuinely nothing here") and from a
// toast (which is for transient action feedback, not a blocked main view).

export function ErrorState({
  message,
  retry,
  title = "Could not load this page",
  className,
}: {
  message?: string;
  retry?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "rgba(220,38,38,0.05)",
        border: "1px solid rgba(220,38,38,0.15)",
        borderRadius: 10,
        padding: "32px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 8 }}>⚠</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171", marginBottom: 6 }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: retry ? 16 : 0 }}>{message}</div>}
      {retry && (
        <button
          onClick={retry}
          style={{
            background: "#DC2626",
            border: "none",
            borderRadius: 10,
            padding: "8px 20px",
            color: "#ffffff",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 500,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        marginBottom: "32px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--teal-400,#2DD4BF)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "0 0 4px 0",
            }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.03em",
            margin: 0,
            lineHeight: 1.2,
            fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
          }}
        >
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: "14px", color: "#71717a", margin: "4px 0 0 0", lineHeight: 1.5, maxWidth: 720 }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div
          className="dh-page-header-actions"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) {
    return (
      <div
        className={className}
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "16px 0" }}
      />
    );
  }
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: "12px", margin: "16px 0" }}
    >
      <div style={{ flex: 1, borderTop: "1px solid rgba(255,255,255,0.06)" }} />
      <span
        style={{
          fontSize: "12px",
          color: "#71717a",
          background: "var(--glass-base)",
          padding: "0 4px",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, borderTop: "1px solid rgba(255,255,255,0.06)" }} />
    </div>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────

export function ProgressBar({
  value,
  color = "#6366F1",
  showLabel,
  size = "sm",
  className,
}: {
  value: number;
  color?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const v = Math.min(100, Math.max(0, value));
  const height = size === "sm" ? "4px" : "6px";

  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: "12px" }}
    >
      <div
        style={{
          flex: 1,
          background: "rgba(255,255,255,0.06)",
          borderRadius: "999px",
          height,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${v}%`,
            height: "100%",
            borderRadius: "999px",
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            boxShadow: `0 0 8px ${color}66`,
            transition: "width 0.7s ease-out",
          }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#a1a1aa",
            width: "36px",
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {v}%
        </span>
      )}
    </div>
  );
}

// ─── Tag ──────────────────────────────────────────────────────────────────────

const TAG_STYLES: Record<string, React.CSSProperties> = {
  default: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#a1a1aa" },
  blue:    { background: "rgba(99,102,241,0.08)",  border: "1px solid rgba(99,102,241,0.15)",  color: "#818cf8" },
  teal:    { background: "rgba(20,184,166,0.08)",  border: "1px solid rgba(20,184,166,0.15)",  color: "#2dd4bf" },
};

export function Tag({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "blue" | "teal";
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "8px",
        padding: "4px 10px",
        fontSize: "12px",
        fontWeight: 500,
        lineHeight: 1.4,
        ...TAG_STYLES[variant],
      }}
    >
      {children}
    </span>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export function Pagination({
  page,
  total,
  pageSize,
  onChange,
  className,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
  className?: string;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i++
    )
      pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  function PageBtn({
    active,
    disabled,
    onClick,
    children,
  }: {
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    const [hovered, setHovered] = React.useState(false);
    const style: React.CSSProperties = {
      width: "32px",
      height: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: 500,
      cursor: disabled ? "not-allowed" : "pointer",
      border: active
        ? "1px solid #6366F1"
        : hovered && !disabled
        ? "1px solid rgba(255,255,255,0.15)"
        : "1px solid rgba(255,255,255,0.06)",
      background: active ? "linear-gradient(135deg, #4F46E5, #9333EA)" : "transparent",
      color: active ? "#ffffff" : hovered && !disabled ? "#ffffff" : "#a1a1aa",
      boxShadow: active ? "0 0 12px rgba(99,102,241,0.3)" : "none",
      opacity: disabled ? 0.3 : 1,
      transition: "all 0.15s ease",
      fontFamily: "var(--font-body,'DM Sans',system-ui,sans-serif)",
    };
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={style}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        paddingTop: "16px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span style={{ fontSize: "13px", color: "#555555" }}>{total.toLocaleString()} results</span>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <PageBtn onClick={() => onChange(page - 1)} disabled={page === 1}>
          ←
        </PageBtn>
        {pages.map((p, i) =>
          p === "..." ? (
            <span
              key={`el-${i}`}
              style={{
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                color: "#555555",
              }}
            >
              …
            </span>
          ) : (
            <PageBtn
              key={p}
              active={p === page}
              onClick={() => onChange(p as number)}
            >
              {p}
            </PageBtn>
          )
        )}
        <PageBtn onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
          →
        </PageBtn>
      </div>
    </div>
  );
}

// ─── LoadingPage ──────────────────────────────────────────────────────────────

export function LoadingPage({ color = "blue" }: { color?: "blue" | "teal" | "amber" | "violet" | "slate" }) {
  const spinMap: Record<string, "blue" | "teal" | "amber" | "violet"> = {
    blue: "blue",
    teal: "teal",
    amber: "amber",
    violet: "violet",
    slate: "blue",
  };
  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--glass-base)",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #4F46E5, #9333EA)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95" />
            <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          </svg>
        </div>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display,'Manrope',system-ui,sans-serif)",
          }}
        >
          DirectHire
        </span>
      </div>
      <Spinner size="sm" color={spinMap[color] ?? "blue"} />
    </div>
  );
}

// ─── ToastDisplay ─────────────────────────────────────────────────────────────

export type ToastData = { msg: string; type: "ok" | "err" | "warn" } | null;

export function ToastDisplay({ toast }: { toast: ToastData }) {
  if (!toast) return null;

  // Semantic color of the event, never a role color.
  const iconBg      = toast.type === "ok" ? "rgba(22,163,74,0.12)"  : toast.type === "warn" ? "rgba(234,88,12,0.12)"  : "rgba(220,38,38,0.12)";
  const iconColor   = toast.type === "ok" ? "#16A34A"               : toast.type === "warn" ? "#EA580C"              : "#DC2626";
  const borderColor = iconColor;

  return (
    <div
      className="slide-in-right"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "16px 20px",
        background: "rgba(30,41,59,0.9)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: "10px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        maxWidth: "360px",
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: iconColor,
          fontSize: "12px",
          fontWeight: 700,
        }}
      >
        {toast.type === "ok" ? "✓" : toast.type === "warn" ? "⚠" : "✗"}
      </div>
      <span
        style={{
          fontSize: "14px",
          fontWeight: 500,
          color: "#ffffff",
          lineHeight: 1.4,
          fontFamily: "var(--font-body,'Inter',system-ui,sans-serif)",
        }}
      >
        {toast.msg}
      </span>
    </div>
  );
}
