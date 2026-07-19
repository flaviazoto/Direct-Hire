"use client";

import { useCallback, useEffect, useState } from "react";
import { workerApi } from "@/lib/api-client";
import { ErrorState } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  description: string | null;
  stripeInvoiceId: string | null;
  createdAt: string;
}

interface PaymentsData {
  payments: Payment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totalSpend: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function typeLabel(type: string) {
  if (type === "SUBSCRIPTION")   return "Subscription";
  if (type === "WORKER_LOCK")    return "Reservation Fee";
  if (type === "APPLICATION_FEE") return "Application Fee";
  return type;
}

function typeColor(type: string): string {
  if (type === "SUBSCRIPTION")   return "#7c3aed";
  if (type === "WORKER_LOCK")    return "#0ea5e9";
  if (type === "APPLICATION_FEE") return "#10b981";
  return "#6b7280";
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    SUCCEEDED: { label: "Paid",     bg: "rgba(16,185,129,0.15)", color: "#34d399" },
    PENDING:   { label: "Pending",  bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
    FAILED:    { label: "Failed",   bg: "rgba(239,68,68,0.15)",  color: "#f87171" },
    REFUNDED:  { label: "Refunded", bg: "rgba(107,114,128,0.15)", color: "#9ca3af" },
  };
  const s = map[status] ?? { label: status, bg: "rgba(107,114,128,0.15)", color: "#9ca3af" };
  return (
    <span style={{
      background:   s.bg,
      color:        s.color,
      borderRadius: "999px",
      padding:      "2px 10px",
      fontSize:     "11px",
      fontWeight:   600,
      letterSpacing: "0.02em",
    }}>
      {s.label}
    </span>
  );
}

function TypeIcon({ type }: { type: string }) {
  const color = typeColor(type);
  if (type === "SUBSCRIPTION") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
    </svg>
  );
  if (type === "WORKER_LOCK") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkerPaymentsPage() {
  const [data, setData]     = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [page, setPage]     = useState(1);
  const limit = 10;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    (workerApi.getPayments({ page: String(page), limit: String(limit) }) as Promise<{ success: boolean; data?: PaymentsData; error?: string }>)
      .then((r) => {
        if (r.success && r.data) setData(r.data);
        else setError(r.error ?? "Could not load payment history.");
      })
      .catch(() => setError("Network error - check your connection."))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const payments    = data?.payments ?? [];
  const totalPages  = data?.totalPages ?? 1;
  const totalSpend  = data?.totalSpend ?? 0;
  const totalCount  = data?.total ?? 0;
  const successCount = payments.filter(p => p.status === "SUCCEEDED").length;

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-6 pb-8 md:px-8 mx-auto" style={{ maxWidth: "900px" }}>

      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-body)" }}>
          Payment History
        </h1>
        <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.45)", fontSize: "14px" }}>
          All fees and charges associated with your account.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          {
            label: "Total Spent",
            value: totalSpend > 0 ? formatAmount(totalSpend, "USD") : "$0.00",
            sub:   "Lifetime payments",
            color: "#7c3aed",
          },
          {
            label: "Transactions",
            value: String(totalCount),
            sub:   "All time",
            color: "#0ea5e9",
          },
          {
            label: "Successful",
            value: loading ? "—" : String(successCount),
            sub:   "This page",
            color: "#10b981",
          },
        ].map(card => (
          <div key={card.label} style={{
            background:   "rgba(255,255,255,0.04)",
            border:       "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding:      "20px 24px",
          }}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
              {card.label}
            </div>
            <div style={{ fontSize: "26px", fontWeight: 700, color: card.color, fontVariantNumeric: "tabular-nums" }}>
              {loading ? "—" : card.value}
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={{
        background:   "rgba(255,255,255,0.03)",
        border:       "1px solid rgba(255,255,255,0.08)",
        borderRadius: "14px",
      }}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
            Loading payments…
          </div>
        ) : error ? (
          <div style={{ padding: "24px" }}>
            <ErrorState message={error} retry={load} title="Could not load payment history" />
          </div>
        ) : payments.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px", opacity: 0.2 }}>💳</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "15px" }}>No payments yet.</div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "13px", marginTop: "6px" }}>
              Fees from applications and reservations will appear here.
            </div>
          </div>
        ) : (
          <div style={{ minWidth: 520 }}>
            {/* Table header */}
            <div style={{
              display:         "grid",
              gridTemplateColumns: "1fr 140px 110px 100px 80px",
              padding:         "12px 24px",
              borderBottom:    "1px solid rgba(255,255,255,0.07)",
              fontSize:        "11px",
              fontWeight:      600,
              color:           "rgba(255,255,255,0.3)",
              textTransform:   "uppercase",
              letterSpacing:   "0.06em",
            }}>
              <span>Description</span>
              <span>Type</span>
              <span>Date</span>
              <span style={{ textAlign: "right" }}>Amount</span>
              <span style={{ textAlign: "center" }}>Status</span>
            </div>

            {/* Rows */}
            {payments.map((pmt, i) => (
              <div key={pmt.id} style={{
                display:         "grid",
                gridTemplateColumns: "1fr 140px 110px 100px 80px",
                padding:         "16px 24px",
                borderBottom:    i < payments.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                alignItems:      "center",
              }}>
                {/* Description + icon */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width:        "32px",
                    height:       "32px",
                    borderRadius: "8px",
                    background:   `${typeColor(pmt.type)}18`,
                    display:      "flex",
                    alignItems:   "center",
                    justifyContent: "center",
                    flexShrink:   0,
                  }}>
                    <TypeIcon type={pmt.type} />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                      {pmt.description || typeLabel(pmt.type)}
                    </div>
                    {pmt.stripeInvoiceId && (
                      <a
                        href={`https://pay.stripe.com/invoices/${pmt.stripeInvoiceId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "11px", color: "#7c3aed", textDecoration: "none" }}
                      >
                        Download invoice ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Type */}
                <div style={{ fontSize: "13px", color: typeColor(pmt.type), fontWeight: 500 }}>
                  {typeLabel(pmt.type)}
                </div>

                {/* Date */}
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>
                  {formatDate(pmt.createdAt)}
                </div>

                {/* Amount */}
                <div style={{ fontSize: "14px", color: "#fff", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {formatAmount(pmt.amount, pmt.currency)}
                </div>

                {/* Status */}
                <div style={{ textAlign: "center" }}>
                  {statusBadge(pmt.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "24px" }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              background:   "rgba(255,255,255,0.05)",
              border:       "1px solid rgba(255,255,255,0.1)",
              color:        page === 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
              borderRadius: "8px",
              padding:      "6px 14px",
              cursor:       page === 1 ? "not-allowed" : "pointer",
              fontSize:     "13px",
            }}
          >
            Previous
          </button>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              background:   "rgba(255,255,255,0.05)",
              border:       "1px solid rgba(255,255,255,0.1)",
              color:        page === totalPages ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
              borderRadius: "8px",
              padding:      "6px 14px",
              cursor:       page === totalPages ? "not-allowed" : "pointer",
              fontSize:     "13px",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
