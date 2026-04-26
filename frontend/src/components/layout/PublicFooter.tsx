"use client";
// frontend/src/components/layout/PublicFooter.tsx

const COLS = [
  {
    heading: "Platform",
    links: [
      { label:"For Workers",   href:"/for-workers"   },
      { label:"For Employers", href:"/for-employers" },
      { label:"Pricing",       href:"/pricing"       },
      { label:"Browse jobs",   href:"/jobs"          },
    ],
  },
  {
    heading: "Company",
    links: [
      { label:"About",   href:"/about"   },
      { label:"Contact", href:"/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label:"Terms of service", href:"/terms"   },
      { label:"Privacy policy",   href:"/privacy" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer style={{
      background:"var(--navy-900,#0A1628)",
      borderTop:"1px solid var(--surface-border,#1E3258)",
      padding:"64px 0 32px",
    }}>
      <div className="container">
        <div style={{
          display:"grid",
          gridTemplateColumns:"2fr 1fr 1fr 1fr",
          gap:48, marginBottom:48,
        }}>
          {/* Brand */}
          <div>
            <div style={{
              fontFamily:"var(--font-display,'Bricolage Grotesque',system-ui,sans-serif)",
              fontWeight:800, fontSize:"1.4rem",
              color:"var(--text-primary,#F0F4FF)",
              letterSpacing:"-0.03em", marginBottom:14,
            }}>
              Direct<span style={{ color:"#0090FF" }}>Hire</span>
            </div>
            <p style={{
              fontSize:"0.875rem",
              color:"var(--text-muted,#4A5980)",
              fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)",
              lineHeight:1.6, maxWidth:240,
            }}>
              AI-powered global job marketplace connecting verified workers with trusted employers worldwide.
            </p>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.heading}>
              <p style={{
                fontSize:"0.75rem", fontWeight:600,
                color:"var(--text-primary,#F0F4FF)",
                fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)",
                letterSpacing:"0.06em", textTransform:"uppercase",
                marginBottom:16,
              }}>
                {col.heading}
              </p>
              <ul style={{ listStyle:"none", padding:0, margin:0, display:"flex", flexDirection:"column", gap:10 }}>
                {col.links.map(link => (
                  <li key={link.href}>
                    <a href={link.href}
                      style={{
                        color:"var(--text-muted,#4A5980)", textDecoration:"none",
                        fontSize:"0.875rem",
                        fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)",
                        transition:"color 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--text-secondary,#8B9CC8)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted,#4A5980)")}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop:"1px solid var(--surface-border,#1E3258)",
          paddingTop:24,
          display:"flex", justifyContent:"space-between",
          alignItems:"center", flexWrap:"wrap", gap:12,
        }}>
          <p style={{
            fontSize:"0.8rem",
            color:"var(--text-muted,#4A5980)",
            fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)",
          }}>
            © {new Date().getFullYear()} DirectHire Ltd. All rights reserved.
          </p>
          <p style={{
            fontSize:"0.8rem",
            color:"var(--text-muted,#4A5980)",
            fontFamily:"var(--font-body,'DM Sans',system-ui,sans-serif)",
          }}>
            Built for global workers everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
