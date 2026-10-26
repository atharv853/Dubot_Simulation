import { NextRequest, NextResponse } from 'next/server';
import { decodeJwtEdge, SESSION_COOKIE_NAME } from './lib/auth/edgeAuth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? decodeJwtEdge(sessionCookie) : null;

  // Protect Host route: '/'
  if (pathname === '/') {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', '/');
      return NextResponse.redirect(loginUrl);
    }
    // Controllers cannot access full 3D Host simulator
    if (session.role === 'controller') {
      return NextResponse.redirect(new URL('/controller', request.url));
    }
  }

  // Protect Controller route: '/controller'
  if (pathname.startsWith('/controller')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', '/controller');
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect away from login if already authenticated
  if (pathname === '/login') {
    if (session) {
      if (session.role === 'controller') {
        return NextResponse.redirect(new URL('/controller', request.url));
      } else {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/controller/:path*', '/login'],
};
