import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;
  
  // Redirect old Pump Scorecard URL to new Short Check URL
  if (hostname.includes('pump-scorecard')) {
    const targetUrl = new URL(`https://short-check.vercel.app${pathname}`);
    // Preserve query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });
    return NextResponse.redirect(targetUrl, 308); // 308 = Permanent Redirect
  }
  
  // If hostname contains "short-check", redirect root to /short-check
  if (hostname.includes('short-check') && pathname === '/') {
    return NextResponse.redirect(new URL('/short-check', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - share routes (to avoid any interference with share links)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|share|_next/static|_next/image|favicon.ico).*)',
  ],
};

