import Actions from '../components/Actions';
import Review from '../components/Review';
import RangePicker from '../components/RangePicker';
import { getAccounts, cashPosition, periodSummary, reviewQueue, PLAN, BUCKETS } from '../lib/budget';
import { db, check } from '../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const usd = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = (n) => Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const shortDate = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDate = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const SHOWN = 100;

function Bar({ spent, budget }) {
  const pct = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;
  const cls = pct >= 100 ? 'bar bad' : pct >= 85 ? 'bar warn' : 'bar';
  return <div className={cls}><span style={{ width: `${pct}%` }} /></div>;
}

// Activity-style ring: fills as the flexible budget is used; orange near the end, red past it.
function Ring({ spent, budget }) {
  const size = 132, stroke = 16, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = budget > 0 ? Math.max(0, spent / budget) : 0;
  const shown = Math.min(1, pct);
  const color = pct >= 1 ? 'var(--bad)' : pct >= 0.85 ? 'var(--warn)' : 'var(--accent-solid)';
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct * 100)}% of flexible budget used`}>
      <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
      <circle className="value" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke={color}
        strokeDasharray={c} strokeDashoffset={c * (1 - shown)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="currentColor"
        style={{ font: '700 24px -apple-system, system-ui, sans-serif', letterSpacing: '-0.03em' }}>
        {Math.round(pct * 100)}%
      </text>
      <text x="50%" y="66%" textAnchor="middle" dominantBaseline="central" fill="var(--muted)" style={{ font: '500 11px -apple-system, system-ui, sans-serif' }}>
        used
      </text>
    </svg>
  );
}

export default async function Dashboard({ searchParams }) {
  const sp = (await searchParams) || {};
  const rangeOpts = {
    range: typeof sp.range === 'string' ? sp.range : 'paycheck',
    from: typeof sp.from === 'string' ? sp.from : undefined,
    to: typeof sp.to === 'string' ? sp.to : undefined,
  };

  let data;
  try {
    const [summary, accounts, items, review] = await Promise.all([
      periodSummary(rangeOpts),
      getAccounts(),
      db().from('items').select('id,institution,status,last_synced_at,last_error').then(check),
      reviewQueue(),
    ]);
    data = { summary, accounts, items, review, pos: cashPosition(accounts) };
  } catch (err) {
    return (
      <main>
        <header className="top"><h1>Money Tracker</h1><Actions hasItems={false} /></header>
        <div className="card">
          <h2>Setup needed</h2>
          <p>{err.message}</p>
          <p className="muted">Check the environment variables in Vercel and that the database migrations have run.</p>
        </div>
      </main>
    );
  }

  const { summary, accounts, items, review, pos } = data;
  const { period, range } = summary;

  if (!items.length) {
    return (
      <main>
        <header className="top"><h1>Money Tracker</h1><Actions hasItems={false} /></header>
        <div className="card empty">
          <h2>No banks connected yet</h2>
          <p>Connect your checking account and credit cards to see your safe-to-spend number.</p>
        </div>
      </main>
    );
  }

  const broken = items.filter((i) => i.status !== 'ok');
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4);
  const rangeDates = sameYear
    ? `${shortDate(range.start)} – ${shortDate(range.end)}`
    : `${longDate(range.start)} – ${longDate(range.end)}`;

  // Keep the chosen range when drilling into a category.
  const qs = new URLSearchParams({ range: range.key });
  if (range.key === 'custom') { qs.set('from', range.start); qs.set('to', range.end); }
  const drill = (bucket) => `/transactions?bucket=${bucket}&${qs.toString()}`;
  const scale = range.months !== 1 ? ` (${range.months} mo)` : '';
  const isCurrentPaycheck = range.key === 'paycheck';

  return (
    <main>
      <header className="top">
        <h1>Money <span className="muted">{rangeDates}</span></h1>
        <Actions hasItems />
      </header>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 18px' }}>
        <span style={{ fontWeight: 600, letterSpacing: '-0.02em' }}>Period</span>
        <RangePicker value={range.key} from={range.key === 'custom' ? range.start : ''} to={range.key === 'custom' ? range.end : ''} />
      </div>

      {broken.length > 0 && (
        <div className="card">
          <h2>Needs attention</h2>
          {broken.map((i) => (
            <div className="row" key={i.id}>
              <span>{i.institution}</span>
              <span className="pill bad">{i.status === 'login_required' ? 'Reconnect needed' : 'Sync error'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="hero">
          <Ring spent={summary.flexBudget - summary.safeToSpend} budget={summary.flexBudget} />
          <div className="figure">
            <div className="caption">
              {isCurrentPaycheck ? 'Safe to spend until payday' : range.isCurrent ? `Flexible money left, ${range.label.toLowerCase()}` : `Food and yourself, ${range.label.toLowerCase()}`}
            </div>
            <div className="big" style={summary.safeToSpend < 0 ? { color: 'var(--bad)' } : undefined}>
              {range.isCurrent
                ? usd(summary.safeToSpend)
                : summary.safeToSpend >= 0 ? `${usd(summary.safeToSpend)} under` : `${usd(-summary.safeToSpend)} over`}
            </div>
            <div className="facts">
              {range.isCurrent ? (
                <div><b>{usd(summary.perDay)}</b><span>per day for {summary.daysLeft} {summary.daysLeft === 1 ? 'day' : 'days'}</span></div>
              ) : (
                <div><b>{usd(summary.flexBudget - summary.safeToSpend)}</b><span>spent of {usd(summary.flexBudget)}{scale}</span></div>
              )}
              {isCurrentPaycheck && <div><b>{shortDate(period.nextPayday)}</b><span>next paycheck</span></div>}
              {period.lastPaycheck && <div><b>{usd(period.lastPaycheck.amount)}</b><span>last paycheck, {shortDate(period.lastPaycheck.date)}</span></div>}
            </div>
          </div>
        </div>
      </div>

      <Review items={review} />

      <div className="grid">
        {Object.entries(summary.buckets).map(([k, b]) => (
          <a className="card stat clickable" key={k} href={drill(k)}>
            <div className="label"><span>{BUCKETS[k]}</span></div>
            <div className="value">{usd(Math.abs(b.left))} <span className="muted">{b.left < 0 ? 'over' : 'left'}</span></div>
            <Bar spent={b.spent} budget={b.budget} />
            <div className="muted" style={{ fontSize: 13 }}>{usd(b.spent)} of {usd(b.budget)}{scale}</div>
          </a>
        ))}
        <div className="card stat">
          <div className="label">Cash after card balances</div>
          <div className="value" style={pos.netCash < 0 ? { color: 'var(--bad)' } : undefined}>{usd(pos.netCash)}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{usd(pos.cash)} cash minus {usd(pos.cardDebt)} on cards</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>{range.label}{scale}</h2>
          <a className="row clickable" href={drill('income')}><span>Income</span><span className="num in">{usd(summary.income)}</span></a>
          <a className="row clickable" href={drill('bills')}><span>Bills</span><span className="num">{usd(summary.bills.paid)} / {usd(summary.bills.planned)}</span></a>
          <a className="row clickable" href={drill('food')}><span>Food</span><span className="num">{usd(summary.buckets.food.spent)} / {usd(summary.buckets.food.budget)}</span></a>
          <a className="row clickable" href={drill('yourself')}><span>Yourself</span><span className="num">{usd(summary.buckets.yourself.spent)} / {usd(summary.buckets.yourself.budget)}</span></a>
          <a className="row clickable" href={drill('india')}><span>India</span><span className="num">{usd(summary.india.sent)} / {usd(summary.india.planned)}</span></a>
          <a className="row clickable" href={drill('big_purchase')}><span>Big purchases from savings</span><span className="num">{usd(summary.bigPurchases)}</span></a>
          <a className="row clickable" href={drill('ignore')}><span className="muted">Not counted (card payments, transfers)</span><span className="num muted">—</span></a>
          <div className="row">
            <div className="left"><div className="name" style={{ fontWeight: 600 }}>Left over</div><div className="meta">Savings target {usd(summary.savings.planned)}</div></div>
            <span className="num" style={{ fontWeight: 650, color: summary.leftOver < 0 ? 'var(--bad)' : undefined }}>{usd(summary.leftOver)}</span>
          </div>
        </div>

        <div className="card">
          <h2>Accounts <span>today</span></h2>
          {accounts.map((a) => (
            <div className="row" key={a.id}>
              <div className="left">
                <div className="name">{a.name}{a.mask ? ` ••${a.mask}` : ''}</div>
                <div className="meta">{items.find((i) => i.id === a.item_id)?.institution}, {a.subtype || a.type}</div>
              </div>
              <span className="num">{usd2(a.type === 'depository' ? a.available ?? a.current : a.current)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h2>Transactions <span>{summary.transactions.length}</span></h2>
          <a href={`/transactions?${qs.toString()}`} style={{ fontSize: 15 }}>See all</a>
        </div>
        {summary.transactions.slice(0, SHOWN).map((t) => {
          const amt = Number(t.amount);
          return (
            <div className="row" key={t.id}>
              <div className="left">
                <div className="name">{t.note || t.merchant_name || t.name}</div>
                <div className="meta">
                  {shortDate(t.date)}, {BUCKETS[t.bucket]}{t.note ? `, ${t.merchant_name || t.name}` : ''}{t.pending ? ', pending' : ''}{t.review ? ', needs review' : ''}
                </div>
              </div>
              <span className={`num ${amt < 0 ? 'in' : ''}`}>{amt < 0 ? '+' : ''}{usd2(Math.abs(amt))}</span>
            </div>
          );
        })}
        {summary.transactions.length > SHOWN && (
          <p className="muted" style={{ fontSize: 13 }}>
            Showing the latest {SHOWN}. <a href={`/transactions?${qs.toString()}`}>See all {summary.transactions.length}</a>
          </p>
        )}
        {summary.transactions.length === 0 && <p className="muted">No transactions in this period.</p>}
      </div>

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 24 }}>
        Last synced: {items.map((i) => `${i.institution} ${i.last_synced_at ? new Date(i.last_synced_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : 'never'}`).join(', ')}
      </p>
    </main>
  );
}
