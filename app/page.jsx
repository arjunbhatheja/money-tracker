import Actions from '../components/Actions';
import Review from '../components/Review';
import { getAccounts, cashPosition, periodSummary, reviewQueue, PLAN, BUCKETS } from '../lib/budget';
import { db, check } from '../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const usd = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = (n) => Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const shortDate = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Bar({ spent, budget }) {
  const pct = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;
  const cls = pct >= 100 ? 'bar bad' : pct >= 85 ? 'bar warn' : 'bar';
  return <div className={cls}><span style={{ width: `${pct}%` }} /></div>;
}

export default async function Dashboard() {
  let data;
  try {
    const [summary, accounts, items, review] = await Promise.all([
      periodSummary(),
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
  const { period } = summary;

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
  const periodLabel = `${shortDate(period.start)} – ${shortDate(period.end)}`;

  return (
    <main>
      <header className="top">
        <h1>Money Tracker <span className="muted" style={{ fontWeight: 400 }}>· {periodLabel}</span></h1>
        <Actions hasItems />
      </header>

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
        <h2>Safe to spend until payday</h2>
        <div className="hero">
          <div>
            <div className="big" style={summary.safeToSpend < 0 ? { color: 'var(--bad)' } : undefined}>{usd(summary.safeToSpend)}</div>
            <div className="sub">
              {usd(summary.perDay)}/day for {summary.daysLeft} {summary.daysLeft === 1 ? 'day' : 'days'} · next paycheck ~{shortDate(period.nextPayday)}
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
          <a className="card stat clickable" key={k} href={`/transactions?bucket=${k}&period=current`}>
            <div className="label">{BUCKETS[k]} <span className="muted">›</span></div>
            <div className="value">{usd(b.left)} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>left</span></div>
            <Bar spent={b.spent} budget={b.budget} />
            <div className="muted" style={{ fontSize: 13 }}>{usd(b.spent)} of {usd(b.budget)}</div>
          </a>
        ))}
        <div className="card stat">
          <div className="label">Cash after card balances</div>
          <div className="value" style={pos.netCash < 0 ? { color: 'var(--bad)' } : undefined}>{usd(pos.netCash)}</div>
          <div className="muted" style={{ fontSize: 13 }}>{usd(pos.cash)} cash − {usd(pos.cardDebt)} on cards</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>This paycheck</h2>
          <a className="row clickable" href="/transactions?bucket=income&period=current"><span>Income ›</span><span className="num in">{usd(summary.income)}</span></a>
          <a className="row clickable" href="/transactions?bucket=bills&period=current"><span>Bills ›</span><span className="num">{usd(summary.bills.paid)} / {usd(summary.bills.planned)}</span></a>
          <a className="row clickable" href="/transactions?bucket=food&period=current"><span>Food ›</span><span className="num">{usd(summary.buckets.food.spent)} / {usd(PLAN.buckets.food)}</span></a>
          <a className="row clickable" href="/transactions?bucket=yourself&period=current"><span>Yourself ›</span><span className="num">{usd(summary.buckets.yourself.spent)} / {usd(PLAN.buckets.yourself)}</span></a>
          <a className="row clickable" href="/transactions?bucket=india&period=current"><span>India ›</span><span className="num">{usd(summary.india.sent)} / {usd(summary.india.planned)}</span></a>
          <a className="row clickable" href="/transactions?bucket=big_purchase&period=current"><span>Big purchases (from savings) ›</span><span className="num">{usd(summary.bigPurchases)}</span></a>
          <a className="row clickable" href="/transactions?bucket=ignore&period=current"><span className="muted">Not counted (card payments, transfers) ›</span><span className="num muted">—</span></a>
          <div className="row">
            <span><strong>Left over</strong> <span className="muted" style={{ fontSize: 13 }}>· target {usd(PLAN.savings)}</span></span>
            <span className="num" style={{ fontWeight: 650, color: summary.leftOver < 0 ? 'var(--bad)' : undefined }}>{usd(summary.leftOver)}</span>
          </div>
        </div>

        <div className="card">
          <h2>Accounts</h2>
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
          <h2>Transactions this paycheck ({summary.transactions.length})</h2>
          <a href="/transactions" style={{ color: 'var(--accent)', fontSize: 14 }}>All transactions →</a>
        </div>
        {summary.transactions.map((t) => {
          const amt = Number(t.amount);
          return (
            <div className="row" key={t.id}>
              <div className="left">
                <div className="name">{t.note ? `${t.merchant_name || t.name} — ${t.note}` : (t.merchant_name || t.name)}</div>
                <div className="meta">
                  {t.date} · {BUCKETS[t.bucket]}{t.pending ? ' · pending' : ''}{t.review ? ' · to review' : ''}
                </div>
              </div>
              <span className={`num ${amt < 0 ? 'in' : ''}`}>{amt < 0 ? '+' : ''}{usd2(Math.abs(amt))}</span>
            </div>
          );
        })}
        {summary.transactions.length === 0 && <p className="muted">No transactions yet this pay period.</p>}
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Last synced: {items.map((i) => `${i.institution} ${i.last_synced_at ? new Date(i.last_synced_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : 'never'}`).join(' · ')}
      </p>
    </main>
  );
}
