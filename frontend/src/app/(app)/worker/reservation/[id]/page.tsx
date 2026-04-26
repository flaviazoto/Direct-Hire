"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { workerApi } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Reservation {
  id:                 string;
  lock_status:        "ACTIVE" | "EXPIRED" | "RELEASED" | "OVERRIDDEN";
  lock_start_date:    string;
  lock_expiry_date:   string;
  employer_name:      string;
  job_title?:         string;
  salary_offered?:    number;
  salary_currency?:   string;
  contract_type?:     string;
  start_date?:        string;
  visa_sponsorship?:  boolean;
  relocation?:        boolean;
  ai_match_score?:    number;
}

// ── Countdown timer ────────────────────────────────────────────────────────────

function useCountdown(expiryDate: string) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiryDate).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Expired"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [expiryDate]);

  return remaining;
}

// ── Timeline step ──────────────────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { label: "Employer reviewed your profile" },
  { label: "AI matched you as top candidate" },
  { label: "Reservation sent"               },
  { label: "Awaiting your response"         },
  { label: "Contract negotiation"           },
  { label: "Employment confirmed"           },
];

function TimelineStep({ step, index, currentStep }: { step: string; index: number; currentStep: number }) {
  const done    = index < currentStep;
  const current = index === currentStep;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", paddingBottom: index < TIMELINE_STEPS.length - 1 ? 20 : 0, position: "relative" }}>
      {index < TIMELINE_STEPS.length - 1 && (
        <div style={{ position: "absolute", left: 11, top: 24, width: 2, height: 20, background: done ? "var(--worker-primary)" : "rgba(124,58,237,0.15)" }} />
      )}
      <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "var(--worker-primary)" : current ? "rgba(124,58,237,0.2)" : "var(--navy-3)", border: current ? "2px solid var(--worker-primary)" : "none", animation: current ? "pulseViolet 2s ease-in-out infinite" : "none" }}>
        {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
        {current && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--worker-primary)" }} />}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: done || current ? "var(--white)" : "var(--muted)", fontWeight: done || current ? 500 : 400, paddingTop: 2 }}>{step}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkerReservationPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [actionState, setActionState] = useState<"idle" | "accepting" | "declining" | "success" | "declined">("idle");
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const countdown = useCountdown(reservation?.lock_expiry_date ?? new Date().toISOString());

  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await workerApi.getLockStatus();
    setLoading(false);
    if (!res.success) { setError("Could not load reservation details."); return; }
    const d = res.data as Record<string, unknown>;
    if (!d.is_locked) { router.push("/worker/reservations"); return; }
    setReservation({
      id,
      lock_status:       "ACTIVE",
      lock_start_date:   (d.lock_start_date as string) ?? new Date().toISOString(),
      lock_expiry_date:  (d.lock_expiry_date as string) ?? new Date(Date.now() + 48 * 3600_000).toISOString(),
      employer_name:     (d.employer_name as string) ?? "Employer",
      job_title:         (d.job_title as string) ?? undefined,
      salary_offered:    (d.salary_offered as number) ?? undefined,
      salary_currency:   (d.salary_currency as string) ?? "USD",
      contract_type:     (d.contract_type as string) ?? undefined,
      start_date:        (d.start_date as string) ?? undefined,
      visa_sponsorship:  (d.visa_sponsorship as boolean) ?? false,
      relocation:        (d.relocation as boolean) ?? false,
      ai_match_score:    (d.ai_match_score as number) ?? undefined,
    });
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async () => {
    setActionState("accepting");
    await new Promise(r => setTimeout(r, 900));
    setActionState("success");
    showToast("Reservation accepted! The employer has been notified.", "ok");
  };

  const handleDecline = async () => {
    setShowDeclineConfirm(false);
    setActionState("declining");
    await new Promise(r => setTimeout(r, 700));
    setActionState("declined");
    showToast("Reservation declined.", "ok");
    setTimeout(() => router.push("/worker/reservations"), 2000);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(124,58,237,0.2)", borderTopColor: "var(--worker-primary)", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: "center" as const, color: "var(--danger)", fontFamily: "var(--font-body)" }}>{error}</div>
  );

  if (!reservation) return null;

  return (
    <div style={{ padding: "40px 32px", maxWidth: 760, margin: "0 auto" }}>
      <style>{`
        @keyframes spin        { to { transform: rotate(360deg); } }
        @keyframes pulseViolet { 0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.6); } 50% { box-shadow: 0 0 0 6px rgba(124,58,237,0); } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: toast.type === "ok" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)", border: `1px solid ${toast.type === "ok" ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`, borderRadius: "var(--r-md)", padding: "14px 20px", color: toast.type === "ok" ? "var(--success)" : "var(--danger)", fontFamily: "var(--font-body)", fontSize: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
          {toast.msg}
        </div>
      )}

      {/* Main card */}
      <div style={{ background: "var(--navy-2)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 24, overflow: "hidden" }}>

        {/* Status banner */}
        <div style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(139,92,246,0.1))", borderBottom: "1px solid rgba(124,58,237,0.2)", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pulse-dot-violet" />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--worker-3)" }}>You&apos;ve Been Reserved!</span>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 2 }}>Reservation expires in</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--worker-primary)" }}>{countdown}</div>
          </div>
        </div>

        {/* Employer info */}
        <div style={{ padding: "32px", display: "flex", alignItems: "flex-start", gap: 20, borderBottom: "1px solid rgba(124,58,237,0.08)" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, var(--employer-primary), var(--employer-2))", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {reservation.employer_name[0] ?? "E"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--white)", marginBottom: 8 }}>{reservation.employer_name}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
              <span className="badge" style={{ background: "rgba(13,148,136,0.12)", color: "var(--employer-3)", border: "1px solid rgba(13,148,136,0.25)" }}>Verified Employer</span>
              <span className="badge" style={{ background: "var(--glass)", color: "var(--muted)", border: "1px solid var(--border)" }}>🌍 International</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
              {[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= 4 ? "var(--gold)" : "var(--border)", fontSize: 16 }}>★</span>)}
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--muted)", marginLeft: 6 }}>4.8 / 5.0 (312 reviews)</span>
            </div>
          </div>
        </div>

        {/* Job details */}
        <div style={{ padding: "28px 32px", borderBottom: "1px solid rgba(124,58,237,0.08)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 6 }}>Position Reserved For</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--white)", marginBottom: 12 }}>{reservation.job_title ?? "Position"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                {reservation.contract_type && <span className="badge badge-interview">{reservation.contract_type}</span>}
                <span className="badge badge-pending">📍 Remote Available</span>
              </div>
              {reservation.salary_offered && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4 }}>Salary Offered</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--worker-primary)" }}>
                    {reservation.salary_currency} {reservation.salary_offered.toLocaleString()}<span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--muted)", fontWeight: 400 }}>/month</span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              {[
                ["Start Date", reservation.start_date ? new Date(reservation.start_date).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" }) : "To be discussed"],
                ["Contract Duration", "12 months (renewable)"],
                ["Visa Sponsorship", reservation.visa_sponsorship ? "✓ Yes" : "✗ No"],
                ["Relocation Support", reservation.relocation ? "✓ Yes" : "✗ No"],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 3 }}>{l}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--white)", fontWeight: 500 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI verification badge */}
        {reservation.ai_match_score && (
          <div style={{ margin: "0 32px", padding: "14px 20px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "var(--r-md)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--success)", fontWeight: 500 }}>
                AI Verified Match — {reservation.ai_match_score}% compatibility score between your profile and this position
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ padding: "28px 32px", borderTop: "1px solid rgba(124,58,237,0.08)" }}>
          {actionState === "success" ? (
            <div style={{ textAlign: "center" as const, padding: "24px 0" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(16,185,129,0.12)", border: "2px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--success)", marginBottom: 8 }}>Reservation Accepted!</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--muted)" }}>The employer has been notified. They will contact you shortly.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <button disabled={actionState !== "idle"} onClick={handleAccept} style={{ padding: "16px 20px", background: "linear-gradient(135deg, var(--worker-primary), var(--worker-2))", border: "none", borderRadius: "var(--r-md)", color: "white", fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, cursor: actionState !== "idle" ? "not-allowed" : "pointer", boxShadow: "0 4px 20px var(--worker-glow)", transition: "all 0.2s", opacity: actionState !== "idle" ? 0.7 : 1 }}>
                  {actionState === "accepting" ? "Confirming..." : "Accept & Confirm ✓"}
                </button>
                <button disabled={actionState !== "idle"} style={{ padding: "16px 20px", background: "transparent", border: "2px solid var(--worker-primary)", borderRadius: "var(--r-md)", color: "var(--worker-3)", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                  Request Interview First →
                </button>
                <button disabled={actionState !== "idle"} onClick={() => setShowDeclineConfirm(true)} style={{ padding: "16px 20px", background: "transparent", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "var(--r-md)", color: "rgba(244,63,94,0.7)", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "all 0.2s" }}>
                  Decline
                </button>
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--muted)", textAlign: "center" as const, lineHeight: 1.6 }}>
                Accepting this reservation does not guarantee employment. Final offer subject to employer verification.
              </div>
            </>
          )}
        </div>

        {/* Timeline */}
        <div style={{ padding: "24px 32px 32px", borderTop: "1px solid rgba(124,58,237,0.08)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--muted)", marginBottom: 20, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Timeline</div>
          {TIMELINE_STEPS.map((step, i) => (
            <TimelineStep key={i} step={step.label} index={i} currentStep={actionState === "success" ? 4 : 3} />
          ))}
        </div>
      </div>

      {/* Decline confirm dialog */}
      {showDeclineConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "var(--navy-2)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 20, padding: 36, maxWidth: 440, width: "90%" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--white)", margin: "0 0 12px" }}>Decline Reservation?</h3>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--muted)", lineHeight: 1.65, marginBottom: 24 }}>
              Are you sure you want to decline this reservation from <strong style={{ color: "var(--white)" }}>{reservation.employer_name}</strong>? This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setShowDeclineConfirm(false)} style={{ flex: 1, padding: "12px", background: "var(--glass)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--white)", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleDecline} style={{ flex: 1, padding: "12px", background: "rgba(244,63,94,0.15)", border: "1px solid rgba(244,63,94,0.35)", borderRadius: "var(--r-md)", color: "var(--danger)", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Confirm Decline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
