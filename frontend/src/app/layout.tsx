// frontend/src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter, Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "../styles/design-system.css";
import { AuthProvider } from "@/context/AuthContext";

// DirectHire design system fonts — Inter for all UI/body/forms/tables/nav,
// Manrope for display (marketing H1s, section headers), IBM Plex Mono for
// every numeric value (scores, IDs, currency, countdowns). Weights capped at
// 400-700 — never thinner, since lighter weights fail on non-Latin scripts.
const inter = Inter({
  subsets:  ["latin"],
  weight:   ["400", "500", "600", "700"],
  variable: "--font-body",
  display:  "swap",
});

const manrope = Manrope({
  subsets:  ["latin"],
  weight:   ["400", "500", "600", "700"],
  variable: "--font-display",
  display:  "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets:  ["latin"],
  weight:   ["400", "500", "600"],
  variable: "--font-mono",
  display:  "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title:       "DirectHire — AI Global Job Marketplace",
  description: "AI-powered global employment platform connecting skilled workers with international employers in 94 countries.",
  keywords:    "global jobs, international hiring, AI matching, worker placement, recruitment platform",
  openGraph: {
    title:       "DirectHire — AI Global Job Marketplace",
    description: "AI-powered global employment platform.",
    type:        "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className="scroll-smooth">
      <body className={`${inter.variable} ${manrope.variable} ${plexMono.variable} antialiased`} style={{ overflowX: 'hidden' }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
