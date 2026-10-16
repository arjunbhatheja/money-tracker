'use client';

import { useEffect, useState } from 'react';
import { loadPlaid, finishLink, recallLinkToken } from '../../components/Actions';

// Banks like Chase and Bank of America send you to their own site to log in,
// then back here. Plaid Link resumes with the same link token.
export default function OAuthReturn() {
  const [message, setMessage] = useState('Finishing your bank connection…');

  useEffect(() => {
    const token = recallLinkToken();
    if (!token) {
      setMessage('Connection session expired. Go back and try "Connect a bank" again.');
      return;
    }
    loadPlaid()
      .then((Plaid) => {
        const handler = Plaid.create({
          token,
          receivedRedirectUri: window.location.href,
          onSuccess: async (publicToken, metadata) => {
            try {
              await finishLink(publicToken, metadata);
              window.location.href = '/';
            } catch (err) {
              setMessage(err.message);
            }
          },
          onExit: () => { window.location.href = '/'; },
        });
        handler.open();
      })
      .catch((err) => setMessage(err.message));
  }, []);

  return <main><p className="muted">{message}</p></main>;
}
