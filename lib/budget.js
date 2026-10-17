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
  // Most specific rule wins, so "amazonaus16 cafe → food" beats "amazon → yourself".
  return rules
    .filter((r) => key === r.match.toLowerCase() || label.includes(r.match.toLowerCase()))
    .sort((a, b) => b.match.length - a.match.length)[0];
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
    const end = monthEnd(now);
    return { start, end, prevStart: addMonths(start, -1), nextPayday: addDays(end, 1), lastPaycheck: null, source: 'calendar' };
  }
  const start = paychecks[0].date;
  let gap = 30;
  if (paychecks.length >= 2) {
    const gaps = [];
    for (let i = 0; i < paychecks.length - 1; i++) gaps.push(daysBetween(paychecks[i + 1].date, paychecks[i].date));
    gaps.sort((x, y) => x - y);
    gap = gaps[Math.floor(gaps.length / 2)];
  }
  let nextPayday = addDays(start, gap);
  while (nextPayday <= now) nextPayday = addDays(nextPayday, gap); // a paycheck is late or missing
  return {
    start,
    end: addDays(nextPayday, -1),
    prevStart: paychecks[1]?.date || addDays(start, -gap),
    nextPayday,
    lastPaycheck: { date: paychecks[0].date, amount: round(-Number(paychecks[0].amount)) },
    source: 'paycheck',
  };
}

const monthEnd = (d) => { const [y, m] = d.split('-').map(Number); return fmt(new Date(Date.UTC(y, m, 0, 12))); };
const addMonths = (d, n) => { const [y, m] = d.split('-').map(Number); return fmt(new Date(Date.UTC(y, m - 1 + n, 1, 12))); };
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const RANGES = {
  paycheck: 'This paycheck',
  last_paycheck: 'Last paycheck',
  this_month: 'This month',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  last_6_months: 'Last 6 months',
  this_year: 'This year',
  all: 'All time',
  custom: 'Custom dates',
};

// Turn { range, from, to } into concrete dates. Default is the current paycheck.
export async function resolveRange({ range, from, to } = {}) {
  const key = RANGES[range] ? range : 'paycheck';
  const now = today();
  const mStart = `${now.slice(0, 7)}-01`;
  const pp = await payPeriod();
  let start, end;
  switch (key) {
    case 'last_paycheck': start = pp.prevStart; end = addDays(pp.start, -1); break;
    case 'this_month': start = mStart; end = monthEnd(now); break;
    case 'last_month': start = addMonths(mStart, -1); end = addDays(mStart, -1); break;
    case 'last_3_months': start = addMonths(mStart, -2); end = now; break;
    case 'last_6_months': start = addMonths(mStart, -5); end = now; break;
    case 'this_year': start = `${now.slice(0, 4)}-01-01`; end = now; break;
    case 'all': {
      const first = check(await db().from('transactions').select('date').order('date', { ascending: true }).limit(1));
      start = first[0]?.date || mStart;
      end = now;
      break;
    }
    case 'custom':
      start = isDate(from) ? from : mStart;
      end = isDate(to) ? to : now;
      if (end < start) [start, end] = [end, start];
      break;
    default: start = pp.start; end = pp.end;
  }
  const days = daysBetween(start, end) + 1;
  return {
    key, label: RANGES[key], start, end, days,
    isCurrent: start <= now && now <= end,
    // Budgets are monthly; longer ranges scale them (a paycheck counts as one month).
    months: key === 'paycheck' || key === 'last_paycheck' ? 1 : Math.max(0.1, Math.round((days / 30.44) * 10) / 10),
    pay: pp,
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
export async function periodSummary(rangeOpts = {}) {
  const [range, ctx] = await Promise.all([resolveRange(rangeOpts), loadContext()]);
  const txs = [];
  for (let from = 0; ; from += 1000) {
    const chunk = check(
      await db().from('transactions').select('*')
        .gte('date', range.start).lte('date', range.end)
        .order('date', { ascending: false }).order('id')
        .range(from, from + 999)
    );
    txs.push(...chunk);
    if (chunk.length < 1000) break;
  }

  const totals = Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0]));
  const rows = txs.map((t) => {
    const cls = classify(t, ctx);
    totals[cls.bucket] += Number(t.amount);
    return { ...t, bucket: cls.bucket, source: cls.source, review: needsReview(t, cls) };
  });

  const now = today();
  const m = range.months;
  const daysLeft = range.isCurrent ? Math.max(1, daysBetween(now, range.end) + 1) : 0;
  const spent = (k) => Math.max(0, totals[k]); // paybacks can offset spending, but not below zero
  const buckets = Object.fromEntries(
    Object.entries(PLAN.buckets).map(([k, b]) => {
      const budget = round(b * m);
      return [k, { budget, spent: round(spent(k)), left: round(budget - spent(k)) }];
    })
  );
  const flexBudget = round((PLAN.buckets.food + PLAN.buckets.yourself) * m);
  const safeToSpend = round(flexBudget - spent('food') - spent('yourself'));
  const income = round(-totals.income);
  const outgoing = spent('food') + spent('yourself') + spent('bills') + spent('india') + spent('big_purchase');

  return {
    range: { key: range.key, label: range.label, start: range.start, end: range.end, months: m, isCurrent: range.isCurrent },
    period: range.pay,
    daysLeft,
    safeToSpend,
    flexBudget,
    perDay: daysLeft ? round(Math.max(0, safeToSpend) / daysLeft) : 0,
    buckets,
    bills: { planned: round(fixedTotal() * m), paid: round(spent('bills')) },
    india: { planned: round(PLAN.india * m), sent: round(spent('india')) },
    bigPurchases: round(spent('big_purchase')),
    savings: { planned: round(PLAN.savings * m), moved: round(spent('savings')) },
    income,
    leftOver: round(income - outgoing),
    reviewCount: rows.filter((r) => r.review).length,
    transactions: rows,
  };
}

// Full history with search, bucket filter and paging. Classification happens in
// code, so we load the matching rows and page in memory (fine at personal scale).
export async function listTransactions({ page = 1, pageSize = 50, q = '', bucket = '', range: rangeKey, from, to } = {}) {
  const ctx = await loadContext();
  const range = rangeKey && rangeKey !== 'all' ? await resolveRange({ range: rangeKey, from, to }) : null;
  const s = String(q || '').replace(/[%,()]/g, ' ').trim();
  // Supabase returns at most 1,000 rows per request, so page through.
  const all = [];
  for (let from = 0; ; from += 1000) {
    let query = db().from('transactions').select('*').order('date', { ascending: false }).order('id').range(from, from + 999);
    if (range) query = query.gte('date', range.start).lte('date', range.end);
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
  const sum = round(rows.reduce((acc, r) => acc + Number(r.amount), 0));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, Number(page) || 1), pages);
  return { page: p, pages, total, sum, range, rows: rows.slice((p - 1) * pageSize, p * pageSize) };
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
    .update({ bucket_override: bucket, note: note !== undefined ? note : rows[0].note, reviewed_at: new Date().toISOString() })
    .eq('id', id));
  let rule = null;
  if (remember) rule = await addRule(merchantKey(rows[0]), bucket, note);
  const t = rows[0];
  return { id, bucket, rule, previous: { bucket_override: t.bucket_override, note: t.note, reviewed_at: t.reviewed_at } };
}

// Reverse a categorize(): restore the transaction and the rule exactly as they were.
export async function undoCategorize({ id, previous, rule }) {
  if (!id || !previous) throw new Error('Nothing to undo');
  check(await db().from('transactions').update({
    bucket_override: previous.bucket_override ?? null,
    note: previous.note ?? null,
    reviewed_at: previous.reviewed_at ?? null,
  }).eq('id', id));
  if (rule?.id) {
    if (rule.previousBucket) check(await db().from('rules').update({ bucket: rule.previousBucket, note: rule.previousNote ?? null }).eq('id', rule.id));
    else check(await db().from('rules').delete().eq('id', rule.id));
  }
  return { ok: true };
}

export async function addRule(match, bucket, note) {
  if (!BUCKETS[bucket]) throw new Error(`Unknown bucket "${bucket}"`);
  const m = String(match || '').trim().toLowerCase();
  if (m.length < 3) throw new Error('Rule text is too short');
  const existing = check(await db().from('rules').select('*').ilike('match', m).limit(1));
  if (existing[0]) {
    check(await db().from('rules').update({ bucket, note: note ?? existing[0].note }).eq('id', existing[0].id));
    return { ...existing[0], bucket, previousBucket: existing[0].bucket, previousNote: existing[0].note };
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
