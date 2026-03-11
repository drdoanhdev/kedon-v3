//next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: { 
    ignoreDuringBuilds: true 
  },
  typescript: { 
    ignoreBuildErrors: true 
  },
  serverExternalPackages: ['@prisma/client'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

module.exports = nextConfig

module.exports = nextConfig
