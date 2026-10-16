import { db, check } from './db';

export const TIME_ZONE = 'America/Chicago';

// Monthly plan (take-home ~$8,000). Edit these numbers to change the plan.
export const PLAN = {
  owner: /arjun bhathej/i, // transfers to/from yourself are never spending
  income: 8000,
  fixed: [
    { name: 'Rent (with fees)', amount: 1118.5 },
    { name: 'Car insurance (GEICO)', amount: 188.01 },
    { name: 'Claude', amount: 100 },
    { name: 'Fuel', amount: 100 },
    { name: 'Electricity', amount: 93 },
    { name: 'Internet', amount: 40 },
    { name: 'Phone', amount: 38 },
    { name: 'Gas utility', amount: 33.92 },
    { name: "Renter's insurance", amount: 14 },
  ],
  buckets: { food: 600, yourself: 680 },
  india: 650,
  savings: 4343,
};

export const BUCKETS = {
  food: 'Food',
  yourself: 'Yourself',
  bills: 'Bills',
  india: 'India',
  big_purchase: 'Big purchase (from savings)',
  savings: 'Savings / investing',
  income: 'Income',
  ignore: 'Not counted',
};
export const BUCKET_KEYS = Object.keys(BUCKETS);

export const fixedTotal = () => PLAN.fixed.reduce((s, b) => s + b.amount, 0);
const round = (n) => Math.round(n * 100) / 100;

// ---------- dates ----------
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}
const toDate = (s) => new Date(`${s}T12:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * 864e5));
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);

// ---------- merchant keys & classification ----------
// "Zelle payment to Nibble B JPM99cx82c08" -> "zelle payment to nibble b"
export function merchantKey(t) {
  const raw = String(t.merchant_name || t.name || '').toLowerCase();
  const out = [];
  for (const tok of raw.split(/\s+/)) {
    if (/\d{4,}/.test(tok) || /^jpm/.test(tok) || /^(conf#|ppd|ccd|id:)/.test(tok)) break;
    out.push(tok);
  }
  return out.join(' ').replace(/[^a-z0-9 &'.*-]/g, '').trim() || raw.slice(0, 40);
}

const INDIA = /\b(wise|remitly|western union|xoom|remit2india|instarem)\b/i;
const BILL_DETAILED = new Set(['GENERAL_SERVICES_INSURANCE', 'TRANSPORTATION_GAS']);
const NOT_RECURRING_PRIMARY = new Set(['FOOD_AND_DRINK', 'GENERAL_MERCHANDISE', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'INCOME', 'TRANSPORTATION', 'TRAVEL', 'ENTERTAINMENT']);

// Merchants charged in 2+ different months at a steady amount look like bills.
function detectRecurring(history) {
  const groups = new Map();
  for (const t of history) {
    if (Number(t.amount) <= 0 || NOT_RECURRING_PRIMARY.has(t.category_primary)) continue;
    const k = merchantKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const keys = new Set();
  for (const [k, txs] of groups) {
    const months = new Set(txs.map((t) => String(t.date).slice(0, 7)));
    if (months.size < 2) continue;
    const amts = txs.map((t) => Number(t.amount)).sort((a, b) => a - b);
    const median = amts[Math.floor(amts.length / 2)];
    const steady = amts.filter((a) => Math.abs(a - median) <= median * 0.25).length >= amts.length * 0.6;
    if (steady) keys.add(k);
  }
  return keys;
}

export async function loadContext() {
  const since = addDays(today(), -150);
  const [rules, history] = await Promise.all([
    db().from('rules').select('*').order('id').then(check),
    db().from('transactions').select('date,name,merchant_name,amount,category_primary,category_detailed').gte('date', since).then(check),
  ]);
  return { rules, recurring: detectRecurring(history), history };
}

function ruleFor(t, rules) {
  const key = merchantKey(t);
  const label = `${t.merchant_name || ''} ${t.name || ''}`.toLowerCase();
  return rules.find((r) => key === r.match.toLowerCase() || label.includes(r.match.toLowerCase()));
}

// Merchant rules never apply to these: a rule like "amazon → yourself" must not
// swallow the Amazon paycheck, and card payments / self-transfers are never spending.
function ruleExempt(t) {
  const label = `${t.merchant_name || ''} ${t.name || ''}`;
  return (
    t.category_detailed === 'INCOME_SALARY' ||
    t.category_primary === 'LOAN_PAYMENTS' ||
    PLAN.owner.test(label)
  );
}

// Returns { bucket, source } where source is override | rule | auto.
export function classify(t, ctx) {
  if (t.bucket_override && BUCKETS[t.bucket_override]) return { bucket: t.bucket_override, source: 'override' };
  const rule = ruleExempt(t) ? null : ruleFor(t, ctx.rules);
  if (rule && BUCKETS[rule.bucket]) return { bucket: rule.bucket, source: 'rule' };

  const label = `${t.merchant_name || ''} ${t.name || ''}`;
  const p = t.category_primary;
  const d = t.category_detailed || '';
  if (INDIA.test(label)) return { bucket: 'india', source: 'auto' };
  if (PLAN.owner.test(label)) return { bucket: 'ignore', source: 'auto' }; // moving your own money
  if (p === 'INCOME') return { bucket: 'income', source: 'auto' };
  if (p === 'LOAN_PAYMENTS' || p === 'TRANSFER_IN') return { bucket: 'ignore', source: 'auto' };
  if (p === 'TRANSFER_OUT') {
    if (d === 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS') return { bucket: 'yourself', source: 'auto' }; // Zelle etc. to people
    if (/SAVINGS|INVESTMENT|RETIREMENT/.test(d)) return { bucket: 'savings', source: 'auto' };
    return { bucket: 'ignore', source: 'auto' }; // between your own accounts
  }
  if (p === 'RENT_AND_UTILITIES' || BILL_DETAILED.has(d) || ctx.recurring.has(merchantKey(t))) return { bucket: 'bills', source: 'auto' };
  if (p === 'FOOD_AND_DRINK') return { bucket: 'food', source: 'auto' };
  return { bucket: 'yourself', source: 'auto' };
}

// Should Arjun confirm this one?
export function needsReview(t, cls) {
  if (cls.source !== 'auto' || t.reviewed_at) return false;
  const amt = Number(t.amount);
  const label = `${t.merchant_name || ''} ${t.name || ''}`;
  if (PLAN.owner.test(label)) return false;
  if (amt >= 150 && (cls.bucket === 'yourself' || cls.bucket === 'food')) return true;
  if (amt < 0 && t.category_primary === 'INCOME' && t.category_detailed !== 'INCOME_SALARY') return true;
  if (t.category_detailed === 'TRANSFER_IN_TRANSFER_IN_FROM_APPS' || t.category_detailed === 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS') return true;
  if (t.category_primary === 'OTHER') return true;
  return false;
}

// ---------- pay period ----------
// The budget runs from one paycheck to the next instead of by calendar month.
export async function payPeriod() {
  const now = today();
  const paychecks = check(
    await db().from('transactions')
      .select('date,amount')
      .eq('category_detailed', 'INCOME_SALARY')
      .lte('amount', -1000)
      .lte('date', now)
      .order('date', { ascending: false })
      .limit(6)
  );
  if (!paychecks.length) {
    const start = `${now.slice(0, 7)}-01`;
    const [y, m] = now.split('-').map(Number);
    const end = fmt(new Date(Date.UTC(y, m, 0, 12)));
    return { start, end, nextPayday: addDays(end, 1), lastPaycheck: null, source: 'calendar' };
  }
  const start = paychecks[0].date;
  let gap = 30;
  if (paychecks.length >= 2) {
    const gaps = [];
    for (let i = 0; i < paychecks.length - 1; i++) gaps.push(daysBetween(paychecks[i + 1].date, paychecks[i].date));
    gaps.sort((a, b) => a - b);
    gap = gaps[Math.floor(gaps.length / 2)];
  }
  let nextPayday = addDays(start, gap);
  while (nextPayday <= now) nextPayday = addDays(nextPayday, gap); // a paycheck is late or missing
  return {
    start,
    end: addDays(nextPayday, -1),
    nextPayday,
    lastPaycheck: { date: paychecks[0].date, amount: round(-Number(paychecks[0].amount)) },
    source: 'paycheck',
  };
}

// ---------- accounts ----------
export async function getAccounts() {
  return check(await db().from('accounts').select('*').order('type').order('name'));
}

export function cashPosition(accounts) {
  let cash = 0, cardDebt = 0, investments = 0;
  for (const a of accounts) {
    if (a.type === 'depository') cash += Number(a.available ?? a.current ?? 0);
    else if (a.type === 'credit') cardDebt += Number(a.current ?? 0);
    else if (a.type === 'investment') investments += Number(a.current ?? 0);
  }
  return { cash: round(cash), cardDebt: round(cardDebt), netCash: round(cash - cardDebt), investments: round(investments) };
}

// ---------- summary ----------
export async function periodSummary() {
  const [period, ctx] = await Promise.all([payPeriod(), loadContext()]);
  const txs = check(
    await db().from('transactions').select('*')
      .gte('date', period.start).lte('date', period.end)
      .order('date', { ascending: false })
  );

  const totals = Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0]));
  const rows = txs.map((t) => {
    const cls = classify(t, ctx);
    totals[cls.bucket] += Number(t.amount);
    return { ...t, bucket: cls.bucket, source: cls.source, review: needsReview(t, cls) };
  });

  const now = today();
  const daysLeft = Math.max(1, daysBetween(now, period.end) + 1);
  const spent = (k) => Math.max(0, totals[k]); // paybacks can offset spending, but not below zero
  const buckets = Object.fromEntries(
    Object.entries(PLAN.buckets).map(([k, budget]) => [k, { budget, spent: round(spent(k)), left: round(budget - spent(k)) }])
  );
  const safeToSpend = round(PLAN.buckets.food + PLAN.buckets.yourself - spent('food') - spent('yourself'));
  const income = round(-totals.income);
  const outgoing = spent('food') + spent('yourself') + spent('bills') + spent('india') + spent('big_purchase');

  return {
    period,
    daysLeft,
    safeToSpend,
    perDay: round(Math.max(0, safeToSpend) / daysLeft),
    buckets,
    bills: { planned: round(fixedTotal()), paid: round(spent('bills')) },
    india: { planned: PLAN.india, sent: round(spent('india')) },
    bigPurchases: round(spent('big_purchase')),
    savings: { planned: PLAN.savings, moved: round(spent('savings')) },
    income,
    leftOver: round(income - outgoing), // what this paycheck has left after everything
    reviewCount: rows.filter((r) => r.review).length,
    transactions: rows,
  };
}

// Full history with search, bucket filter and paging. Classification happens in
// code, so we load the matching rows and page in memory (fine at personal scale).
export async function listTransactions({ page = 1, pageSize = 50, q = '', bucket = '' } = {}) {
  const ctx = await loadContext();
  const s = String(q || '').replace(/[%,()]/g, ' ').trim();
  // Supabase returns at most 1,000 rows per request, so page through.
  const all = [];
  for (let from = 0; ; from += 1000) {
    let query = db().from('transactions').select('*').order('date', { ascending: false }).order('id').range(from, from + 999);
    if (s) query = query.or(`name.ilike.%${s}%,merchant_name.ilike.%${s}%,note.ilike.%${s}%`);
    const chunk = check(await query);
    all.push(...chunk);
    if (chunk.length < 1000 || all.length >= 20000) break;
  }
  const accounts = check(await db().from('accounts').select('id,name,mask'));
  const acct = Object.fromEntries(accounts.map((a) => [a.id, `${a.name}${a.mask ? ` ••${a.mask}` : ''}`]));
  let rows = all.map((t) => {
    const cls = classify(t, ctx);
    return { ...t, bucket: cls.bucket, source: cls.source, review: needsReview(t, cls), account: acct[t.account_id] || '' };
  });
  if (bucket && BUCKETS[bucket]) rows = rows.filter((r) => r.bucket === bucket);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, Number(page) || 1), pages);
  return { page: p, pages, total, rows: rows.slice((p - 1) * pageSize, p * pageSize) };
}

// Items to confirm: this pay period plus the two weeks before it.
export async function reviewQueue(limit = 50) {
  const [period, ctx] = await Promise.all([payPeriod(), loadContext()]);
  const txs = check(
    await db().from('transactions').select('*')
      .gte('date', addDays(period.start, -14))
      .is('reviewed_at', null)
      .is('bucket_override', null)
      .order('date', { ascending: false })
      .limit(500)
  );
  return txs
    .map((t) => ({ t, cls: classify(t, ctx) }))
    .filter(({ t, cls }) => needsReview(t, cls))
    .slice(0, limit)
    .map(({ t, cls }) => ({
      id: t.id, date: t.date, name: t.merchant_name || t.name, amount: Number(t.amount),
      plaid_category: t.category_detailed, guess: cls.bucket, merchant_key: merchantKey(t),
    }));
}

// Set a transaction's bucket; optionally remember it for that merchant.
export async function categorize(id, bucket, { note, remember } = {}) {
  if (!BUCKETS[bucket]) throw new Error(`Unknown bucket "${bucket}". Use one of: ${BUCKET_KEYS.join(', ')}`);
  const rows = check(await db().from('transactions').select('*').eq('id', id).limit(1));
  if (!rows[0]) throw new Error('Transaction not found');
  check(await db().from('transactions')
    .update({ bucket_override: bucket, note: note ?? rows[0].note, reviewed_at: new Date().toISOString() })
    .eq('id', id));
  let rule = null;
  if (remember) rule = await addRule(merchantKey(rows[0]), bucket, note);
  return { id, bucket, rule };
}

export async function addRule(match, bucket, note) {
  if (!BUCKETS[bucket]) throw new Error(`Unknown bucket "${bucket}"`);
  const m = String(match || '').trim().toLowerCase();
  if (m.length < 3) throw new Error('Rule text is too short');
  const existing = check(await db().from('rules').select('*').ilike('match', m).limit(1));
  if (existing[0]) {
    check(await db().from('rules').update({ bucket, note: note ?? existing[0].note }).eq('id', existing[0].id));
    return { ...existing[0], bucket };
  }
  const [row] = check(await db().from('rules').insert({ match: m, bucket, note }).select());
  return row;
}

export async function canIAfford(amount, bucket = 'yourself') {
  const [summary, accounts] = await Promise.all([periodSummary(), getAccounts()]);
  const pos = cashPosition(accounts);
  const b = summary.buckets[bucket] || summary.buckets.yourself;
  let verdict, reason;
  if (amount <= b.left) {
    verdict = 'yes';
    reason = `Fits your ${bucket} budget: $${b.left} left until payday (${summary.period.nextPayday}), $${round(b.left - amount)} after.`;
  } else if (amount <= summary.safeToSpend) {
    verdict = 'tight';
    reason = `Over your ${bucket} budget ($${b.left} left), but fits your total flexible money ($${summary.safeToSpend} left until ${summary.period.nextPayday}).`;
  } else {
    verdict = 'no';
    reason = `Only $${Math.max(0, summary.safeToSpend)} of flexible money left until ${summary.period.nextPayday}. This would come out of savings — treat it as a big purchase if it's worth it.`;
  }
  if (amount > pos.netCash) {
    verdict = 'no';
    reason += ` Also, checking minus card balances is only $${pos.netCash}.`;
  }
  return { amount, bucket, verdict, reason, bucketLeft: b.left, safeToSpend: summary.safeToSpend, daysLeft: summary.daysLeft, nextPayday: summary.period.nextPayday, netCash: pos.netCash };
}
