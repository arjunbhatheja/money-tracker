import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/session';

// These routes authenticate themselves (Plaid webhook, cron secret, MCP secret).
const PUBLIC_PREFIXES = ['/login', '/api/login', '/api/plaid/webhook', '/api/cron/', '/api/mcp/'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
