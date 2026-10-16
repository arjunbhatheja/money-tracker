import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, MAX_AGE_SECONDS, safeEqual } from '../../../lib/session';

export const runtime = 'nodejs';

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.json({ error: 'APP_PASSWORD is not set' }, { status: 500 });

  if (!safeEqual(String(password || ''), expected)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}
