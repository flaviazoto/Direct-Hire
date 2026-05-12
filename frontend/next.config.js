// frontend/next.config.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

console.log(`[next.config.js] Proxying /api/* → ${API_URL}`);

const nextConfig = {
  staticPageGenerationTimeout: 300,
  experimental: {
    cpus: 2,
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