import { db, check } from './db';

export const TIME_ZONE = 'America/Chicago';

// Monthly plan (take-home $8,000). Edit these numbers to change the plan.
export const PLAN = {
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
  buckets: {
    food: 600,
    yourself: 680,
  },
  india: 650,
  savings: 4343,
};

export const fixedTotal = () => PLAN.fixed.reduce((s, b) => s + b.amount, 0);

// Categories (Plaid personal_finance_category) that are moving money around,
// not spending. Credit card payments are excluded so purchases aren't counted twice.
const NOT_SPENDING_PRIMARY = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS']);
const BILL_DETAILED = new Set(['GENERAL_SERVICES_INSURANCE', 'TRANSPORTATION_GAS']);
const INDIA_MERCHANTS = /\b(wise|remitly|western union|xoom|remit2india|instarem)\b/i;

export function bucketOf(t) {
  const label = `${t.merchant_name || ''} ${t.name || ''}`;
  if (INDIA_MERCHANTS.test(label)) return 'india';
  if (NOT_SPENDING_PRIMARY.has(t.category_primary)) {
    if (t.category_primary === 'TRANSFER_OUT') return 'savings';
    return null; // income, transfers in, card payments
  }
  if (t.category_primary === 'RENT_AND_UTILITIES' || BILL_DETAILED.has(t.category_detailed)) return 'bills';
  if (t.category_primary === 'FOOD_AND_DRINK') return 'food';
  return 'yourself';
}

// YYYY-MM-DD for "now" in Chicago.
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

export function monthRange(month /* 'YYYY-MM' or undefined */) {
  const m = month || today().slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return {
    month: m,
    start: `${m}-01`,
    end: `${m}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  };
}

const round = (n) => Math.round(n * 100) / 100;

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

export async function monthSummary(month) {
  const range = monthRange(month);
  const txs = check(
    await db()
      .from('transactions')
      .select('*')
      .gte('date', range.start)
      .lte('date', range.end)
      .order('date', { ascending: false })
  );

  const spent = { food: 0, yourself: 0, bills: 0, india: 0, savings: 0 };
  let income = 0;
  for (const t of txs) {
    const amt = Number(t.amount);
    if (t.category_primary === 'INCOME') {
      income += -amt;
      continue;
    }
    const b = bucketOf(t);
    if (b) spent[b] += amt;
  }

  const isCurrent = range.month === today().slice(0, 7);
  const dayOfMonth = isCurrent ? Number(today().slice(8, 10)) : range.daysInMonth;
  const daysLeft = Math.max(1, range.daysInMonth - dayOfMonth + 1);

  const buckets = Object.fromEntries(
    Object.entries(PLAN.buckets).map(([k, budget]) => [
      k,
      { budget, spent: round(spent[k]), left: round(budget - spent[k]) },
    ])
  );
  const flexBudget = PLAN.buckets.food + PLAN.buckets.yourself;
  const flexSpent = spent.food + spent.yourself;
  const safeToSpend = round(flexBudget - flexSpent);

  return {
    month: range.month,
    daysLeft,
    safeToSpend,
    perDay: round(Math.max(0, safeToSpend) / daysLeft),
    buckets,
    bills: { planned: round(fixedTotal()), paid: round(spent.bills) },
    india: { planned: PLAN.india, sent: round(spent.india) },
    savings: { planned: PLAN.savings, moved: round(spent.savings) },
    income: round(income),
    transactionCount: txs.length,
    transactions: txs,
  };
}

export async function canIAfford(amount, bucket = 'yourself') {
  const [summary, accounts] = await Promise.all([monthSummary(), getAccounts()]);
  const pos = cashPosition(accounts);
  const b = summary.buckets[bucket] || summary.buckets.yourself;
  let verdict, reason;
  if (amount <= b.left) {
    verdict = 'yes';
    reason = `Fits your ${bucket} budget: $${b.left} left this month, $${round(b.left - amount)} after.`;
  } else if (amount <= summary.safeToSpend) {
    verdict = 'tight';
    reason = `Over your ${bucket} budget ($${b.left} left), but fits overall flexible money ($${summary.safeToSpend} left). It would come out of your other bucket.`;
  } else {
    verdict = 'no';
    reason = `Only $${Math.max(0, summary.safeToSpend)} of flexible money left this month. Buying this would dip into bills or savings.`;
  }
  if (amount > pos.netCash) {
    verdict = 'no';
    reason += ` Also, checking minus card balances is only $${pos.netCash}.`;
  }
  return { amount, bucket, verdict, reason, bucketLeft: b.left, safeToSpend: summary.safeToSpend, daysLeft: summary.daysLeft, netCash: pos.netCash };
}
