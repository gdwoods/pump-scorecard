import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  
  // If hostname contains "short-check", redirect root to /short-check
  if (hostname.includes('short-check') && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/short-check', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/',
};

