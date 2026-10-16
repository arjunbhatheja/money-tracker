import { NextResponse } from 'next/server';
import { categorize } from '../../../lib/budget';
import { db, check } from '../../../lib/db';

export const runtime = 'nodejs';

// { id, bucket, remember?, note? }  — or { id, confirm: true } to accept the guess.
export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id missing' }, { status: 400 });
    if (body.rename !== undefined) {
      const note = String(body.rename).trim().slice(0, 120) || null;
      check(await db().from('transactions').update({ note }).eq('id', body.id));
      return NextResponse.json({ ok: true, note });
    }
    if (body.confirm) {
      check(await db().from('transactions').update({ reviewed_at: new Date().toISOString() }).eq('id', body.id));
      return NextResponse.json({ ok: true });
    }
    const result = await categorize(body.id, body.bucket, { remember: Boolean(body.remember), note: body.note });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
