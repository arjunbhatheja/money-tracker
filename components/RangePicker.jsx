'use client';

import { useState } from 'react';

const RANGES = [
  ['paycheck', 'This paycheck'],
  ['last_paycheck', 'Last paycheck'],
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_3_months', 'Last 3 months'],
  ['last_6_months', 'Last 6 months'],
  ['this_year', 'This year'],
  ['all', 'All time'],
  ['custom', 'Custom dates…'],
];

const inputStyle = {
  font: 'inherit', fontSize: 14, padding: '5px 8px', borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)',
};

// Changes ?range=…(&from=&to=) on the current page, keeping other filters.
export default function RangePicker({ value, from, to, allowAll = true }) {
  const [range, setRange] = useState(value);
  const [start, setStart] = useState(from || '');
  const [end, setEnd] = useState(to || '');

  function go(r, f, t) {
    const url = new URL(window.location.href);
    url.searchParams.delete('page');
    url.searchParams.delete('period');
    url.searchParams.set('range', r);
    if (r === 'custom') { url.searchParams.set('from', f); url.searchParams.set('to', t); }
    else { url.searchParams.delete('from'); url.searchParams.delete('to'); }
    window.location.href = url.toString();
  }

  return (
    <div className="actions" style={{ alignItems: 'center' }}>
      <select
        value={range}
        aria-label="Time period"
        onChange={(e) => { setRange(e.target.value); if (e.target.value !== 'custom') go(e.target.value); }}
      >
        {RANGES.filter(([k]) => allowAll || k !== 'all').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {range === 'custom' && (
        <>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} aria-label="From" />
          <span className="muted">to</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} aria-label="To" />
          <button className="primary" disabled={!start || !end} onClick={() => go('custom', start, end)}>Apply</button>
        </>
      )}
    </div>
  );
}
