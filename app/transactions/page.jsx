import Link from 'next/link';
import TxRow from '../../components/TxRow';
import { listTransactions, BUCKETS } from '../../lib/budget';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Transactions({ searchParams }) {
  const sp = (await searchParams) || {};
  const q = typeof sp.q === 'string' ? sp.q : '';
  const bucket = typeof sp.bucket === 'string' ? sp.bucket : '';
  const { page, pages, total, rows } = await listTransactions({ page: sp.page, q, bucket });

  const href = (p) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (bucket) params.set('bucket', bucket);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return `/transactions${s ? `?${s}` : ''}`;
  };

  return (
    <main>
      <header className="top">
        <h1><Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Money Tracker</Link> <span className="muted" style={{ fontWeight: 400 }}>· All transactions</span></h1>
        <Link className="btn" href="/" style={{ textDecoration: 'none' }}>← Dashboard</Link>
      </header>

      <form className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} action="/transactions">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search merchant, description or note"
          style={{ flex: '1 1 220px', font: 'inherit', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)' }}
        />
        <select name="bucket" defaultValue={bucket}>
          <option value="">All categories</option>
          {Object.entries(BUCKETS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="primary">Filter</button>
        {(q || bucket) && <Link className="btn" href="/transactions" style={{ textDecoration: 'none' }}>Clear</Link>}
      </form>

      <div className="card">
        <h2>{total.toLocaleString()} transactions{pages > 1 ? ` · page ${page} of ${pages}` : ''}</h2>
        {rows.map((t) => <TxRow key={t.id} t={t} />)}
        {rows.length === 0 && <p className="muted">Nothing matches.</p>}
        {pages > 1 && (
          <div className="actions" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            {page > 1 ? <Link className="btn" href={href(page - 1)} style={{ textDecoration: 'none' }}>← Newer</Link> : <span />}
            {page < pages ? <Link className="btn" href={href(page + 1)} style={{ textDecoration: 'none' }}>Older →</Link> : <span />}
          </div>
        )}
      </div>
    </main>
  );
}
