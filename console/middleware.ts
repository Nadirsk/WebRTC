import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  const isPublicPath = path === '/login' || path === '/register';
  const hasSession = request.cookies.has('laravel_session');

  if (!isPublicPath && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isPublicPath && hasSession) {
    return NextResponse.redirect(new URL('/projects', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
