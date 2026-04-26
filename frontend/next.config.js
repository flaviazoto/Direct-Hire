// frontend/next.config.js
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

console.log(`[next.config.js] Proxying /api/* → ${BACKEND_URL}`);

const nextConfig = {
  async rewrites() {
    return [
      {
        source:      "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;