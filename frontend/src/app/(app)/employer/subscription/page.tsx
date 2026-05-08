"use client";

import { useEffect, useState, useCallback } from "react";
import { employerApi } from "@/lib/api-client";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  description: string | null;
  createdAt: string;
}

interface SubscriptionStatus {
  status: string;
  plan: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  hasCustomer: boolean;
  cancelAtPeriodEnd: boolean;
  payments: Payment[];
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ACTIVE:    { label: "Active",    color: "#15803d", bg: "#f0fdf4", border: "#86efac" },
  TRIALING:  { label: "Trial",     color: "#0369a1", bg: "#f0f9ff", border: "#7dd3fc" },
  PAST_DUE:  { label: "Past Due",  color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  CANCELED:  { label: "Canceled",  color: "#6b7280", bg: "#f9fafb", border: "#d1d5db" },
  INACTIVE:  { label: "Inactive",  color: "#6b7280", bg: "#f9fafb", border: "#d1d5db" },
};

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtAmount(amount: number, currency: string) {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

export default function SubscriptionPage() {
  const [data, setData]       = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await employerApi.getSubscriptionStatus() as { success: boolean; data?: SubscriptionStatus; error?: string };
    if (res.success && res.data) setData(res.data);
    else setError(res.error ?? "Failed to load subscription");
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check for return from Stripe Checkout
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      setMsg("Payment successful! Your subscription is now active.");
      window.history.replaceState({}, "", "/employer/subscription");
    }
    if (params.get("canceled") === "1") {
      setMsg("Checkout was canceled. No charge was made.");
      window.history.replaceState({}, "", "/employer/subscription");
    }
    load();
  }, [load]);

  async function handleSubscribe() {
    setBusy(true);
    setMsg(null);
    const res = await employerApi.createSubscriptionCheckout() as { success: boolean; data?: { checkoutUrl: string }; error?: string };
    if (res.success && res.data?.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
    } else {
      setMsg(res.error ?? "Failed to create checkout session");
      setBusy(false);
    }
  }

  async function handlePortal() {
    setBusy(true);
    setMsg(null);
    const res = await employerApi.getPortalSession() as { success: boolean; data?: { portalUrl: string }; error?: string };
    if (res.success && res.data?.portalUrl) {
      window.location.href = res.data.portalUrl;
    } else {
      setMsg(res.error ?? "Failed to open billing portal");
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription? You will keep access until the end of the billing period.")) return;
    setBusy(true);
    setMsg(null);
    const res = await employerApi.cancelSubscription() as { success: boolean; message?: string; error?: string };
    if (res.success) {
      setMsg(res.message ?? "Subscription will cancel at period end.");
      await load();
    } else {
      setMsg(res.error ?? "Failed to cancel subscription");
    }
    setBusy(false);
  }

  const statusMeta = STATUS_LABELS[data?.status ?? "INACTIVE"] ?? STATUS_LABELS.INACTIVE;
  const isActive   = data?.status === "ACTIVE";
  const canCancel  = isActive && !data?.cancelAtPeriodEnd;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px", fontFamily: "'Inter', sans-serif" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
        Subscription
      </h1>
      <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 32px" }}>
        Manage your DirectHire employer subscription and billing.
      </p>

      {msg && (
        <div style={{
          padding: "12px 16px", borderRadius: 10, marginBottom: 24,
          background: msg.startsWith("Payment") ? "#f0fdf4" : "#fefce8",
          border: `1px solid ${msg.startsWith("Payment") ? "#86efac" : "#fde68a"}`,
          color: msg.startsWith("Payment") ? "#15803d" : "#92400e",
          fontSize: 14, fontWeight: 500,
        }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 15 }}>
          Loading subscription…
        </div>
      ) : error ? (
        <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, color: "#dc2626", fontSize: 14 }}>
          {error}
        </div>
      ) : (
        <>
          {/* ── Status card ── */}
          <div style={{
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
            padding: "28px 32px", marginBottom: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Status
                </p>
                <span style={{
                  display: "inline-block", marginTop: 4,
                  fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                  color: statusMeta.color, background: statusMeta.bg, border: `1px solid ${statusMeta.border}`,
                }}>
                  {statusMeta.label}
                  {data?.cancelAtPeriodEnd ? " (cancels at period end)" : ""}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px", fontSize: 14 }}>
              <div>
                <p style={{ margin: "0 0 2px", color: "#64748b", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Plan</p>
                <p style={{ margin: 0, color: "#0f172a", fontWeight: 600 }}>
                  {data?.plan === "EMPLOYER_MONTHLY" ? "Employer Monthly" : data?.plan ?? "—"}
                </p>
              </div>
              <div>
                <p style={{ margin: "0 0 2px", color: "#64748b", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
                  {data?.cancelAtPeriodEnd ? "Access until" : "Next renewal"}
                </p>
                <p style={{ margin: 0, color: "#0f172a", fontWeight: 600 }}>
                  {fmt(data?.currentPeriodEnd ?? null)}
                </p>
              </div>
              {data?.trialEndsAt && (
                <div>
                  <p style={{ margin: "0 0 2px", color: "#64748b", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>Trial ends</p>
                  <p style={{ margin: 0, color: "#0f172a", fontWeight: 600 }}>{fmt(data.trialEndsAt)}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {!isActive && !data?.cancelAtPeriodEnd && (
                <button
                  onClick={handleSubscribe}
                  disabled={busy}
                  style={{
                    padding: "10px 22px", borderRadius: 8, border: "none", cursor: busy ? "not-allowed" : "pointer",
                    background: busy ? "#94a3b8" : "#0f172a", color: "#fff", fontWeight: 700, fontSize: 14,
                  }}
                >
                  {busy ? "Redirecting…" : "Subscribe — 5,000 ALL / month"}
                </button>
              )}

              {data?.hasCustomer && (
                <button
                  onClick={handlePortal}
                  disabled={busy}
                  style={{
                    padding: "10px 22px", borderRadius: 8, border: "1px solid #e2e8f0", cursor: busy ? "not-allowed" : "pointer",
                    background: "#fff", color: "#0f172a", fontWeight: 600, fontSize: 14,
                  }}
                >
                  Manage billing
                </button>
              )}

              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={busy}
                  style={{
                    padding: "10px 22px", borderRadius: 8, border: "1px solid #fca5a5", cursor: busy ? "not-allowed" : "pointer",
                    background: "#fff", color: "#dc2626", fontWeight: 600, fontSize: 14,
                  }}
                >
                  Cancel subscription
                </button>
              )}
            </div>
          </div>

          {/* ── What's included ── */}
          {!isActive && (
            <div style={{
              background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16,
              padding: "24px 32px", marginBottom: 20,
            }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                What you get with a subscription
              </h2>
              <ul style={{ margin: 0, padding: "0 0 0 20px", color: "#374151", fontSize: 14, lineHeight: 2 }}>
                <li>Unlimited access to the verified worker directory</li>
                <li>Full contact details for workers you are interested in</li>
                <li>Reservation / lock system to secure candidates</li>
                <li>Priority job listings with logo placement</li>
                <li>Dedicated employer support</li>
              </ul>
            </div>
          )}

          {/* ── Payment history ── */}
          {(data?.payments?.length ?? 0) > 0 && (
            <div style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
              padding: "24px 32px",
            }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                Payment history
              </h2>
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {["Date", "Amount", "Description", "Status"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data!.payments.map(p => (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "10px 8px", color: "#374151" }}>{fmt(p.createdAt)}</td>
                      <td style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 600 }}>
                        {fmtAmount(p.amount, p.currency)}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#374151" }}>{p.description ?? "—"}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                          color: p.status === "SUCCEEDED" ? "#15803d" : "#dc2626",
                          background: p.status === "SUCCEEDED" ? "#f0fdf4" : "#fef2f2",
                        }}>
                          {p.status === "SUCCEEDED" ? "Paid" : p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
