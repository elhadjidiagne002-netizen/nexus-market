// ═══════════════════════════════════════════════════════════════════════════
// GasTon 360 — next.config.js
// FIX CORS : headers configurés pour Vercel (en complément du middleware.js)
// ═══════════════════════════════════════════════════════════════════════════

/** @type {import('next').NextConfig} */
const nextConfig = {

  // ── Headers CORS sur toutes les routes /api/* ──────────────────────────
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',      value: 'https://nexus-market-md360.vercel.app' },
          { key: 'Access-Control-Allow-Methods',     value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers',     value: 'Content-Type,Authorization,X-Requested-With,stripe-signature' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
      // Service Worker : nécessite ces headers pour fonctionner
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control',               value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed',       value: '/' },
        ],
      },
      // Manifest PWA
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
    ];
  },

  // ── Domaines d'images autorisés (Supabase Storage) ────────────────────
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pqcqbstbdujzaclsiosv.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // ── Rewrites optionnels (si vous voulez /health au lieu de /api/health)
  // async rewrites() {
  //   return [
  //     { source: '/health', destination: '/api/health' },
  //   ];
  // },

  reactStrictMode: true,
  poweredByHeader: false,   // Sécurité : ne pas exposer "X-Powered-By: Next.js"
};

module.exports = nextConfig;
