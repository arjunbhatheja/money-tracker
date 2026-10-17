'use client';

import { useEffect } from 'react';

// Shows the header's scroll-edge effect only once content actually scrolls under it.
export default function ScrollEdge() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => { root.dataset.scrolled = window.scrollY > 4 ? '1' : ''; };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return null;
}
