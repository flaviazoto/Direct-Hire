"use client";
// src/app/(app)/employer/billing/page.tsx

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { userApi, employerApi } from "@/lib/api-client";
import {
  LoadingPage,
  PageHeader,
  Badge,
  Button,
  ToastDisplay,
  type ToastData,
} from "@/components/ui";

interface BillingData {
  currentPlan?: string;
  status?: string;
  trialEndsAt?: string;
  nextBillingDate?: string;
  amount?: number;
  currency?: string;
  invoices?: { id: string; date: string; amount: number; status: string; description: string }[];
}

interface ProfileData {
  profile?: {
    subscriptionPlan?: string;
    subscriptionStatus?: string;
    trialEndsAt?: string;
    companyName?: string;
  } | null;
  user?: { email: string };
}

const PLANS = [
  {
    key: "STARTER",
    name: "Starter",
    price: "€49",
    period: "/ month",
    accent: "#60A5FA",
    accentBg: "rgba(96,165,250,0.10)",
    features: ["5 active job posts", "50 candidate views/mo", "Basic AI matching", "Email support"],
  },
  {
    key: "PROFESSIONAL",
    name: "Professional",
    price: "€149",
    period: "/ month",
    accent: "#818CF8",
    accentBg: "rgba(129,140,248,0.10)",
    features: ["20 active job posts", "Unlimited candidate views", "Advanced AI matching", "Worker Lock™ (5/mo)", "Priority support"],
    highlighted: true,
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    price: "€499",
    period: "/ month",
    accent: "#A78BFA",
    accentBg: "rgba(167,139,250,0.10)",
    features: ["Unlimited job posts", "Unlimited views", "Full AI suite", "Unlimited Worker Locks", "Dedicated manager"],
  },
];

function EmployerBillingContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState<ToastData>(null);

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    Promise.all([
      userApi.getProfile(),
      employerApi.getBilling(),
    ]).then(([profileRes, billingRes]) => {
      if (!profileRes.success) { router.push("/login"); return; }
      setProfile(profileRes.data as ProfileData);
      if (billingRes.success) setBilling(billingRes.data as BillingData);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingPage color="blue" />;

  const currentPlan = profile?.profile?.subscriptionPlan ?? billing?.currentPlan;
  const planStatus  = profile?.profile?.subscriptionStatus ?? billing?.status;
  const trialEnds   = profile?.profile?.trialEndsAt ?? billing?.trialEndsAt;

  const currentPlanData = PLANS.find(p => p.key === currentPlan?.toUpperCase());

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, margin: "0 auto" }}>
      <ToastDisplay toast={toast} />

      <PageHeader
        title="Subscription & Billing"
        description="Manage your plan and payment details"
      />

      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 24 }}>

        {/* ── Left column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Current plan hero */}
          <div style={{
            borderRadius: 20, padding: 28, position: "relative", overflow: "hidden",
            background: "linear-gradient(135deg,#1e1b4b 0%,#312e81 40%,#4338ca 100%)",
            boxShadow: "0 8px 32px rgba(99,102,241,0.25)",
          }}>
            <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(129,140,248,0.15)", filter: "blur(40px)", pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Current Plan</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{
                  fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
                  fontWeight: 800, fontSize: 28, color: "#ffffff",
                }}>
                  {currentPlan ?? "No Plan"}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
                  background: planStatus === "ACTIVE" ? "rgba(52,211,153,0.2)" : planStatus === "TRIAL" ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.1)",
                  color:      planStatus === "ACTIVE" ? "#34D399" : planStatus === "TRIAL" ? "#FBBF24" : "rgba(255,255,255,0.5)",
                }}>
                  {planStatus ?? "Inactive"}
                </span>
              </div>
              {currentPlanData && (
                <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 800, fontSize: 36, color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                  {currentPlanData.price}<span style={{ fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.5)" }}>{currentPlanData.period}</span>
                </div>
              )}
              {trialEnds && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
                  Trial ends {new Date(trialEnds).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
              )}
              {!currentPlan && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0 }}>Choose a plan to unlock hiring features.</p>
              )}
            </div>
          </div>

          {/* Billing history */}
          {billing?.invoices && billing.invoices.length > 0 && (
            <div style={{ background: "var(--surface,#0F1C35)", border: "1px solid var(--surface-border,#1E3258)", borderRadius: 20, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--surface-border,#1E3258)" }}>
                <span style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 700, fontSize: 14, color: "var(--text-primary,#F0F4FF)" }}>Billing History</span>
              </div>
              {billing.invoices.map((inv, i) => (
                <div key={inv.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: i < (billing.invoices?.length ?? 0) - 1 ? "1px solid var(--surface-border,#1E3258)" : "none",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary,#F0F4FF)" }}>{inv.description}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted,#4A5980)", marginTop: 2 }}>
                      {new Date(inv.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary,#F0F4FF)", marginBottom: 4 }}>€{inv.amount.toFixed(2)}</div>
                    <Badge variant={inv.status === "PAID" ? "green" : "amber"}>{inv.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contact card */}
          <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: "20px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted,#4A5980)", marginBottom: 6 }}>Need a custom enterprise plan?</p>
            <a href="mailto:billing@directhire.io" style={{ fontSize: 13, fontWeight: 600, color: "#818CF8", textDecoration: "none" }}>
              billing@directhire.io
            </a>
          </div>
        </div>

        {/* ── Right column: plan cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 700, fontSize: 13, color: "var(--text-muted,#4A5980)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Available Plans</div>
          {PLANS.map(plan => {
            const isCurrent = currentPlan?.toUpperCase() === plan.key;
            return (
              <div key={plan.key} style={{
                background: "var(--surface,#0F1C35)",
                border: isCurrent ? `1px solid rgba(129,140,248,0.5)` : "1px solid var(--surface-border,#1E3258)",
                borderRadius: 18, padding: "24px 24px",
                boxShadow: isCurrent ? "0 0 24px rgba(99,102,241,0.12)" : "none",
                transition: "border-color 0.2s",
                position: "relative",
              }}>
                {isCurrent && (
                  <div style={{
                    position: "absolute", top: -11, left: 24,
                    background: "linear-gradient(135deg,#6366F1,#4F46E5)",
                    color: "#F0F4FF", fontSize: 10, fontWeight: 800,
                    padding: "4px 12px", borderRadius: 999, letterSpacing: "0.06em",
                  }}>CURRENT PLAN</div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 800, fontSize: 18, color: "var(--text-primary,#F0F4FF)" }}>{plan.name}</div>
                    {plan.highlighted && (
                      <div style={{ fontSize: 11, color: "#818CF8", fontWeight: 600, marginTop: 2 }}>Most Popular</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)", fontWeight: 800, fontSize: 28, color: plan.accent }}>{plan.price}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted,#4A5980)" }}>{plan.period}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary,#8B9CC8)" }}>
                      <span style={{ color: "#34D399", fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                <Button
                  variant={isCurrent ? "secondary" : "primary"}
                  size="sm"
                  disabled={isCurrent}
                  style={{ width: "100%" }}
                  onClick={() => showToast("Billing portal coming soon — contact support to upgrade", "ok")}
                >
                  {isCurrent ? "Current Plan" : `Switch to ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function EmployerBillingPage() {
  return (
    <Suspense fallback={<LoadingPage color="blue" />}>
      <EmployerBillingContent />
    </Suspense>
  );
}
