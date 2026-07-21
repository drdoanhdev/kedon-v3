// filepath: middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
  // Baseline CSP — cho phép Next/PWA + Supabase; siết dần khi ổn định
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
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
