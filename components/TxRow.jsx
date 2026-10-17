'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from './Sheet';
import { showToast } from './Toaster';

const OPTIONS = [
  ['food', 'Food', 'Groceries, restaurants, coffee'],
  ['yourself', 'Yourself', 'Shopping, rides, fun, subscriptions'],
  ['bills', 'Bills', 'Rent, utilities, insurance, fuel'],
  ['india', 'India', 'Money sent home'],
  ['big_purchase', 'Big purchase', 'One-off, paid from savings'],
  ['savings', 'Savings and investing', 'Moved to savings or investments'],
  ['income', 'Income', 'Pay, interest, bonuses'],
  ['ignore', 'Not counted', 'Card payments, moving your own money'],
];
const LABEL = Object.fromEntries(OPTIONS.map(([k, l]) => [k, l]));

const usd2 = (n) => Math.abs(Number(n)).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const longDate = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDate = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

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

// Tap a transaction to open a sheet: rename it, move it, and choose whether
// future transactions from the same merchant follow. Every change can be undone.
export default function TxRow({ t, showAccount = true }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState(t.bucket);
  const [note, setNote] = useState(t.note || '');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amt = Number(t.amount);
  const merchant = t.merchant_name || t.name;
  const changedBucket = bucket !== t.bucket;
  const changedNote = (note.trim() || '') !== (t.note || '');

  function openSheet() {
    setBucket(t.bucket); setNote(t.note || ''); setRemember(true); setError(''); setOpen(true);
  }

  async function save() {
    setBusy(true); setError('');
    try {
      let undo, text;
      if (changedBucket) {
        const r = await post({ id: t.id, bucket, remember, note: changedNote ? note.trim() || null : undefined });
        undo = { id: t.id, previous: r.previous, rule: r.rule };
        text = remember ? `Moved to ${LABEL[bucket]}. Future ${merchant} transactions will follow.` : `Moved to ${LABEL[bucket]}.`;
      } else {
        const r = await post({ id: t.id, rename: note });
        undo = { id: t.id, previous: r.previous };
        text = note.trim() ? `Renamed to ${note.trim()}.` : 'Name reset.';
      }
      navigator.vibrate?.(10);
      setOpen(false);
      router.refresh();
      showToast({
        text,
        actionLabel: 'Undo',
        onAction: async () => {
          await post({ undo });
          router.refresh();
          showToast({ text: 'Undone.', duration: 2500 });
        },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="row tx" onClick={openSheet} aria-haspopup="dialog">
        <span className="left">
          <span className="name">{t.note || merchant}</span>
          <span className="meta">
            {shortDate(t.date)}, {LABEL[t.bucket]}
            {t.note ? `, ${merchant}` : ''}
            {showAccount && t.account ? `, ${t.account}` : ''}
            {t.pending ? ', pending' : ''}
          </span>
        </span>
        <span className="tx-right">
          {t.review && <span className="dot" aria-label="Needs review" />}
          <span className={`num ${amt < 0 ? 'in' : ''}`}>{amt < 0 ? '+' : ''}{usd2(amt)}</span>
          <span className="chev" aria-hidden="true" />
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Transaction"
        footer={
          <>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary wide" onClick={save} disabled={busy || (!changedBucket && !changedNote)}>
              {busy ? 'Saving…' : changedBucket ? `Move to ${LABEL[bucket]}` : 'Save name'}
            </button>
          </>
        }
      >
        <div className="sheet-hero">
          <div className={`sheet-amount ${amt < 0 ? 'in' : ''}`}>{amt < 0 ? '+' : ''}{usd2(amt)}</div>
          <div className="muted">{merchant}</div>
          <div className="muted small">{longDate(t.date)}{t.account ? `, ${t.account}` : ''}{t.pending ? ', pending' : ''}</div>
        </div>

        <label className="field">
          <span>Name</span>
          <input
            type="text"
            value={note}
            placeholder={merchant}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
          />
        </label>

        <div className="group-label">Category</div>
        <div className="choices" role="radiogroup" aria-label="Category">
          {OPTIONS.map(([k, l, hint]) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={bucket === k}
              className="choice"
              data-autofocus={bucket === k ? '' : undefined}
              onClick={() => setBucket(k)}
            >
              <span>
                <span className="choice-label">{l}</span>
                <span className="choice-hint">{hint}</span>
              </span>
              <span className="check" aria-hidden="true" />
            </button>
          ))}
        </div>

        {changedBucket && (
          <label className="toggle-row">
            <span>
              <span className="choice-label">Always for {merchant}</span>
              <span className="choice-hint">Future transactions from this merchant go to {LABEL[bucket]}</span>
            </span>
            <input type="checkbox" className="switch" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          </label>
        )}
      </Sheet>
    </>
  );
}
