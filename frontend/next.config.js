// frontend/next.config.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

console.log(`[next.config.js] Proxying /api/* → ${API_URL}`);

// Content-Security-Policy, shipped REPORT-ONLY first: browsers report
// violations to /api/csp-report (logged by the API) without blocking
// anything. Once the logs show no legitimate violations, switch the header
// name to Content-Security-Policy. Origins: Stripe (payments), Supabase
// (signed image/video URLs behind /api/media), Google (OAuth avatars,
// sign-in form post), Cloudflare Turnstile (contact form). Fonts are
// self-hosted by next/font.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://*.stripe.com",
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://*.supabase.co",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\")" },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig = {
  staticPageGenerationTimeout: 300,
  experimental: {
    cpus: 2,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      {
        source:      "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
