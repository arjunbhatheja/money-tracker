'use client';

import { useCallback, useState } from 'react';

const PLAID_SCRIPT = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
const LINK_TOKEN_KEY = 'mt_link_token';

export function loadPlaid() {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve(window.Plaid);
    const s = document.createElement('script');
    s.src = PLAID_SCRIPT;
    s.onload = () => resolve(window.Plaid);
    s.onerror = () => reject(new Error('Could not load Plaid Link'));
    document.head.appendChild(s);
  });
}

export async function finishLink(publicToken, metadata) {
  const res = await fetch('/api/plaid/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token: publicToken, institution: metadata?.institution?.name }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Could not save the connection');
  return j;
}

export function rememberLinkToken(token) {
  try { localStorage.setItem(LINK_TOKEN_KEY, token); } catch {}
}
export function recallLinkToken() {
  try { return localStorage.getItem(LINK_TOKEN_KEY); } catch { return null; }
}

export default function Actions({ hasItems }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = useCallback(async () => {
    setBusy(true);
    setStatus('Opening Plaid…');
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not start Plaid Link');
      rememberLinkToken(j.link_token);
      const Plaid = await loadPlaid();
      const handler = Plaid.create({
        token: j.link_token,
        onSuccess: async (publicToken, metadata) => {
          setStatus('Saving and syncing…');
          try {
            await finishLink(publicToken, metadata);
            window.location.reload();
          } catch (err) {
            setStatus(err.message);
            setBusy(false);
          }
        },
        onExit: (err) => {
          setStatus(err ? err.display_message || err.error_message || 'Plaid closed' : '');
          setBusy(false);
        },
      });
      handler.open();
    } catch (err) {
      setStatus(err.message);
      setBusy(false);
    }
  }, []);

  const sync = useCallback(async () => {
    setBusy(true);
    setStatus('Syncing…');
    const res = await fetch('/api/plaid/sync', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(j.error || 'Sync failed');
      setBusy(false);
      return;
    }
    const failed = (j.results || []).filter((r) => !r.ok);
    if (failed.length) {
      setStatus(`Synced, but ${failed.map((f) => f.institution).join(', ')} failed`);
      setBusy(false);
    } else {
      window.location.reload();
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }, []);

  return (
    <div style={{ textAlign: 'right' }}>
      <div className="actions">
        {hasItems && <button onClick={sync} disabled={busy}>Sync</button>}
        <button className="primary" onClick={connect} disabled={busy}>Add bank</button>
        <button onClick={logout}>Sign out</button>
      </div>
      {status && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{status}</div>}
    </div>
  );
}
