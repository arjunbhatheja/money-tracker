import Link from 'next/link';
import TxRow from '../../components/TxRow';
import RangePicker from '../../components/RangePicker';
import { listTransactions, BUCKETS, RANGES } from '../../lib/budget';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const usd = (n) => Math.abs(Number(n)).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const shortDate = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default async function Transactions({ searchParams }) {
  const sp = (await searchParams) || {};
  const q = typeof sp.q === 'string' ? sp.q : '';
  const bucket = typeof sp.bucket === 'string' && BUCKETS[sp.bucket] ? sp.bucket : '';
  const rangeKey = sp.period === 'current' ? 'paycheck' : (typeof sp.range === 'string' && RANGES[sp.range] ? sp.range : 'all');
  const from = typeof sp.from === 'string' ? sp.from : '';
  const to = typeof sp.to === 'string' ? sp.to : '';
  const { page, pages, total, sum, range, rows } = await listTransactions({ page: sp.page, q, bucket, range: rangeKey, from, to });

  const href = (overrides = {}) => {
    const params = new URLSearchParams();
    const v = { q, bucket, page: 1, ...overrides };
    if (v.q) params.set('q', v.q);
    if (v.bucket) params.set('bucket', v.bucket);
    if (rangeKey !== 'all') params.set('range', rangeKey);
    if (rangeKey === 'custom') { params.set('from', range.start); params.set('to', range.end); }
    if (v.page > 1) params.set('page', String(v.page));
    const s = params.toString();
    return `/transactions${s ? `?${s}` : ''}`;
  };

  const title = bucket ? BUCKETS[bucket] : 'All transactions';
  const when = range ? `${range.label} · ${shortDate(range.start)} – ${shortDate(range.end)}` : 'All time';

  return (
    <main>
      <header className="top">
        <h1>
          <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Money Tracker</Link>{' '}
          <span className="muted" style={{ fontWeight: 400 }}>· {title}</span>
        </h1>
        <Link className="btn" href="/" style={{ textDecoration: 'none' }}>← Dashboard</Link>
      </header>

      <div className="actions" style={{ marginBottom: 12 }}>
        <Link className="btn" href={href({ bucket: '' })} style={{ textDecoration: 'none', borderColor: !bucket ? 'var(--accent)' : undefined }}>All</Link>
        {Object.entries(BUCKETS).map(([k, l]) => (
          <Link key={k} className="btn" href={href({ bucket: k })}
            style={{ textDecoration: 'none', borderColor: bucket === k ? 'var(--accent)' : undefined, color: bucket === k ? 'var(--accent)' : undefined }}>
            {l}
          </Link>
        ))}
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 18px' }}>
        <span className="muted" style={{ fontSize: 14 }}>Time period</span>
        <RangePicker value={rangeKey} from={rangeKey === 'custom' ? range.start : ''} to={rangeKey === 'custom' ? range.end : ''} />
      </div>

      <form className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} action="/transactions">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search merchant, description or note"
          style={{ flex: '1 1 220px', font: 'inherit', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)' }}
        />
        {bucket && <input type="hidden" name="bucket" value={bucket} />}
        {rangeKey !== 'all' && <input type="hidden" name="range" value={rangeKey} />}
        {rangeKey === 'custom' && <><input type="hidden" name="from" value={range.start} /><input type="hidden" name="to" value={range.end} /></>}
        <button className="primary">Search</button>
        {(q || bucket || rangeKey !== 'all') && <Link className="btn" href="/transactions" style={{ textDecoration: 'none' }}>Clear</Link>}
      </form>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2>{title} · {when}</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            {total.toLocaleString()} transactions · net {sum < 0 ? '+' : ''}{usd(sum)}{pages > 1 ? ` · page ${page} of ${pages}` : ''}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Click a name to rename it. Change the category and press Move; “always” teaches it for that merchant from now on.
        </p>
        {rows.map((t) => <TxRow key={t.id} t={t} filterBucket={bucket} />)}
        {rows.length === 0 && <p className="muted">Nothing here.</p>}
        {pages > 1 && (
          <div className="actions" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            {page > 1 ? <Link className="btn" href={href({ page: page - 1 })} style={{ textDecoration: 'none' }}>← Newer</Link> : <span />}
            {page < pages ? <Link className="btn" href={href({ page: page + 1 })} style={{ textDecoration: 'none' }}>Older →</Link> : <span />}
          </div>
        )}
      </div>
    </main>
  );
}
