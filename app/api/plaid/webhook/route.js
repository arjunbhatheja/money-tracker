import { NextResponse } from 'next/server';
import { db, check } from '../../../../lib/db';
import { syncItem } from '../../../../lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Plaid calls this when new transactions are ready. The only thing it can
// trigger is a sync of an item we already have, so an unverified call can't
// do harm beyond an extra sync.
// TODO before opening this to other users: verify the Plaid-Verification JWT.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const syncTypes = new Set(['SYNC_UPDATES_AVAILABLE', 'DEFAULT_UPDATE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE']);

  if (body.webhook_type === 'TRANSACTIONS' && syncTypes.has(body.webhook_code) && body.item_id) {
    const rows = check(await db().from('items').select('*').eq('id', body.item_id).limit(1));
    if (rows[0]) {
      try {
        await syncItem(rows[0]);
      } catch {
        /* status is recorded on the item */
      }
    }
  } else if (body.webhook_type === 'ITEM' && body.item_id) {
    const status = ['ERROR', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT'].includes(body.webhook_code)
      ? 'login_required'
      : undefined;
    if (status) await db().from('items').update({ status, last_error: body.webhook_code }).eq('id', body.item_id);
  }
  return NextResponse.json({ received: true });
}
