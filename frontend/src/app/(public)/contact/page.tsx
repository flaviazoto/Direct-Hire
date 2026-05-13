"use client";

import { useState } from "react";
import { Footer } from "@/components/Footer";

// ── Social icons (same paths as Footer.tsx) ───────────────────────────────────
const LinkedInIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const FacebookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const CHANNELS = [
  { icon: "📧", label: "Email",   value: "hello@directhire.cc",   desc: "General enquiries" },
  { icon: "🏢", label: "Sales",   value: "sales@directhire.cc",   desc: "Enterprise & partnership" },
  { icon: "🛟", label: "Support", value: "support@directhire.cc", desc: "Technical & account help" },
];

const SOCIALS = [
  { label: "LinkedIn", href: "#", Icon: LinkedInIcon },
  { label: "X",        href: "#", Icon: XIcon        },
  { label: "Facebook", href: "#", Icon: FacebookIcon  },
];

const STATUS_LINES = [
  { label: "General",  online: true  },
  { label: "Sales",    online: true  },
  { label: "Support",  online: false },
];

export default function ContactPage() {
  const [form, setForm]       = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const getContactType = (subject: string): "general" | "sales" | "support" => {
    const value = subject.toLowerCase();
    if (value.includes("sales") || value.includes("employer") || value.includes("partnership")) return "sales";
    if (value.includes("support") || value.includes("technical")) return "support";
    return "general";
  };

  const getValidationError = () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();

    if (name.length < 2) return "Please enter your name.";
    if (/<[^>]*>/.test(name)) return "Please remove HTML from your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.includes("..")) return "Please enter a valid email address.";
    if (message.length < 10) return "Please write at least 10 characters so we know how to help.";
    if (message.length > 2000) return "Please keep your message under 2000 characters.";
    return "";
  };

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.message) return;
    const validationError = getValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject || "General enquiry",
          message: form.message.trim(),
          type: getContactType(form.subject),
          website: "",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const fieldErrors = data?.fieldErrors as Record<string, string> | undefined;
        const firstFieldError = fieldErrors ? Object.values(fieldErrors)[0] : undefined;
        throw new Error(firstFieldError || data?.error || "Message could not be sent. Please try again.");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be sent. Please email hello@directhire.cc directly.");
    } finally {
      setLoading(false);
    }
  };

  const inputBase: React.CSSProperties = {
    width: "100%", padding: "13px 16px",
    border: "1.5px solid var(--surface-border,#1E3258)", borderRadius: 12,
    fontSize: 15, outline: "none",
    fontFamily: "var(--font-body,'DM Sans',system-ui,sans-serif)",
    color: "var(--text-primary,#F0F4FF)",
    background: "var(--surface,#0F1C35)",
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = "rgba(0,144,255,0.5)";
      e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(0,144,255,0.1)";
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = "var(--surface-border,#1E3258)";
      e.currentTarget.style.boxShadow   = "none";
    },
  };

  return (
    <main style={{ background: "var(--navy-950,#060B18)", minHeight: "100vh", color: "var(--text-primary,#F0F4FF)" }}>
      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{ padding: "140px 32px 80px", background: "var(--navy-950,#060B18)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-10%", left: "50%", transform: "translateX(-50%)", width: 600, height: 500, borderRadius: "50%", background: "rgba(0,144,255,0.08)", filter: "blur(120px)", pointerEvents: "none" }} />
        <div className="container" style={{ position: "relative" }}>
          <div className="contact-hero-split" style={{ display: "flex", alignItems: "center", gap: "4rem" }}>

            {/* Left: copy */}
            <div style={{ flex: "0 0 60%" }}>
              <p style={{ color: "#60A5FA", fontWeight: 600, fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase" as const, fontFamily: "var(--font-body)", marginBottom: 20 }}>
                Contact us
              </p>
              <h1 className="text-display-lg" style={{ color: "var(--text-primary,#F0F4FF)", marginBottom: 16, textAlign: "left" as const }}>Get in touch</h1>
              <p className="text-body-lg" style={{ maxWidth: 460 }}>Have a question, a partnership idea, or need help? We&apos;re here.</p>
            </div>

            {/* Right: response time card */}
            <div className="contact-hero-card" style={{ flex: "0 0 40%", display: "flex", justifyContent: "center" }}>
              <div style={{
                width: "100%", maxWidth: 300,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 20, padding: "28px 24px",
              }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontFamily: "var(--font-body)", marginBottom: 10 }}>
                  Average response time
                </div>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 38, letterSpacing: "-2px",
                  background: "linear-gradient(135deg,#0090FF,#6366F1)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  lineHeight: 1, marginBottom: 4,
                }}>
                  &lt; 24 hours
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-body)", marginBottom: 24 }}>
                  on business days
                </div>

                {/* Online status dots */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
                  {STATUS_LINES.map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-body)" }}>{s.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: s.online ? "#34D399" : "#FBBF24",
                          boxShadow: s.online ? "0 0 6px rgba(52,211,153,0.6)" : "0 0 6px rgba(251,191,36,0.6)",
                        }} />
                        <span style={{ fontSize: 12, color: s.online ? "#34D399" : "#FBBF24", fontFamily: "var(--font-body)", fontWeight: 600 }}>
                          {s.online ? "Online" : "Limited"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── FORM + SIDEBAR ───────────────────────────────────────────────────── */}
      <section style={{ padding: "60px 32px 100px" }}>
        <div className="container">
          <div className="contact-grid" style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 64, alignItems: "start" }}>

            {/* Form card */}
            <div className="card-surface contact-form-card" style={{ padding: "48px 44px" }}>
              {sent ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 48, marginBottom: 20 }}>✅</div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "var(--text-primary,#F0F4FF)", marginBottom: 12 }}>Message sent!</h3>
                  <p style={{ color: "var(--text-muted,#4A5980)", fontSize: 15, lineHeight: 1.65, fontFamily: "var(--font-body)", marginBottom: 24 }}>
                    We&apos;ll get back to you within 24 hours. Check your inbox for a confirmation.
                  </p>
                  <button
                    onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", message: "" }); }}
                    style={{
                      background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
                      padding: "10px 20px", color: "rgba(255,255,255,0.5)", fontSize: 14,
                      fontFamily: "var(--font-body)", cursor: "pointer", transition: "color 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.5)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <>
                  <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, color: "var(--text-primary,#F0F4FF)", marginBottom: 28 }}>Send a message</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {error && (
                      <div
                        role="alert"
                        style={{
                          border: "1px solid rgba(248,113,113,0.35)",
                          background: "rgba(127,29,29,0.22)",
                          color: "#fecaca",
                          borderRadius: 10,
                          padding: "12px 14px",
                          fontSize: 14,
                          lineHeight: 1.5,
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {error}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="name-email-grid">
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary,#8B9CC8)", marginBottom: 6, display: "block", fontFamily: "var(--font-body)" }}>Your Name *</label>
                        <input
                          style={inputBase}
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Ana Koci"
                          {...focusHandlers}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary,#8B9CC8)", marginBottom: 6, display: "block", fontFamily: "var(--font-body)" }}>Email Address *</label>
                        <input
                          style={inputBase}
                          type="email"
                          value={form.email}
                          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="you@example.com"
                          {...focusHandlers}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary,#8B9CC8)", marginBottom: 6, display: "block", fontFamily: "var(--font-body)" }}>Subject</label>
                      <select
                        style={{ ...inputBase, appearance: "none" as const }}
                        value={form.subject}
                        onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                        {...focusHandlers}
                      >
                        <option value="">Select a topic...</option>
                        <option>General enquiry</option>
                        <option>Employer / sales question</option>
                        <option>Worker support</option>
                        <option>Technical issue</option>
                        <option>Partnership</option>
                        <option>Press / media</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary,#8B9CC8)", marginBottom: 6, display: "block", fontFamily: "var(--font-body)" }}>Message *</label>
                      <textarea
                        style={{ ...inputBase, resize: "vertical" as const, minHeight: 140 }}
                        value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        placeholder="Tell us how we can help..."
                        {...focusHandlers}
                      />
                    </div>

                    <button
                      onClick={handleSubmit}
                      disabled={loading || !form.name || !form.email || !form.message}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "15px", borderRadius: 12, fontWeight: 700, fontSize: 16,
                        color: "#F0F4FF", border: "none", cursor: loading || !form.name || !form.email || !form.message ? "not-allowed" : "pointer",
                        background: "linear-gradient(135deg,#0090FF,#0070CC)",
                        boxShadow: "0 6px 20px rgba(0,144,255,0.3)",
                        opacity: loading || !form.name || !form.email || !form.message ? 0.6 : 1,
                        fontFamily: "var(--font-body)",
                        transition: "opacity 0.15s",
                      }}
                    >
                      {loading && (
                        <span style={{
                          display: "inline-block", width: 14, height: 14,
                          border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                          borderRadius: "50%", animation: "spin 0.7s linear infinite",
                          marginRight: 8, flexShrink: 0,
                        }} />
                      )}
                      {loading ? "Sending…" : "Send Message →"}
                    </button>

                  </div>
                </>
              )}
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Channel cards */}
              {CHANNELS.map(ch => (
                <div key={ch.label} className="card-surface" style={{ padding: "20px 24px", display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(0,144,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{ch.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary,#F0F4FF)", fontFamily: "var(--font-body)" }}>{ch.label}</div>
                    <div style={{ fontSize: 14, color: "#60A5FA", fontWeight: 600, fontFamily: "var(--font-body)" }}>{ch.value}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted,#4A5980)", fontFamily: "var(--font-body)" }}>{ch.desc}</div>
                  </div>
                </div>
              ))}

              {/* Response time card */}
              <div className="card-surface" style={{ padding: "20px 24px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary,#F0F4FF)", marginBottom: 6, fontFamily: "var(--font-body)" }}>Response time</div>
                <p style={{ fontSize: 14, color: "var(--text-muted,#4A5980)", lineHeight: 1.65, fontFamily: "var(--font-body)", margin: 0 }}>
                  We typically respond within <strong style={{ color: "var(--text-secondary,#8B9CC8)" }}>24 hours</strong> on business days. Urgent support issues are prioritized on Growth and Enterprise plans.
                </p>
              </div>

              {/* Social links card */}
              <div className="card-surface" style={{ padding: "20px 24px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary,#F0F4FF)", marginBottom: 14, fontFamily: "var(--font-body)" }}>Follow us</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {SOCIALS.map(({ label, href, Icon }) => (
                    <a
                      key={label}
                      href={href}
                      aria-label={label}
                      style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "rgba(255,255,255,0.4)",
                        transition: "background 0.15s, color 0.15s, border-color 0.15s",
                        textDecoration: "none",
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.background = "rgba(0,144,255,0.12)";
                        el.style.color = "#60A5FA";
                        el.style.borderColor = "rgba(0,144,255,0.25)";
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.background = "rgba(255,255,255,0.04)";
                        el.style.color = "rgba(255,255,255,0.4)";
                        el.style.borderColor = "rgba(255,255,255,0.08)";
                      }}
                    >
                      <Icon />
                    </a>
                  ))}
                </div>
              </div>

              {/* Registered office */}
              <div style={{ background: "rgba(0,144,255,0.06)", border: "1px solid rgba(0,144,255,0.15)", borderRadius: 16, padding: "20px 24px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary,#F0F4FF)", marginBottom: 6, fontFamily: "var(--font-body)" }}>🏢 Registered office</div>
                <p style={{ fontSize: 13, color: "var(--text-muted,#4A5980)", lineHeight: 1.65, fontFamily: "var(--font-body)", margin: 0 }}>
                  DirectHire Ltd<br />
                  Rruga e Durrësit 42<br />
                  Tirana, Albania
                </p>
              </div>

            </div>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1024px) {
          .contact-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .contact-hero-split  { flex-direction: column !important; }
          .contact-hero-card   { display: none !important; }
          .contact-form-card   { padding: 24px !important; }
          .name-email-grid     { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
