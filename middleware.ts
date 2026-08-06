// filepath: middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const isProd = process.env.NODE_ENV === 'production';

function buildCsp(): string {
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com";

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:*",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (process.env.CSP_REPORT_URI?.trim()) {
    directives.push(`report-uri ${process.env.CSP_REPORT_URI.trim()}`);
  }

  return directives.join('; ');
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
  'Content-Security-Policy': buildCsp(),
};

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // HSTS chỉ trên HTTPS production
  if (request.nextUrl.protocol === 'https:' || process.env.VERCEL) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  // Chặn serve source maps trên production
  if (
    process.env.NODE_ENV === 'production' &&
    request.nextUrl.pathname.endsWith('.map')
  ) {
    return new NextResponse('Not found', { status: 404 });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Áp dụng headers cho mọi route trừ static tối ưu của Next
     * (_next/static assets vẫn nhận headers từ matcher này trừ khi exclude)
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|robots.txt).*)',
  ],
};
