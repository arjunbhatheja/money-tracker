import { NextResponse } from 'next/server';
import { plaid } from '../../../../lib/plaid';
import { encrypt } from '../../../../lib/crypto';
import { db, check } from '../../../../lib/db';
import { syncItem } from '../../../../lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  try {
    const { public_token, institution } = await req.json();
    if (!public_token) return NextResponse.json({ error: 'public_token missing' }, { status: 400 });

    const { access_token, item_id } = await plaid('/item/public_token/exchange', { public_token });
    const row = {
      id: item_id,
      institution: institution || 'Bank',
      access_token_enc: encrypt(access_token),
      status: 'ok',
    };
    check(await db().from('items').upsert(row));

    // First sync. New items can take a few seconds before transactions exist;
    // the webhook and daily cron will fill in anything missing.
    let result = null;
    try {
      result = await syncItem({ ...row, cursor: null });
    } catch (err) {
      result = { error: err.message };
    }
    return NextResponse.json({ ok: true, item_id, sync: result });
  } catch (err) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
