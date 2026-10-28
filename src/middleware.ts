import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/api/cron'];

/** Cheap gate: unauthenticated requests go to /login. Real session validation happens server-side on every request. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isPublic && !req.cookies.get('oh_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'] };
