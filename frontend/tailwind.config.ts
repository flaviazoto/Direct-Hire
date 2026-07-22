// frontend/tailwind.config.ts
import type { Config } from "tailwindcss";

const GRID_SVG = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231E3258' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs:   '375px',
        sm:   '640px',
        md:   '768px',
        lg:  '1024px',
        xl:  '1280px',
        '2xl': '1536px',
      },
      fontFamily: {
        sans:    ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Manrope", "system-ui", "sans-serif"],
        body:    ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)", "IBM Plex Mono", "monospace"],
      },
      colors: {
        // ── DirectHire design system (current) ──────────────────────────────
        // Three roles, three colors: worker=teal, employer=violet, admin=gold
        // (+dark sidebar). Status/verification badges use the semantic colors
        // below, never these role colors.
        worker:   { 50:'#F0FDFA',100:'#CCFBF1',200:'#99F6E4',300:'#5EEAD4',400:'#2DD4BF',500:'#14B8A6',600:'#0D9488',700:'#0F766E',800:'#115E59',900:'#134E4A' },
        employer: { 50:'#F5F3FF',100:'#EDE9FE',200:'#DDD6FE',300:'#C4B5FD',400:'#A78BFA',500:'#8B5CF6',600:'#7C3AED',700:'#6D28D9',800:'#5B21B6',900:'#4C1D95' },
        admin:    { 50:'#FEFBEA',100:'#FDF3C7',200:'#FBE58A',300:'#F5CE4E',400:'#E0B020',500:'#C89116',600:'#A9780D',700:'#8A5F0A',800:'#6E4A08',900:'#4A3106' },
        ink:      { 50:'#F8FAFC',100:'#F1F5F9',300:'#CBD5E1',500:'#64748B',800:'#1E293B',950:'#0B1120' },
        success: '#16A34A',
        danger:  '#DC2626',
        warning: '#EA580C',
        info:    '#2563EB',
        // ── Legacy palette — kept only until the full site sweep replaces
        // every remaining inline-hex/old-token page (see design_system memory).
        // Do not use these in new or converted code; delete this whole block
        // once no page references navy/brand/surface/old-teal/old-gold anymore.
        navy: {
          DEFAULT: "#08142A",
          mid:     "#0D1F3C",
          // New numeric scale
          950: "#060B18",
          900: "#0A1628",
          800: "#0F2040",
          700: "#152A55",
          600: "#1E3A6E",
        },
        brand: {
          DEFAULT: "#1848CC",
          light:   "#2563EB",
          sky:     "#60A5FA",
        },
        // ── Teal — override with new scale ──
        teal: {
          DEFAULT: "#14B8A6",
          light:   "#0891B2",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
        },
        // ── Gold ──
        gold: {
          400: "#FBBF24",
          500: "#F59E0B",
        },
        // ── Surface system ──
        surface: {
          DEFAULT: "#0F1C35",
          raised:  "#162140",
          border:  "#1E3258",
          subtle:  "#243660",
        },
      },
      backgroundImage: {
        "grid-navy": GRID_SVG,
      },
    },
  },
  plugins: [],
};

export default config;
