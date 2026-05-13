//next.config.js
/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  // Disable in development to avoid stale SW caches & verbose logs.
  disable: process.env.NODE_ENV === 'development',
  register: true,
  // Auto-update: a new SW activates as soon as it installs and takes control of all clients.
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
  },
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  buildExcludes: [
    /middleware-manifest\.json$/,
    /_middleware\.js$/,
    /\.map$/,
    /app-build-manifest\.json$/,
  ],
  publicExcludes: [
    '!robots.txt',
    '!sitemap.xml',
    '!zalo_verifier*.html',
  ],
  fallbacks: {
    document: '/offline',
  },
});

const nextConfig = {
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['@prisma/client'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/icons/:all*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
