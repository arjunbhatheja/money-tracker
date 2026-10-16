import Actions from '../components/Actions';
import { getAccounts, cashPosition, monthSummary, PLAN, bucketOf } from '../lib/budget';
import { db, check } from '../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const usd = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = (n) => Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function Bar({ spent, budget }) {
  const pct = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;
  const cls = pct >= 100 ? 'bar bad' : pct >= 85 ? 'bar warn' : 'bar';
  return <div className={cls}><span style={{ width: `${pct}%` }} /></div>;
}

const BUCKET_LABEL = { food: 'Food', yourself: 'Yourself', bills: 'Bills', india: 'India', savings: 'Savings' };

export default async function Dashboard() {
  let data;
  try {
    const [summary, accounts, items] = await Promise.all([
      monthSummary(),
      getAccounts(),
      db().from('items').select('id,institution,status,last_synced_at,last_error').then(check),
    ]);
    data = { summary, accounts, items, pos: cashPosition(accounts) };
  } catch (err) {
    return (
      <main>
        <header className="top"><h1>Money Tracker</h1><Actions hasItems={false} /></header>
        <div className="card">
          <h2>Setup needed</h2>
          <p>{err.message}</p>
          <p className="muted">Check the environment variables in Vercel and that the database migration has run.</p>
        </div>
      </main>
    );
  }

  const { summary, accounts, items, pos } = data;
  const monthName = new Date(`${summary.month}-15`).toLocaleString('en-US', { month: 'long', year: 'numeric' });

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
  const safeClass = summary.safeToSpend < 0 ? 'bad' : '';

  return (
    <main>
      <header className="top">
        <h1>Money Tracker <span className="muted" style={{ fontWeight: 400 }}>· {monthName}</span></h1>
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
        <h2>Safe to spend this month</h2>
        <div className="hero">
          <div>
            <div className="big" style={safeClass ? { color: 'var(--bad)' } : undefined}>{usd(summary.safeToSpend)}</div>
            <div className="sub">
              {usd(summary.perDay)}/day for the next {summary.daysLeft} {summary.daysLeft === 1 ? 'day' : 'days'}
            </div>
          </div>
          <div className="sub" style={{ textAlign: 'right' }}>
            Food + yourself budget: {usd(PLAN.buckets.food + PLAN.buckets.yourself)}
          </div>
        </div>
      </div>

      <div className="grid">
        {Object.entries(summary.buckets).map(([k, b]) => (
          <div className="card stat" key={k}>
            <div className="label">{BUCKET_LABEL[k]}</div>
            <div className="value">{usd(b.left)} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>left</span></div>
            <Bar spent={b.spent} budget={b.budget} />
            <div className="muted" style={{ fontSize: 13 }}>{usd(b.spent)} of {usd(b.budget)}</div>
          </div>
        ))}
        <div className="card stat">
          <div className="label">Cash after card balances</div>
          <div className="value" style={pos.netCash < 0 ? { color: 'var(--bad)' } : undefined}>{usd(pos.netCash)}</div>
          <div className="muted" style={{ fontSize: 13 }}>{usd(pos.cash)} cash − {usd(pos.cardDebt)} on cards</div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Plan check</h2>
          <div className="row"><span>Bills</span><span className="num">{usd(summary.bills.paid)} / {usd(summary.bills.planned)}</span></div>
          <div className="row"><span>India</span><span className="num">{usd(summary.india.sent)} / {usd(summary.india.planned)}</span></div>
          <div className="row"><span>Savings moved</span><span className="num">{usd(summary.savings.moved)} / {usd(summary.savings.planned)}</span></div>
          <div className="row"><span>Income received</span><span className="num in">{usd(summary.income)}</span></div>
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
        <h2>Recent transactions</h2>
        {summary.transactions.slice(0, 25).map((t) => {
          const b = bucketOf(t);
          const amt = Number(t.amount);
          return (
            <div className="row" key={t.id}>
              <div className="left">
                <div className="name">{t.merchant_name || t.name}</div>
                <div className="meta">
                  {t.date}{b ? ` · ${BUCKET_LABEL[b]}` : ' · not counted'}{t.pending ? ' · pending' : ''}
                </div>
              </div>
              <span className={`num ${amt < 0 ? 'in' : ''}`}>{amt < 0 ? '+' : ''}{usd2(Math.abs(amt))}</span>
            </div>
          );
        })}
        {summary.transactions.length === 0 && <p className="muted">No transactions this month yet.</p>}
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Last synced: {items.map((i) => `${i.institution} ${i.last_synced_at ? new Date(i.last_synced_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : 'never'}`).join(' · ')}
      </p>
    </main>
  );
}
