'use client';

import { useEffect, useRef, useState } from 'react';

// Completion feedback with an optional action (e.g. Undo). Fire with showToast().
export function showToast(detail) {
  window.dispatchEvent(new CustomEvent('mt-toast', { detail }));
}

export default function Toaster() {
  const [toast, setToast] = useState(null);
  const timer = useRef(0);

  useEffect(() => {
    const on = (e) => {
      clearTimeout(timer.current);
      setToast({ ...e.detail, key: Date.now() });
      timer.current = setTimeout(() => setToast(null), e.detail.duration || 5000);
    };
    window.addEventListener('mt-toast', on);
    return () => window.removeEventListener('mt-toast', on);
  }, []);

  if (!toast) return null;
  return (
    <div className="toast" key={toast.key} role="status" aria-live="polite">
      <span>{toast.text}</span>
      {toast.actionLabel && (
        <button
          className="toast-action"
          onClick={async () => { clearTimeout(timer.current); setToast(null); await toast.onAction?.(); }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}
