'use client';

import { useState } from 'react';

const OPTIONS = [
  ['food', 'Food'],
  ['yourself', 'Yourself'],
  ['bills', 'Bills'],
  ['india', 'India'],
  ['big_purchase', 'Big purchase (from savings)'],
  ['savings', 'Savings / investing'],
  ['income', 'Income'],
  ['ignore', 'Not counted'],
];

const usd = (n) => Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function Item({ item, onDone }) {
  const [bucket, setBucket] = useState(item.guess);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(body) {
    setBusy(true);
    setError('');
    const res = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, ...body }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) onDone(item.id);
    else { setError(j.error || 'Could not save'); setBusy(false); }
  }

  return (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      <div className="left" style={{ flex: '1 1 220px' }}>
        <div className="name">{item.name}</div>
        <div className="meta">{item.date} · {item.amount < 0 ? `+${usd(item.amount)} in` : usd(item.amount)}</div>
        {error && <div className="error">{error}</div>}
      </div>
      <div className="actions" style={{ alignItems: 'center' }}>
        <select value={bucket} onChange={(e) => setBucket(e.target.value)} disabled={busy}>
          {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="muted" style={{ fontSize: 13, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> always
        </label>
        {bucket === item.guess && !remember ? (
          <button onClick={() => send({ confirm: true })} disabled={busy}>Looks right</button>
        ) : (
          <button className="primary" onClick={() => send({ bucket, remember })} disabled={busy}>Save</button>
        )}
      </div>
    </div>
  );
}

export default function Review({ items }) {
  const [left, setLeft] = useState(items);
  if (!left.length) return null;
  const done = (id) => {
    const next = left.filter((i) => i.id !== id);
    setLeft(next);
    if (!next.length) window.location.reload();
  };
  return (
    <div className="card">
      <h2>Review ({left.length})</h2>
      <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
        New or unusual transactions. Pick a category; “always” remembers it for that merchant.
      </p>
      {left.map((i) => <Item key={i.id} item={i} onDone={done} />)}
      <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        <button onClick={() => window.location.reload()}>Refresh numbers</button>
      </div>
    </div>
  );
}
