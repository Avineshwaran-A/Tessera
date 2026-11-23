import { store } from '../core/store';
import type { ID } from '../core/model';

export type View = { x: number; y: number; k: number };
export const DEFAULT_VIEW: View = { x: 80, y: 60, k: 1 };
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const getView = (b: ID = store.ui.boardId) => store.ui.view[b] ?? DEFAULT_VIEW;
export const setView = (v: View, b: ID = store.ui.boardId) => store.setUI({ view: { ...store.ui.view, [b]: v } });

let raf = 0;
/** Stop any running tween or glide — called whenever the user takes direct control. */
export const stopMotion = () => { cancelAnimationFrame(raf); raf = 0; };

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Tween the viewport to `to` (240ms ease-out). Zoom interpolates in log space so it feels linear. */
export function animateView(to: View, ms = 240) {
  stopMotion();
  const b = store.ui.boardId; const from = getView(b);
  if (reducedMotion()) return setView(to, b);
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms), e = easeOut(t);
    const k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e);
    setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k }, b);
    if (t < 1 && store.ui.boardId === b) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/** Zoom by factor around a canvas-local point, animated. */
export function zoomAround(factor: number, px: number, py: number) {
  const v = getView(); const k = clampK(v.k * factor);
  animateView({ k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k });
}
export const clampK = (k: number) => Math.min(3, Math.max(0.15, k));

/** Inertial glide after a pan is released. vx/vy in px per ms. */
export function glide(vx: number, vy: number) {
  stopMotion();
  if (reducedMotion() || Math.hypot(vx, vy) < 0.05) return;
  const b = store.ui.boardId; let last = performance.now();
  const step = (now: number) => {
    const dt = Math.min(32, now - last); last = now;
    const v = getView(b); setView({ ...v, x: v.x + vx * dt, y: v.y + vy * dt }, b);
    const f = Math.pow(0.92, dt / 16.67); vx *= f; vy *= f;
    if (Math.hypot(vx, vy) > 0.02 && store.ui.boardId === b) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/** Fit the given world rect into a viewport of size w×h with padding. */
export function fitView(r: { x: number; y: number; w: number; h: number }, w: number, h: number, pad = 80): View {
  const k = clampK(Math.min((w - pad * 2) / Math.max(r.w, 1), (h - pad * 2) / Math.max(r.h, 1), 1.25));
  return { k, x: w / 2 - (r.x + r.w / 2) * k, y: h / 2 - (r.y + r.h / 2) * k };
}
