"use client";
// Shown when a public page can't load its data (for example the API is
// briefly unreachable). Pages throw rather than render empty content, so
// visitors see this with a retry instead of a misleading empty list or 404.

export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ background: "var(--glass-base)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="glass-card" style={{ maxWidth: 440, padding: "36px 32px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display,'Manrope',system-ui,sans-serif)", fontWeight: 700, fontSize: 22, color: "#ffffff", marginBottom: 10 }}>
          This page is temporarily unavailable
        </h1>
        <p style={{ fontSize: 15, color: "#94a3b8", lineHeight: 1.6, marginBottom: 24 }}>
          We couldn&apos;t load the latest information. Please try again in a moment.
        </p>
        <button onClick={reset} className="btn-gradient" style={{ padding: "12px 28px", border: "none", cursor: "pointer" }}>
          Try again
        </button>
      </div>
    </main>
  );
}
