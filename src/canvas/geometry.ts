import type { Block } from '../core/model';
export interface Rect { x: number; y: number; w: number; h: number; }
export const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const contains = (o: Rect, i: Rect) => i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;
export const normRect = (x1: number, y1: number, x2: number, y2: number): Rect => ({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });

/** Point where the ray from rect center toward (tx,ty) exits the rect. */
export function edgePoint(r: Rect, tx: number, ty: number, pad = 6) {
  const c = center(r); const dx = tx - c.x, dy = ty - c.y;
  if (!dx && !dy) return c;
  const sx = (r.w / 2 + pad) / Math.abs(dx || 1e-9), sy = (r.h / 2 + pad) / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy, 1);
  return { x: c.x + dx * s, y: c.y + dy * s };
}
export function threadPath(a: Block, b: Block) {
  const ca = center(a), cb = center(b);
  const p = edgePoint(a, cb.x, cb.y), q = edgePoint(b, ca.x, ca.y);
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  const nx = -(q.y - p.y) * 0.12, ny = (q.x - p.x) * 0.12;
  return { d: `M${p.x},${p.y} Q${mx + nx},${my + ny} ${q.x},${q.y}`, mid: { x: mx + nx / 2, y: my + ny / 2 }, end: q, from: { x: mx + nx, y: my + ny } };
}
