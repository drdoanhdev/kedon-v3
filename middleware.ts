// filepath: middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/request'

export function middleware(request: NextRequest) {
  // Tạm thời vô hiệu hóa để tránh conflict
  return NextResponse.next()
}

export const config = {
  matcher: []
}