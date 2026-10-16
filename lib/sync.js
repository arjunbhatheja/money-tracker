import { db, check } from './db';
import { plaid } from './plaid';
import { decrypt } from './crypto';

function txRow(t, itemId) {
  return {
    id: t.transaction_id,
    account_id: t.account_id,
    item_id: itemId,
    date: t.date,
    authorized_date: t.authorized_date,
    name: t.name,
    merchant_name: t.merchant_name,
    amount: t.amount,
    category_primary: t.personal_finance_category?.primary ?? null,
    category_detailed: t.personal_finance_category?.detailed ?? null,
    pending: Boolean(t.pending),
    payment_channel: t.payment_channel,
    updated_at: new Date().toISOString(),
  };
}

function accountRow(a, itemId) {
  return {
    id: a.account_id,
    item_id: itemId,
    name: a.name,
    official_name: a.official_name,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    current: a.balances?.current,
    available: a.balances?.available,
    credit_limit: a.balances?.limit,
    iso_currency: a.balances?.iso_currency_code,
    updated_at: new Date().toISOString(),
  };
}

// Pull new/changed/removed transactions and fresh balances for one bank login.
export async function syncItem(item) {
  const accessToken = decrypt(item.access_token_enc);
  let cursor = item.cursor || undefined;
  let added = 0, modified = 0, removed = 0;

  try {
    let hasMore = true;
    while (hasMore) {
      const page = await plaid('/transactions/sync', {
        access_token: accessToken,
        cursor,
        count: 500,
      });
      const upserts = [...page.added, ...page.modified].map((t) => txRow(t, item.id));
      if (upserts.length) check(await db().from('transactions').upsert(upserts));
      const removedIds = page.removed.map((r) => r.transaction_id);
      if (removedIds.length) check(await db().from('transactions').delete().in('id', removedIds));
      added += page.added.length;
      modified += page.modified.length;
      removed += removedIds.length;
      cursor = page.next_cursor;
      hasMore = page.has_more;
    }

    const { accounts } = await plaid('/accounts/get', { access_token: accessToken });
    if (accounts.length) check(await db().from('accounts').upsert(accounts.map((a) => accountRow(a, item.id))));

    check(
      await db()
        .from('items')
        .update({ cursor, status: 'ok', last_error: null, last_synced_at: new Date().toISOString() })
        .eq('id', item.id)
    );
  } catch (err) {
    await db()
      .from('items')
      .update({ status: err.code === 'ITEM_LOGIN_REQUIRED' ? 'login_required' : 'error', last_error: err.message })
      .eq('id', item.id);
    throw err;
  }

  return { institution: item.institution, added, modified, removed };
}

export async function syncAll() {
  const items = check(await db().from('items').select('*'));
  const results = [];
  for (const item of items) {
    try {
      results.push({ ok: true, ...(await syncItem(item)) });
    } catch (err) {
      results.push({ ok: false, institution: item.institution, error: err.message });
    }
  }
  return results;
}
