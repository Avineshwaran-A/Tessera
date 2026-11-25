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
export type Pt = { x: number; y: number };
export interface ThreadShape {
  type?: 'curve' | 'straight' | 'elbow';
  /** waypoint offsets from the midpoint of the two centres */
  points?: Pt[];
}
export interface ThreadGeom {
  d: string;
  /** absolute positions of the user's waypoints (drag handles) */
  points: Pt[];
  /** where a new first bend would sit when there are no waypoints (the auto shape's crest) */
  ghost: Pt | null;
  /** label / popover anchor */
  anchor: Pt;
  start: Pt; end: Pt;
  /** the polyline the path follows (start, waypoints, end): used to find where a click lands */
  route: Pt[];
}

/** Waypoint list for a thread, reading the older single `bend` too. */
export const threadPoints = (t: { points?: Pt[]; bend?: Pt }) => t.points ?? (t.bend ? [t.bend] : []);

function autoBend(ca: Pt, cb: Pt): Pt { return { x: -(cb.y - ca.y) * 0.06, y: (cb.x - ca.x) * 0.06 }; }

/**
 * Smooth curve through every point: centripetal Catmull-Rom (alpha 0.5), written as cubic Béziers.
 * Centripetal parameterisation never loops or overshoots when points bunch up, which the uniform
 * version does. Ends use a reflected neighbour so the line leaves each block naturally.
 */
function spline(pts: Pt[]) {
  const n = pts.length;
  const at = (i: number): Pt => i < 0 ? { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y }
    : i >= n ? { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y } : pts[i];
  const dist = (a: Pt, b: Pt) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y))); // |b-a|^0.5
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = pts[i], p2 = pts[i + 1], p3 = at(i + 2);
    const d1 = dist(p0, p1), d2 = dist(p1, p2), d3 = dist(p2, p3);
    const c1 = {
      x: (d1 * d1 * p2.x - d2 * d2 * p0.x + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.x) / (3 * d1 * (d1 + d2)),
      y: (d1 * d1 * p2.y - d2 * d2 * p0.y + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.y) / (3 * d1 * (d1 + d2)),
    };
    const c2 = {
      x: (d3 * d3 * p1.x - d2 * d2 * p3.x + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.x) / (3 * d3 * (d3 + d2)),
      y: (d3 * d3 * p1.y - d2 * d2 * p3.y + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.y) / (3 * d3 * (d3 + d2)),
    };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Orthogonal route through the points, with softened corners. */
function orthogonal(pts: Pt[], r = 10) {
  // expand each hop into horizontal-then-vertical legs
  const legs: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = legs[legs.length - 1], next = pts[i];
    if (prev.x !== next.x && prev.y !== next.y) legs.push({ x: next.x, y: prev.y });
    legs.push(next);
  }
  let d = `M${legs[0].x},${legs[0].y}`;
  for (let i = 1; i < legs.length - 1; i++) {
    const a = legs[i - 1], b = legs[i], c = legs[i + 1];
    const rr = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y), vx = Math.sign(c.x - b.x), vy = Math.sign(c.y - b.y);
    d += ` L${b.x - ux * rr},${b.y - uy * rr} Q${b.x},${b.y} ${b.x + vx * rr},${b.y + vy * rr}`;
  }
  const last = legs[legs.length - 1];
  return d + ` L${last.x},${last.y}`;
}

export function threadPath(a: Rect, b: Rect, shape: ThreadShape = {}): ThreadGeom {
  const type = shape.type ?? 'curve';
  const ca = center(a), cb = center(b);
  const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
  const pts = (shape.points ?? []).map(o => ({ x: mid.x + o.x, y: mid.y + o.y }));
  const centreOf = (list: Pt[]) => list[Math.floor((list.length - 1) / 2)];

  if (type === 'elbow') {
    if (!pts.length) {
      // automatic right-angle route between facing sides
      const horizontal = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y), pad = 6;
      let p: Pt, q: Pt, k: Pt;
      if (horizontal) { const dir = cb.x >= ca.x ? 1 : -1; p = { x: ca.x + dir * (a.w / 2 + pad), y: ca.y }; q = { x: cb.x - dir * (b.w / 2 + pad), y: cb.y }; k = { x: mid.x, y: p.y }; const k2 = { x: mid.x, y: q.y };
        return { d: orthogonal([p, k, k2, q]), points: [], ghost: { x: mid.x, y: (p.y + q.y) / 2 }, anchor: { x: mid.x, y: (p.y + q.y) / 2 }, start: p, end: q, route: [p, k, k2, q] }; }
      const dir = cb.y >= ca.y ? 1 : -1; p = { x: ca.x, y: ca.y + dir * (a.h / 2 + pad) }; q = { x: cb.x, y: cb.y - dir * (b.h / 2 + pad) }; k = { x: p.x, y: mid.y }; const k2 = { x: q.x, y: mid.y };
      return { d: orthogonal([p, k, k2, q]), points: [], ghost: { x: (p.x + q.x) / 2, y: mid.y }, anchor: { x: (p.x + q.x) / 2, y: mid.y }, start: p, end: q, route: [p, k, k2, q] };
    }
    const p = edgePoint(a, pts[0].x, pts[0].y), q = edgePoint(b, pts[pts.length - 1].x, pts[pts.length - 1].y);
    const route = [p, ...pts, q];
    return { d: orthogonal(route), points: pts, ghost: null, anchor: centreOf(pts), start: p, end: q, route };
  }

  if (type === 'straight') {
    const p = pts.length ? edgePoint(a, pts[0].x, pts[0].y) : edgePoint(a, cb.x, cb.y);
    const q = pts.length ? edgePoint(b, pts[pts.length - 1].x, pts[pts.length - 1].y) : edgePoint(b, ca.x, ca.y);
    const route = [p, ...pts, q];
    const m = pts.length ? centreOf(pts) : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    return { d: 'M' + route.map(r => `${r.x},${r.y}`).join(' L'), points: pts, ghost: pts.length ? null : m, anchor: m, start: p, end: q, route };
  }

  // curve
  const through = pts.length ? pts : [{ x: mid.x + autoBend(ca, cb).x, y: mid.y + autoBend(ca, cb).y }];
  const p = edgePoint(a, through[0].x, through[0].y), q = edgePoint(b, through[through.length - 1].x, through[through.length - 1].y);
  if (!pts.length) {
    // same spline as a bent line: starting to drag the crest continues this exact shape, no jump
    const H = through[0];
    return { d: spline([p, H, q]), points: [], ghost: H, anchor: H, start: p, end: q, route: [p, H, q] };
  }
  const route = [p, ...pts, q];
  return { d: spline(route), points: pts, ghost: null, anchor: centreOf(pts), start: p, end: q, route };
}

/** Which gap of the route a world point is nearest to: the index at which to insert a new waypoint. */
export function insertIndex(route: Pt[], w: Pt) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((w.x - a.x) * vx + (w.y - a.y) * vy) / l2));
    const d = Math.hypot(a.x + vx * t - w.x, a.y + vy * t - w.y);
    if (d < bd) { bd = d; best = i; }
  }
  return best; // insert after route[best], i.e. at points index `best`
}

/**
 * Square a connector up to the axes: every leg becomes horizontal or vertical, following the
 * direction each leg already mostly runs in. Anchors are the block centres, so the line meets
 * each block at the middle of a side. Returns new waypoint offsets (relative to `mid`).
 */
export function alignToAxes(ca: Pt, cb: Pt, offsets: Pt[]): Pt[] {
  const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
  const pts = offsets.map(o => ({ x: mid.x + o.x, y: mid.y + o.y }));
  if (!pts.length) {
    // no bends yet: one elbow, turning on the axis the line mostly runs along
    const corner = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y) ? { x: cb.x, y: ca.y } : { x: ca.x, y: cb.y };
    return [{ x: corner.x - mid.x, y: corner.y - mid.y }];
  }
  let prev = ca;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === pts.length - 1) {
      // last bend must square up with both its neighbours: pick the nearer of the two corners
      const c1 = { x: prev.x, y: cb.y }, c2 = { x: cb.x, y: prev.y };
      pts[i] = Math.hypot(c1.x - p.x, c1.y - p.y) <= Math.hypot(c2.x - p.x, c2.y - p.y) ? c1 : c2;
    } else if (Math.abs(p.x - prev.x) >= Math.abs(p.y - prev.y)) pts[i] = { x: p.x, y: prev.y };
    else pts[i] = { x: prev.x, y: p.y };
    prev = pts[i];
  }
  // drop bends that ended up redundant: on a (near-)straight run between their neighbours, or a
  // near-zero jog. Repeat until stable, since removing one can make its neighbour redundant.
  const tol = 4;
  let keep = pts;
  for (let changed = true; changed;) {
    changed = false;
    const all = [ca, ...keep, cb];
    for (let i = 0; i < keep.length; i++) {
      const a = all[i], p = all[i + 1], b = all[i + 2];
      const collinear = (Math.abs(a.x - p.x) < tol && Math.abs(p.x - b.x) < tol) || (Math.abs(a.y - p.y) < tol && Math.abs(p.y - b.y) < tol);
      const stacked = Math.hypot(p.x - a.x, p.y - a.y) < tol || Math.hypot(b.x - p.x, b.y - p.y) < tol;
      if (collinear || stacked) { keep = keep.filter((_, j) => j !== i); changed = true; break; }
    }
  }
  return keep.map(p => ({ x: p.x - mid.x, y: p.y - mid.y }));
}
