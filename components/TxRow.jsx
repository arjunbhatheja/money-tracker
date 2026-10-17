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
const LABEL = Object.fromEntries(OPTIONS);

const usd2 = (n) => Math.abs(Number(n)).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

async function post(body) {
  const res = await fetch('/api/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Could not save');
  return j;
}

// One transaction: rename it, or move it to another category (optionally for good).
export default function TxRow({ t, filterBucket }) {
  const [bucket, setBucket] = useState(t.bucket);
  const [saved, setSaved] = useState(t.bucket);
  const [remember, setRemember] = useState(true);
  const [note, setNote] = useState(t.note || '');
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState('');
  const amt = Number(t.amount);
  const merchant = t.merchant_name || t.name;
  const moved = filterBucket && saved !== filterBucket;

  async function save() {
    setState('saving');
    try {
      await post({ id: t.id, bucket, remember });
      setSaved(bucket);
      setState(remember ? `Moved to ${LABEL[bucket]}. Future ${merchant} transactions will follow.` : `Moved to ${LABEL[bucket]}`);
    } catch (e) { setState(e.message); }
  }

  async function saveName() {
    setState('saving');
    try {
      await post({ id: t.id, rename: note });
      setEditing(false);
      setState('Renamed');
    } catch (e) { setState(e.message); }
  }

  return (
    <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center', opacity: moved ? 0.55 : 1 }}>
      <div className="left" style={{ flex: '1 1 240px' }}>
        {editing ? (
          <div className="actions" style={{ alignItems: 'center' }}>
            <input
              value={note}
              autoFocus
              placeholder={`What was this? (e.g. "Haircut")`}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false); }}
              style={{ font: 'inherit', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)', minWidth: 180 }}
            />
            <button className="primary" onClick={saveName}>Save</button>
            <button onClick={() => { setEditing(false); setNote(t.note || ''); }}>Cancel</button>
          </div>
        ) : (
          <div className="name" title="Rename" style={{ cursor: 'pointer' }} onClick={() => setEditing(true)}>
            {note || merchant}
          </div>
        )}
        <div className="meta">
          {t.date}{note ? `, ${merchant}` : ''}{t.account ? `, ${t.account}` : ''}{t.pending ? ', pending' : ''}{t.review ? ', needs review' : ''}
          {t.source === 'rule' ? ', by rule' : t.source === 'override' ? ', set by you' : ''}
        </div>
      </div>
      <div className="actions" style={{ alignItems: 'center' }}>
        <span className={`num ${amt < 0 ? 'in' : ''}`} style={{ minWidth: 90, textAlign: 'right' }}>
          {amt < 0 ? '+' : ''}{usd2(amt)}
        </span>
        <select value={bucket} onChange={(e) => { setBucket(e.target.value); setState(''); }} aria-label="Category">
          {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {bucket !== saved && (
          <>
            <label className="muted" style={{ fontSize: 13, display: 'flex', gap: 4, alignItems: 'center' }} title={`Apply to every ${merchant} transaction from now on`}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Always
            </label>
            <button className="primary" onClick={save} disabled={state === 'saving'}>Move</button>
          </>
        )}
      </div>
      {state && state !== 'saving' && <div className="muted" style={{ fontSize: 12, flexBasis: '100%' }}>{state}</div>}
    </div>
  );
}
