// frontend/src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Sora, DM_Sans } from "next/font/google";
import "./globals.css";
import "../styles/design-system.css";
import { AuthProvider } from "@/context/AuthContext";

const sora = Sora({
  subsets:  ["latin"],
  weight:   ["300", "400", "500", "600", "700"],
  variable: "--font-display",
  display:  "swap",
});

const dmSans = DM_Sans({
  subsets:  ["latin"],
  weight:   ["300", "400", "500", "600"],
  variable: "--font-body",
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
    <html lang="en" data-theme="dark" className="scroll-smooth">
      <body className={`${sora.variable} ${dmSans.variable} antialiased`} style={{ overflowX: 'hidden' }}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
