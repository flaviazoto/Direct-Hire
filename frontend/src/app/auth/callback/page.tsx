"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function isSafeRedirect(path: string): boolean {
  try {
    if (!path || !path.startsWith("/")) return false;
    if (path.startsWith("//")) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(path)) return false;
    const decoded = decodeURIComponent(path);
    if (decoded.includes("://") || decoded.startsWith("//")) return false;
    return true;
  } catch { return false; }
}

function CallbackContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { refresh }  = useAuth();
  const called       = useRef(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token        = searchParams.get("token");
    const raw          = searchParams.get("redirect") ?? "";
    const safeRedirect = isSafeRedirect(raw) ? raw : "/";
    const returnedNonce = searchParams.get("nonce");
    const storedNonce   = sessionStorage.getItem("oauth_nonce");

    if (!token) {
      setIsError(true);
      setTimeout(() => router.replace("/login?error=oauth_failed"), 2000);
      return;
    }

    // Verify nonce only when one was stored (i.e. flow originated from our login page)
    if (storedNonce !== null) {
      sessionStorage.removeItem("oauth_nonce");
      if (!returnedNonce || returnedNonce !== storedNonce) {
        setIsError(true);
        setTimeout(() => router.replace("/login?error=invalid_state"), 2000);
        return;
      }
    }

    fetch("/api/auth/oauth/complete", {
      method:      "POST",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("exchange_failed");
        await refresh();
        router.replace(safeRedirect);
      })
      .catch(() => {
        setIsError(true);
        setTimeout(() => router.replace("/login?error=oauth_failed"), 2000);
      });
  }, [searchParams, refresh, router]);

  return (
    <>
      {isError ? (
        <>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger, #ef4444)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p style={{ color: "var(--danger, #ef4444)", fontSize: "0.875rem" }}>
            Something went wrong. Redirecting…
          </p>
        </>
      ) : (
        <>
          <div style={{
            width: 40, height: 40, border: "3px solid var(--border, rgba(255,255,255,0.12))",
            borderTopColor: "var(--blue-4, #60a5fa)", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ color: "var(--muted, rgba(248,250,252,0.55))", fontSize: "0.875rem" }}>
            Signing you in…
          </p>
        </>
      )}
    </>
  );
}

function CallbackFallback() {
  return (
    <>
      <div style={{
        width: 40, height: 40, border: "3px solid var(--border, rgba(255,255,255,0.12))",
        borderTopColor: "var(--blue-4, #60a5fa)", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <p style={{ color: "var(--muted, rgba(248,250,252,0.55))", fontSize: "0.875rem" }}>
        Signing you in…
      </p>
    </>
  );
}

export default function OAuthCallbackPage() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--navy, #05080f)", flexDirection: "column", gap: 16,
    }}>
      <Suspense fallback={<CallbackFallback />}>
        <CallbackContent />
      </Suspense>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
