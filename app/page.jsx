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
        <h1>Money Tracker <span className="muted" style={{ fontWeight: 400 }}>· {rangeDates}</span></h1>
        <Actions hasItems />
      </header>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 18px' }}>
        <span className="muted" style={{ fontSize: 14 }}>Showing</span>
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
        <h2>{isCurrentPaycheck ? 'Safe to spend until payday' : range.isCurrent ? `Flexible money left · ${range.label}` : `Food + yourself vs budget · ${range.label}`}</h2>
        <div className="hero">
          <div>
            <div className="big" style={summary.safeToSpend < 0 ? { color: 'var(--bad)' } : undefined}>
              {!range.isCurrent && summary.safeToSpend >= 0 ? `${usd(summary.safeToSpend)} under` : !range.isCurrent ? `${usd(-summary.safeToSpend)} over` : usd(summary.safeToSpend)}
            </div>
            <div className="sub">
              {range.isCurrent
                ? <>{usd(summary.perDay)}/day for {summary.daysLeft} {summary.daysLeft === 1 ? 'day' : 'days'}{isCurrentPaycheck ? <> · next paycheck ~{shortDate(period.nextPayday)}</> : null}</>
                : <>Budget {usd(summary.flexBudget)}{scale} · spent {usd(summary.flexBudget - summary.safeToSpend)}</>}
            </div>
          </div>
          <div className="sub" style={{ textAlign: 'right' }}>
            {period.lastPaycheck ? <>Last paycheck {usd(period.lastPaycheck.amount)} on {shortDate(period.lastPaycheck.date)}</> : 'No paycheck found yet'}
          </div>
        </div>
      </div>

      <Review items={review} />

      <div className="grid">
        {Object.entries(summary.buckets).map(([k, b]) => (
          <a className="card stat clickable" key={k} href={drill(k)}>
            <div className="label">{BUCKETS[k]} <span className="muted">›</span></div>
            <div className="value">{usd(b.left)} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>{b.left < 0 ? 'over' : 'left'}</span></div>
            <Bar spent={b.spent} budget={b.budget} />
            <div className="muted" style={{ fontSize: 13 }}>{usd(b.spent)} of {usd(b.budget)}{scale}</div>
          </a>
        ))}
        <div className="card stat">
          <div className="label">Cash after card balances <span className="muted">· now</span></div>
          <div className="value" style={pos.netCash < 0 ? { color: 'var(--bad)' } : undefined}>{usd(pos.netCash)}</div>
          <div className="muted" style={{ fontSize: 13 }}>{usd(pos.cash)} cash − {usd(pos.cardDebt)} on cards</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>{range.label}{scale}</h2>
          <a className="row clickable" href={drill('income')}><span>Income ›</span><span className="num in">{usd(summary.income)}</span></a>
          <a className="row clickable" href={drill('bills')}><span>Bills ›</span><span className="num">{usd(summary.bills.paid)} / {usd(summary.bills.planned)}</span></a>
          <a className="row clickable" href={drill('food')}><span>Food ›</span><span className="num">{usd(summary.buckets.food.spent)} / {usd(summary.buckets.food.budget)}</span></a>
          <a className="row clickable" href={drill('yourself')}><span>Yourself ›</span><span className="num">{usd(summary.buckets.yourself.spent)} / {usd(summary.buckets.yourself.budget)}</span></a>
          <a className="row clickable" href={drill('india')}><span>India ›</span><span className="num">{usd(summary.india.sent)} / {usd(summary.india.planned)}</span></a>
          <a className="row clickable" href={drill('big_purchase')}><span>Big purchases (from savings) ›</span><span className="num">{usd(summary.bigPurchases)}</span></a>
          <a className="row clickable" href={drill('ignore')}><span className="muted">Not counted (card payments, transfers) ›</span><span className="num muted">—</span></a>
          <div className="row">
            <span><strong>Left over</strong> <span className="muted" style={{ fontSize: 13 }}>· target {usd(summary.savings.planned)}</span></span>
            <span className="num" style={{ fontWeight: 650, color: summary.leftOver < 0 ? 'var(--bad)' : undefined }}>{usd(summary.leftOver)}</span>
          </div>
        </div>

        <div className="card">
          <h2>Accounts <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· now</span></h2>
          {accounts.map((a) => (
            <div className="row" key={a.id}>
              <div className="left">
                <div className="name">{a.name}{a.mask ? ` ••${a.mask}` : ''}</div>
                <div className="meta">{items.find((i) => i.id === a.item_id)?.institution} · {a.subtype || a.type}</div>
              </div>
              <span className="num">{usd2(a.type === 'depository' ? a.available ?? a.current : a.current)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h2>Transactions · {range.label} ({summary.transactions.length})</h2>
          <a href={`/transactions?${qs.toString()}`} style={{ color: 'var(--accent)', fontSize: 14 }}>Open all →</a>
        </div>
        {summary.transactions.slice(0, SHOWN).map((t) => {
          const amt = Number(t.amount);
          return (
            <div className="row" key={t.id}>
              <div className="left">
                <div className="name">{t.note ? `${t.note} · ${t.merchant_name || t.name}` : (t.merchant_name || t.name)}</div>
                <div className="meta">
                  {t.date} · {BUCKETS[t.bucket]}{t.pending ? ' · pending' : ''}{t.review ? ' · to review' : ''}
                </div>
              </div>
              <span className={`num ${amt < 0 ? 'in' : ''}`}>{amt < 0 ? '+' : ''}{usd2(Math.abs(amt))}</span>
            </div>
          );
        })}
        {summary.transactions.length > SHOWN && (
          <p className="muted" style={{ fontSize: 13 }}>
            Showing the latest {SHOWN}. <a href={`/transactions?${qs.toString()}`} style={{ color: 'var(--accent)' }}>See all {summary.transactions.length} →</a>
          </p>
        )}
        {summary.transactions.length === 0 && <p className="muted">No transactions in this period.</p>}
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Last synced: {items.map((i) => `${i.institution} ${i.last_synced_at ? new Date(i.last_synced_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : 'never'}`).join(' · ')}
      </p>
    </main>
  );
}
