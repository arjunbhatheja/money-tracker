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

const usd2 = (n) => Math.abs(Number(n)).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// One transaction with an inline category picker.
export default function TxRow({ t }) {
  const [bucket, setBucket] = useState(t.bucket);
  const [saved, setSaved] = useState(t.bucket);
  const [remember, setRemember] = useState(false);
  const [state, setState] = useState('');
  const amt = Number(t.amount);
  const name = t.merchant_name || t.name;

  async function save() {
    setState('saving');
    const res = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, bucket, remember }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setSaved(bucket); setState(remember ? 'saved + rule' : 'saved'); }
    else setState(j.error || 'error');
  }

  return (
    <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
      <div className="left" style={{ flex: '1 1 240px' }}>
        <div className="name">{t.note ? `${name} — ${t.note}` : name}</div>
        <div className="meta">
          {t.date} · {t.account}{t.pending ? ' · pending' : ''}{t.review ? ' · to review' : ''}
          {t.source === 'rule' ? ' · by rule' : t.source === 'override' ? ' · set by you' : ''}
        </div>
      </div>
      <div className="actions" style={{ alignItems: 'center' }}>
        <span className={`num ${amt < 0 ? 'in' : ''}`} style={{ minWidth: 90, textAlign: 'right' }}>
          {amt < 0 ? '+' : ''}{usd2(amt)}
        </span>
        <select value={bucket} onChange={(e) => { setBucket(e.target.value); setState(''); }}>
          {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {bucket !== saved && (
          <>
            <label className="muted" style={{ fontSize: 13, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> always
            </label>
            <button className="primary" onClick={save} disabled={state === 'saving'}>Save</button>
          </>
        )}
        {state && state !== 'saving' && <span className="muted" style={{ fontSize: 12 }}>{state}</span>}
      </div>
    </div>
  );
}
