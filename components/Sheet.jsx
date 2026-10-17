'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { spring, project, rubberband, prefersReducedMotion } from '../lib/spring';

// iOS-style bottom sheet.
// - Opens with a critically damped spring; dismisses down the same path it came up.
// - Drag the grabber/header 1:1 (grab offset respected, pointer capture).
// - Release uses velocity: projected momentum decides close vs. snap back,
//   and the spring continues at the finger's speed (no seam).
// - Rubber-bands when pulled up past the top. Interruptible at any moment.
export default function Sheet({ open, onClose, title, children, footer }) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef(null);
  const scrim = useRef(null);
  const anim = useRef(null);
  const y = useRef(0);
  const h = useRef(600);
  const drag = useRef(null);
  const closing = useRef(false);
  const reduced = useRef(false);

  const paint = useCallback((v) => {
    y.current = v;
    if (panel.current) panel.current.style.transform = `translate3d(0, ${Math.max(v, -40)}px, 0)`;
    if (scrim.current) scrim.current.style.opacity = String(Math.max(0, Math.min(1, 1 - v / h.current)));
  }, []);

  const animateTo = useCallback((to, { velocity = 0, damping = 1, response = 0.38, done } = {}) => {
    anim.current?.stop();
    if (reduced.current) { paint(to); done?.(); return; }
    anim.current = spring({ from: y.current, to, velocity, damping, response, onUpdate: paint, onComplete: done });
  }, [paint]);

  const close = useCallback((velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    animateTo(h.current, {
      velocity,
      damping: 1,
      response: 0.32,
      done: () => { setMounted(false); closing.current = false; onClose?.(); },
    });
    if (reduced.current && panel.current) panel.current.dataset.state = 'closed';
  }, [animateTo, onClose]);

  useEffect(() => { if (open) { closing.current = false; setMounted(true); } else if (mounted) close(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!mounted || !panel.current) return;
    reduced.current = prefersReducedMotion();
    h.current = panel.current.offsetHeight || 600;
    paint(reduced.current ? 0 : h.current);
    requestAnimationFrame(() => animateTo(0));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current.querySelector('[data-autofocus]') || panel.current;
    first.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; anim.current?.stop(); };
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- drag ----
  const onPointerDown = (e) => {
    if (e.button !== 0 || reduced.current) return;
    anim.current?.stop(); // grab it mid-flight; continue from where it is
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startOffset: y.current, history: [{ y: e.clientY, t: performance.now() }], moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 6) return; // small hysteresis before committing
    d.moved = true;
    let next = d.startOffset + dy;
    if (next < 0) next = -rubberband(-next, h.current);
    paint(next);
    d.history.push({ y: e.clientY, t: performance.now() });
    if (d.history.length > 6) d.history.shift();
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    const a = d.history[0], b = d.history[d.history.length - 1];
    const dt = Math.max(1, b.t - a.t) / 1000;
    const velocity = (b.y - a.y) / dt; // px/s, positive = down
    const projected = y.current + project(velocity);
    if (projected > h.current * 0.45) close(velocity);
    else animateTo(0, { velocity, damping: 0.8, response: 0.3 }); // flick carried momentum: a little bounce
  };

  if (!mounted) return null;
  return createPortal(
    <div className="sheet-root" role="presentation">
      <div className="sheet-scrim" ref={scrim} onClick={() => close()} />
      <div className="sheet" ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-state="open">
        <div className="sheet-grab" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="sheet-handle" aria-hidden="true" />
          <div className="sheet-title">
            <span>{title}</span>
            <button className="sheet-close" onClick={() => close()} aria-label="Close">Done</button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
