import type { Rect } from './geometry';

export const GRID = 8;
export interface Guide { axis: 'x' | 'y'; at: number; from: number; to: number; }

/**
 * Snap a moving rect: alignment with other rects' edges/centers wins over the grid.
 * Returns the snapped top-left and the guide lines to draw.
 */
export function snapRect(r: Rect, others: Rect[], threshold: number, grid = true) {
  const xs = [r.x, r.x + r.w / 2, r.x + r.w], ys = [r.y, r.y + r.h / 2, r.y + r.h];
  type Hit = { d: number; off: number; at: number } | null;
  let best: Hit = null as Hit, bestY: Hit = null as Hit;
  for (const o of others) {
    const ox = [o.x, o.x + o.w / 2, o.x + o.w], oy = [o.y, o.y + o.h / 2, o.y + o.h];
    for (const a of xs) for (const b of ox) { const d = Math.abs(a - b); if (d <= threshold && (!best || d < best.d)) best = { d, off: b - a, at: b }; }
    for (const a of ys) for (const b of oy) { const d = Math.abs(a - b); if (d <= threshold && (!bestY || d < bestY.d)) bestY = { d, off: b - a, at: b }; }
  }
  const x = best ? r.x + best.off : grid ? Math.round(r.x / GRID) * GRID : r.x;
  const y = bestY ? r.y + bestY.off : grid ? Math.round(r.y / GRID) * GRID : r.y;
  const guides: Guide[] = [];
  const fin = { x, y, w: r.w, h: r.h };
  if (best) {
    const hits = others.filter(o => [o.x, o.x + o.w / 2, o.x + o.w].some(v => Math.abs(v - best!.at) < 0.5));
    const ysAll = [fin.y, fin.y + fin.h, ...hits.flatMap(o => [o.y, o.y + o.h])];
    guides.push({ axis: 'x', at: best.at, from: Math.min(...ysAll) - 12, to: Math.max(...ysAll) + 12 });
  }
  if (bestY) {
    const hits = others.filter(o => [o.y, o.y + o.h / 2, o.y + o.h].some(v => Math.abs(v - bestY!.at) < 0.5));
    const xsAll = [fin.x, fin.x + fin.w, ...hits.flatMap(o => [o.x, o.x + o.w])];
    guides.push({ axis: 'y', at: bestY.at, from: Math.min(...xsAll) - 12, to: Math.max(...xsAll) + 12 });
  }
  return { x, y, guides };
}
