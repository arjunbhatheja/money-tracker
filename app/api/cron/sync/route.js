import { NextResponse } from 'next/server';
import { syncAll } from '../../../../lib/sync';
import { safeEqual } from '../../../../lib/session';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ results: await syncAll() });
}
