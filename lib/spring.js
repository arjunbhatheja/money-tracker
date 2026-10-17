// Tiny interruptible spring (Apple's damping + response model), driven by rAF.
// Always starts from the current value and carries velocity through re-targets.

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Apple's momentum projection (Designing Fluid Interfaces): where a flick would come to rest.
export function project(velocity /* px/s */, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// Progressive resistance past a boundary instead of a hard stop.
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// Animate a single value. Returns a controller; call .stop() to interrupt and read .value/.velocity.
export function spring({ from, to, velocity = 0, damping = 1, response = 0.4, onUpdate, onComplete }) {
  const stiffness = (2 * Math.PI / response) ** 2;
  const friction = (4 * Math.PI * damping) / response;
  const state = { value: from, velocity, running: true, raf: 0 };
  let last = performance.now();

  const step = (now) => {
    if (!state.running) return;
    const dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    // Sub-step for stability at low frame rates.
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const force = -stiffness * (state.value - to) - friction * state.velocity;
      state.velocity += force * h;
      state.value += state.velocity * h;
    }
    const settled = Math.abs(state.value - to) < 0.3 && Math.abs(state.velocity) < 8;
    if (settled) {
      state.value = to;
      state.velocity = 0;
      state.running = false;
      onUpdate?.(to);
      onComplete?.();
      return;
    }
    onUpdate?.(state.value);
    state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);

  return {
    get value() { return state.value; },
    get velocity() { return state.velocity; },
    get running() { return state.running; },
    stop() { state.running = false; cancelAnimationFrame(state.raf); },
  };
}
