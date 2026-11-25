import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { store, useStore, makeBlock, nextZ, boardPath } from '../core/store';
import { getBlockDef } from '../core/registry';
import { captureInto } from '../core/capture';
import { uid } from '../core/model';
import type { Block, ID } from '../core/model';
import { contains, intersects, normRect, threadPath, threadPoints, insertIndex, alignToAxes, center } from './geometry';
import { BlockView } from './BlockView';
import { contextMenu } from '../ui/ContextMenu';
import { blockMenu, canvasMenu, threadMenu } from '../ui/actions';
import { DEFAULT_VIEW, getView, setView, stopMotion, animateView, zoomAround, glide, fitView, clampK, reducedMotion } from './motion';
import { snapRect, GRID, Guide } from './snap';
import { Icon } from '../ui/icons';

export { DEFAULT_VIEW };

type Pt = { x: number; y: number };
type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; samples: { t: number; x: number; y: number }[] }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; base: string[] }
  | { kind: 'move'; ids: string[]; primary: string; start: Record<ID, Pt>; p0: Pt; moved: boolean; lastX: number; lastT: number; tilt: number; target: string | null; frame: string | null; board: ID | null; snapped: boolean }
  | { kind: 'resize'; id: string; sx: number; sy: number; w: number; h: number; ratio: number | null; started: boolean }
  | { kind: 'thread'; from: string; x: number; y: number; over: string | null }
  | { kind: 'bend'; id: ID; index: number; insert: boolean; started: boolean; p0: Pt }
  | { kind: 'rewire'; id: ID; end: 'from' | 'to'; x: number; y: number; over: string | null };

const IMAGE_CAPTION_H = 34;

export function Canvas() {
  const boardId = useStore(s => s.ui.boardId);
  const view = useStore(s => s.ui.view[s.ui.boardId] ?? DEFAULT_VIEW);
  const selection = useStore(s => s.ui.selection);
  const transition = useStore(s => s.ui.transition);
  const allBlocks = useStore(s => s.ws.blocks);
  const allThreads = useStore(s => s.ws.threads);
  const blocks = Object.values(allBlocks).filter(b => b.boardId === boardId).sort((a, b) => (a.type === 'frame' ? 0 : 1) - (b.type === 'frame' ? 0 : 1) || a.z - b.z);
  const threads = Object.values(allThreads).filter(t => t.boardId === boardId);
  const [editing, setEditing] = useState<string | null>(null);
  const [selThread, setSelThread] = useState<string | null>(null);
  /** one picked bend on the selected connection, so it can be deleted on its own */
  const [selBend, setSelBend] = useState<{ id: ID; index: number } | null>(null);
  const selBendRef = useRef(selBend); selBendRef.current = selBend;
  const selThreadRef = useRef(selThread); selThreadRef.current = selThread;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const guidesRef = useRef<Guide[]>([]); guidesRef.current = guides;
  const [absorb, setAbsorb] = useState<{ ids: Set<ID>; to: Pt; portal: ID } | null>(null);
  const [received, setReceived] = useState<ID | null>(null);
  const [space, setSpace] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null); dragRef.current = drag;
  /** snap state of the bend being dragged (kept outside React state so every move sees the last one) */
  const snapRef = useRef<{ x?: number; y?: number; line?: boolean }>({});

  useEffect(() => { setEditing(null); setSelThread(null); setSelBend(null); setGuides([]); }, [boardId]);
  useEffect(() => { if (selBend && selBend.id !== selThread) setSelBend(null); }, [selThread]); // eslint-disable-line

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect(); const v = getView();
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }, []);
  const local = (cx: number, cy: number) => { const r = ref.current!.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };

  // hooks used by the Shell (dock placement, edit-after-create, fit)
  useEffect(() => {
    const w = window as any;
    w.__tesseraCenter = () => { const r = ref.current!.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };
    w.__tesseraEdit = (id: string) => setEditing(id);
    w.__tesseraSnapAxes = (id: ID) => snapThreadToAxes(id);
    w.__tesseraFit = () => {
      const bs = Object.values(store.ws.blocks).filter(b => b.boardId === store.ui.boardId); const r = ref.current!.getBoundingClientRect();
      if (!bs.length) return animateView(DEFAULT_VIEW);
      const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
      animateView(fitView({ x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y }, r.width, r.height));
    };
    w.__tesseraZoom = (f: number) => { const r = ref.current!.getBoundingClientRect(); zoomAround(f, r.width / 2, r.height / 2); };
    w.__tesseraFocus = (id: ID) => {
      const b = store.ws.blocks[id]; const r = ref.current!.getBoundingClientRect(); if (!b) return;
      const k = Math.max(getView().k, 0.8); const to = { k, x: r.width / 2 - (b.x + b.w / 2) * k, y: r.height / 2 - (b.y + b.h / 2) * k };
      store.ui.view[b.boardId] ? animateView(to) : setView(to, b.boardId);
    };
  }, [toWorld]);

  // keyboard: space for panning, escape to leave edit
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sb = selBendRef.current, st = selThreadRef.current;
        if (sb && store.ws.threads[sb.id]) { e.preventDefault(); e.stopImmediatePropagation(); removeBend(sb.id, sb.index); return; }
        if (st && store.ws.threads[st] && !store.ui.selection.length) { e.preventDefault(); e.stopImmediatePropagation(); store.dispatch({ type: 'thread/delete', id: st }); setSelThread(null); flashToast('Connection deleted', { label: 'Undo', run: store.undo }); return; }
      }
      if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && !isTyping()) { e.preventDefault(); openMenuForSelection(); return; } if (e.code === 'Space' && !isTyping()) { setSpace(true); e.preventDefault(); } if (e.key === 'Escape') { setEditing(null); setSelThread(null); (document.activeElement as HTMLElement)?.blur?.(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  // paste capture
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping()) return;
      const files = [...(e.clipboardData?.files ?? [])]; const text = e.clipboardData?.getData('text/plain');
      if (!files.length && !text) return;
      e.preventDefault(); const c = (window as any).__tesseraCenter();
      captureInto(store.ui.boardId, c.x - 120, c.y - 60, files, files.length ? undefined : text);
    };
    document.addEventListener('paste', onPaste); return () => document.removeEventListener('paste', onPaste);
  }, []);

  // wheel: pan 1:1, ctrl/pinch zoom anchored to cursor (direct manipulation: no tween)
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-scroll]') && !e.ctrlKey) return;
      e.preventDefault(); stopMotion(); const v = getView();
      if (e.ctrlKey || e.metaKey) {
        const { x: px, y: py } = local(e.clientX, e.clientY);
        const k = clampK(v.k * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)));
        setView({ k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k });
      } else setView({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) });
    };
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // global pointer move/up while dragging (layout effect: attached before the next pointer event)
  useEffect(() => {
    if (!drag || drag.kind === 'pan') return;
    document.body.classList.add('no-select'); getSelection()?.removeAllRanges();
    return () => document.body.classList.remove('no-select');
  }, [drag !== null]); // eslint-disable-line

  useLayoutEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current!; const w = toWorld(e.clientX, e.clientY);
      if (d.kind === 'pan') {
        const samples = [...d.samples, { t: performance.now(), x: e.clientX, y: e.clientY }].slice(-6);
        setView({ ...getView(), x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy });
        setDrag({ ...d, samples });
      } else if (d.kind === 'marquee') {
        setDrag({ ...d, x1: w.x, y1: w.y });
        const r = normRect(d.x0, d.y0, w.x, w.y);
        const hit = blocks.filter(b => b.type === 'frame' ? contains(r, b) : intersects(r, b)).map(b => b.id);
        store.setUI({ selection: [...new Set([...d.base, ...hit])] });
      } else if (d.kind === 'move') {
        const dx = w.x - d.p0.x, dy = w.y - d.p0.y;
        if (!d.moved && Math.hypot(dx, dy) * getView().k < 3) return; // click tolerance
        if (!d.moved) store.checkpoint();
        const p = store.ws.blocks[d.primary]; const ps = d.start[d.primary];
        const k = getView().k; const ids = new Set(d.ids);
        let sx = ps.x + dx, sy = ps.y + dy, g: Guide[] = [];
        if (!e.altKey) {
          const near = { x: sx - 600, y: sy - 600, w: p.w + 1200, h: p.h + 1200 };
          const others = blocks.filter(b => !ids.has(b.id) && intersects(near, b));
          const s = snapRect({ x: sx, y: sy, w: p.w, h: p.h }, others, 6 / k, false); sx = s.x; sy = s.y; g = s.guides;
        }
        const ox = sx - ps.x, oy = sy - ps.y; const pos: Record<ID, Pt> = {};
        d.ids.forEach(id => (pos[id] = { x: d.start[id].x + ox, y: d.start[id].y + oy }));
        store.dispatch({ type: 'block/place', pos }, { record: false });
        // velocity tilt (deg), smoothed
        const now = performance.now(); const vx = (e.clientX - d.lastX) / Math.max(1, now - d.lastT);
        const tilt = reducedMotion() || d.ids.length > 1 ? 0 : d.tilt * 0.75 + Math.max(-4, Math.min(4, vx * 3)) * 0.25;
        // drop target: a board portal under the pointer, else a frame that will contain the primary
        const under = document.elementsFromPoint(e.clientX, e.clientY).map(el => (el as HTMLElement).closest?.('[data-block]') as HTMLElement | null).find(el => el && !ids.has(el.dataset.block!));
        const ub = under ? store.ws.blocks[under.dataset.block!] : null;
        const target = ub?.type === 'board' && !d.ids.some(id => store.ws.blocks[id]?.type === 'board' && store.ws.blocks[id].data.boardId === ub.data.boardId) ? ub.id : null;
        const pr = { x: sx, y: sy, w: p.w, h: p.h };
        const startR = { x: ps.x, y: ps.y, w: p.w, h: p.h };
        const frame = !target ? blocks.find(b => b.type === 'frame' && !ids.has(b.id) && contains(b, pr) && !contains(b, startR))?.id ?? null : null; // only frames being entered
        // off-canvas drop zones: breadcrumbs and Atlas rows ([data-drop-board])
        const zone = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-drop-board]') as HTMLElement | null;
        const zb = zone?.dataset.dropBoard ?? null;
        const board = zb && zb !== boardId && !d.ids.some(id => { const x = store.ws.blocks[id]; return x?.type === 'board' && boardPath(store.ws, zb).some(bb => bb.id === x.data.boardId); }) ? zb : null;
        markZone(board ? zone : null);
        setGuides(target || board ? [] : g);
        setDrag({ ...d, moved: true, lastX: e.clientX, lastT: now, tilt, target, frame, board, snapped: g.length > 0 });
      } else if (d.kind === 'resize') {
        if (!d.started) store.checkpoint();
        const b = store.ws.blocks[d.id]; const def = getBlockDef(b?.type);
        let nw = Math.max(def?.type === 'frame' ? 160 : 120, d.w + w.x - d.sx), nh = Math.max(60, d.h + w.y - d.sy);
        if (!e.altKey) { nw = Math.round((b.x + nw) / GRID) * GRID - b.x; nh = Math.round((b.y + nh) / GRID) * GRID - b.y; }
        if (d.ratio && !e.shiftKey) nh = Math.round(nw * d.ratio) + IMAGE_CAPTION_H;
        store.dispatch({ type: 'block/update', id: d.id, patch: def?.autoHeight ? { w: Math.round(nw) } : { w: Math.round(nw), h: Math.round(nh) } }, { record: false });
        if (!d.started) setDrag({ ...d, started: true });
      } else if (d.kind === 'bend') {
        const t = store.ws.threads[d.id]; const a = t && store.ws.blocks[t.from], b = t && store.ws.blocks[t.to];
        if (!t || !a || !b) return;
        const k = getView().k;
        if (!d.started && Math.hypot(w.x - d.p0.x, w.y - d.p0.y) * k < 3) return; // a click just selects the line
        const ca = center(a), cb = center(b); const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
        let pts = threadPoints(t).map(o => ({ ...o }));
        let index = d.index;
        if (!d.started) {
          store.checkpoint();
          if (d.insert) {
            // pressing on the line itself adds a new bend exactly where it was grabbed
            const g = threadPath(a, b, { type: t.style, points: pts });
            index = pts.length ? insertIndex(g.route, d.p0) : 0;
            pts.splice(index, 0, { x: d.p0.x - mid.x, y: d.p0.y - mid.y });
          } else if (!pts.length) { pts = [{ x: w.x - mid.x, y: w.y - mid.y }]; index = 0; } // first drag of the automatic curve
          setDrag({ ...d, started: true, index, insert: false });
        }
        let x = w.x, y = w.y; const gs: Guide[] = [];
        let snap: { x?: number; y?: number; line?: boolean } = {};
        if (!e.altKey) {
          // neighbours of this bend: the previous/next bend, or the block centre at either end
          const abs = pts.map(o => ({ x: mid.x + o.x, y: mid.y + o.y }));
          const prev = index === 0 ? ca : abs[index - 1], next = index === pts.length - 1 ? cb : abs[index + 1];
          // hysteresis: a snap engages inside 8px but only lets go beyond 14px, so it never flickers at the edge
          const catchR = 8 / k, releaseR = 14 / k, was = snapRef.current;
          const pick = (v: number, cands: number[], held?: number) =>
            held !== undefined && cands.includes(held) && Math.abs(v - held) < releaseR ? held
              : cands.map(c => ({ c, d: Math.abs(v - c) })).filter(o => o.d < catchR).sort((p, q) => p.d - q.d)[0]?.c;
          const sx = pick(x, [prev.x, next.x], was.x), sy = pick(y, [prev.y, next.y], was.y);
          if (sx !== undefined) { x = sx; snap.x = sx; const n = sx === prev.x ? prev : next; gs.push({ axis: 'x', at: x, from: Math.min(y, n.y) - 14 / k, to: Math.max(y, n.y) + 14 / k }); }
          if (sy !== undefined) { y = sy; snap.y = sy; const n = sy === prev.y ? prev : next; gs.push({ axis: 'y', at: y, from: Math.min(x, n.x) - 14 / k, to: Math.max(x, n.x) + 14 / k }); }
          if (sx === undefined && sy === undefined) {
            // otherwise: a bend lying almost on the line between its neighbours straightens out (same hysteresis)
            const lx = next.x - prev.x, ly = next.y - prev.y, len = Math.hypot(lx, ly) || 1;
            const perp = ((x - prev.x) * -ly + (y - prev.y) * lx) / len;
            if (Math.abs(perp) < (was.line ? releaseR : catchR * 0.85)) {
              const along = ((x - prev.x) * lx + (y - prev.y) * ly) / len; x = prev.x + (lx / len) * along; y = prev.y + (ly / len) * along; snap.line = true;
            }
          }
        }
        snapRef.current = snap;
        setGuides(gs);
        pts[index] = { x: x - mid.x, y: y - mid.y }; // exact: rounding against a half-pixel midpoint would knock snapped legs off-axis
        store.dispatch({ type: 'thread/update', id: d.id, patch: { points: pts, bend: undefined } }, { record: false });
      } else if (d.kind === 'rewire') {
        const t = store.ws.threads[d.id]; const fixed = t ? (d.end === 'from' ? t.to : t.from) : null;
        const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-block]') as HTMLElement | null;
        const over = el && el.dataset.block !== fixed ? el.dataset.block! : null;
        setDrag({ ...d, x: w.x, y: w.y, over });
      } else if (d.kind === 'thread') {
        const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-block]') as HTMLElement | null;
        const over = el && el.dataset.block !== d.from ? el.dataset.block! : null;
        setDrag({ ...d, x: w.x, y: w.y, over });
      }
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current!;
      if (d.kind === 'pan') {
        const s = d.samples; const a = s[0], b = s[s.length - 1];
        if (s.length > 1 && performance.now() - b.t < 60) glide((b.x - a.x) / Math.max(1, b.t - a.t), (b.y - a.y) / Math.max(1, b.t - a.t));
      }
      if (d.kind === 'rewire' && d.over) {
        const t = store.ws.threads[d.id];
        if (t) {
          const from = d.end === 'from' ? d.over : t.from, to = d.end === 'to' ? d.over : t.to;
          const dup = Object.values(store.ws.threads).some(o => o.id !== t.id && ((o.from === from && o.to === to) || (o.from === to && o.to === from)));
          if (dup) flashToast('Those blocks are already connected');
          else store.dispatch({ type: 'thread/update', id: t.id, patch: { from, to, bend: undefined, points: undefined } });
        }
      }
      if (d.kind === 'thread') {
        const to = d.over;
        if (to && !threads.some(t => (t.from === d.from && t.to === to) || (t.from === to && t.to === d.from)))
          store.dispatch({ type: 'thread/add', thread: { id: uid(), boardId, from: d.from, to } });
      }
      markZone(null);
      if (d.kind === 'move' && d.moved) {
        if (d.target) dropIntoBoard(d.ids, store.ws.blocks[d.target].data.boardId, d.target);
        else if (d.board) dropIntoBoard(d.ids, d.board, null);
        else if (!e.altKey) {
          // settle onto the grid: the CSS left/top transition animates the last few px once the lift is released
          const p = store.ws.blocks[d.primary];
          if (p) {
            const gx = d.snapped && guidesRef.current.some(g => g.axis === 'x') ? p.x : Math.round(p.x / GRID) * GRID;
            const gy = d.snapped && guidesRef.current.some(g => g.axis === 'y') ? p.y : Math.round(p.y / GRID) * GRID;
            const ox = gx - p.x, oy = gy - p.y;
            if (ox || oy) { const pos: Record<ID, Pt> = {}; d.ids.forEach(id => { const b = store.ws.blocks[id]; if (b) pos[id] = { x: b.x + ox, y: b.y + oy }; }); store.dispatch({ type: 'block/place', pos }, { record: false }); }
          }
        }
      }
      if (d.kind === 'bend' && !d.started) setSelBend(d.insert ? null : threadPoints(store.ws.threads[d.id] ?? {}).length ? { id: d.id, index: d.index } : null);
      if (d.kind === 'bend' && d.started) setSelBend({ id: d.id, index: d.index >= 0 ? d.index : 0 });
      setGuides([]); setDrag(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [drag !== null, boardId]); // eslint-disable-line

  /** Animate blocks shrinking into the portal, then move them into its board (same undo step as the drag). */
  const dropIntoBoard = (ids: ID[], child: ID, portalId: ID | null) => {
    const portal = portalId ? store.ws.blocks[portalId] : null;
    const moving = ids.map(id => store.ws.blocks[id]).filter(Boolean);
    const inner = Object.values(store.ws.blocks).filter(b => b.boardId === child);
    const minX = Math.min(...moving.map(b => b.x)), minY = Math.min(...moving.map(b => b.y));
    const baseY = inner.length ? Math.max(...inner.map(b => b.y + b.h)) + 48 : 40;
    const pos: Record<ID, Pt> = {}; moving.forEach(b => (pos[b.id] = { x: b.x - minX + 40, y: b.y - minY + baseY }));
    const commit = () => {
      store.dispatch({ type: 'block/reparent', ids, boardId: child, pos }, { record: false });
      setAbsorb(null);
      if (portalId) { setReceived(portalId); setTimeout(() => setReceived(r => (r === portalId ? null : r)), 450); }
      else flashToast(`Moved ${ids.length} block${ids.length > 1 ? 's' : ''} to “${store.ws.boards[child]?.title}”`);
    };
    if (reducedMotion()) return commit();
    // into a portal: shrink toward it; to a breadcrumb/atlas row: shrink in place
    setAbsorb({ ids: new Set(ids), to: portal ? center(portal) : center(moving[0]), portal: portalId ?? '' });
    setTimeout(commit, 220);
  };

  const onBgDown = (e: React.PointerEvent) => {
    if (dragRef.current?.kind === 'thread') return; // click-to-connect: the window pointerup finishes it
    setSelBend(null);
    if (!isBackground(e)) return;
    stopMotion();
    (document.activeElement as HTMLElement)?.blur?.();
    setEditing(null); setSelThread(null);
    if (space || e.button === 1) { e.preventDefault(); startPan(e); return; }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    const base = e.shiftKey ? selection : [];
    if (!e.shiftKey) store.setUI({ selection: [] });
    setDrag({ kind: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y, base });
  };
  const startPan = (e: React.PointerEvent) => { const v = getView(); setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] }); };

  const onBgDouble = (e: React.MouseEvent) => {
    if (!isBackground(e)) return;
    const w = toWorld(e.clientX, e.clientY); const d = getBlockDef('note')!.defaults();
    const b = makeBlock(boardId, 'note', Math.round((w.x - 20) / GRID) * GRID, Math.round((w.y - 20) / GRID) * GRID, d.w, d.h, d.data);
    store.dispatch({ type: 'block/add', blocks: [b] }); store.setUI({ selection: [b.id] }); setEditing(b.id);
  };

  const onBlockDown = (e: React.PointerEvent, b: Block) => {
    if (dragRef.current?.kind === 'thread') { e.stopPropagation(); return; }
    const t = e.target as HTMLElement;
    stopMotion();
    if (e.button === 1 || space) { e.preventDefault(); e.stopPropagation(); startPan(e); return; }
    if (e.button !== 0) return;
    if (t.closest('[data-nodrag]')) { e.stopPropagation(); return; }
    e.stopPropagation(); setSelThread(null);
    if (editing && editing !== b.id) { (document.activeElement as HTMLElement)?.blur?.(); setEditing(null); }
    const w = toWorld(e.clientX, e.clientY);
    if (t.closest('[data-resize]')) {
      const ratio = b.type === 'image' ? (b.h - IMAGE_CAPTION_H) / b.w : null;
      setDrag({ kind: 'resize', id: b.id, sx: w.x, sy: w.y, w: b.w, h: b.h, ratio, started: false }); return;
    }
    if (t.closest('[data-handle]')) { setDrag({ kind: 'thread', from: b.id, x: w.x, y: w.y, over: null }); return; }
    let sel = selection;
    if (e.shiftKey) sel = selection.includes(b.id) ? selection.filter(i => i !== b.id) : [...selection, b.id];
    else if (!selection.includes(b.id)) sel = [b.id];
    store.setUI({ selection: sel });
    if (b.type !== 'frame' && b.z < nextZ() - 1) store.dispatch({ type: 'block/update', id: b.id, patch: { z: nextZ() } }, { record: false });
    if (editing === b.id || !sel.includes(b.id)) return;
    // frames carry contained blocks
    const ids = new Set(sel);
    sel.forEach(id => { const f = allBlocks[id]; if (f?.type === 'frame') blocks.forEach(o => o.id !== f.id && contains(f, o) && ids.add(o.id)); });
    const start: Record<ID, Pt> = {}; ids.forEach(id => { const x = store.ws.blocks[id]; if (x) start[id] = { x: x.x, y: x.y }; });
    setDrag({ kind: 'move', ids: [...ids], primary: b.id, start, p0: w, moved: false, lastX: e.clientX, lastT: performance.now(), tilt: 0, target: null, frame: null, board: null, snapped: false });
  };

  /** Click-to-connect: a thread follows the pointer until the next click on a block (or empty canvas to cancel). */
  const startThread = (from: ID) => {
    const b = store.ws.blocks[from]; if (!b) return;
    setDrag({ kind: 'thread', from, x: b.x + b.w / 2, y: b.y + b.h / 2, over: null });
    flashToast('Click a block to connect to it');
  };
  const editBlock = (id: ID) => { store.setUI({ selection: [id] }); setEditing(id); };
  const onContext = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    // keep the native menu (spellcheck, copy/paste) inside text being edited
    if (t.closest('input,textarea,[contenteditable="true"]')) return;
    e.preventDefault();
    if (dragRef.current) return;
    const th = (t.closest('[data-thread]') as Element | null)?.getAttribute('data-thread');
    const bi = (t.closest('[data-bend-index]') as Element | null)?.getAttribute('data-bend-index');
    if (th && bi != null) {
      const i = +bi; setSelThread(th); setSelBend({ id: th, index: i });
      const n = threadPoints(store.ws.threads[th] ?? {}).length;
      contextMenu.open(e.clientX, e.clientY, [
        { label: 'Remove this bend', icon: 'trash', kbd: 'Del', danger: true, run: () => { removeBend(th, i); setSelBend(null); } },
        ...(n > 1 ? [{ label: `Remove all ${n} bends`, icon: 'reset', run: () => { store.dispatch({ type: 'thread/update', id: th, patch: { points: undefined, bend: undefined } }); setSelBend(null); } }] : []),
        { separator: true },
        { label: 'Snap line to horizontal / vertical', icon: 'axes', run: () => { snapThreadToAxes(th); setSelBend(null); } },
      ], `Bend ${i + 1} of ${n}`);
      return;
    }
    if (th) { setSelThread(null); contextMenu.open(e.clientX, e.clientY, threadMenu(th, id => { setSelThread(id); setTimeout(() => document.querySelector<HTMLInputElement>('.thread-pop input')?.focus()); })); return; }
    const bid = (t.closest('[data-block]') as HTMLElement | null)?.dataset.block;
    if (bid) {
      const ids = store.ui.selection.includes(bid) ? store.ui.selection : [bid];
      if (ids !== store.ui.selection) store.setUI({ selection: ids });
      setEditing(null);
      contextMenu.open(e.clientX, e.clientY, blockMenu(ids, editBlock, startThread));
      return;
    }
    contextMenu.open(e.clientX, e.clientY, canvasMenu(toWorld(e.clientX, e.clientY), editBlock));
  };
  const openMenuForSelection = () => {
    const ids = store.ui.selection; if (!ids.length) return;
    const el = document.querySelector(`[data-block="${ids[0]}"]`); if (!el) return;
    const r = el.getBoundingClientRect();
    contextMenu.open(r.left + Math.min(24, r.width / 2), r.top + Math.min(24, r.height / 2), blockMenu(ids, editBlock, startThread));
  };

  const onBlockDouble = (e: React.MouseEvent, b: Block) => {
    if ((e.target as HTMLElement).closest('[data-nodrag]')) return;
    e.stopPropagation();
    if (b.type === 'board' && !(e.target as HTMLElement).closest('.portal-foot')) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      store.openBoard(b.data.boardId, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    } else setEditing(b.id);
  };

  // board transition origin, in canvas-local px — computed once per navigation so it can't shift mid-animation
  const prevBoard = useRef<ID>(boardId);
  const originRef = useRef<{ n: number; o: string }>({ n: -1, o: '50% 50%' });
  if (transition && originRef.current.n !== transition.n) {
    let o = '50% 50%';
    const r = ref.current?.getBoundingClientRect();
    if (r && transition.dir === 'in') o = `${transition.ox - r.left}px ${transition.oy - r.top}px`;
    else {
      const prev = blocks.find(b => b.type === 'board' && b.data.boardId === prevBoard.current);
      if (prev) o = `${view.x + (prev.x + prev.w / 2) * view.k}px ${view.y + (prev.y + prev.h / 2) * view.k}px`;
    }
    originRef.current = { n: transition.n, o };
  }
  const origin = originRef.current.o;
  useEffect(() => { prevBoard.current = boardId; }, [boardId]);

  const map = allBlocks;
  const marquee = drag?.kind === 'marquee' ? normRect(drag.x0, drag.y0, drag.x1, drag.y1) : null;
  const threadFrom = drag?.kind === 'thread' ? map[drag.from] : null;
  const st = selThread ? allThreads[selThread] : null;
  // keep the connection popover inside the canvas (it lives in world space, so shifts are divided by zoom)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.thread-pop'); if (!el || !ref.current) return;
    el.style.setProperty('--dx', '0px');
    const r = el.getBoundingClientRect(), c = ref.current.getBoundingClientRect(), pad = 12;
    const shift = r.right > c.right - pad ? c.right - pad - r.right : r.left < c.left + pad ? c.left + pad - r.left : 0;
    if (shift) el.style.setProperty('--dx', `${shift / view.k}px`);
  });
  const moving = drag?.kind === 'move' ? new Set(drag.ids) : null;
  const resizing = drag?.kind === 'resize' ? map[drag.id] : null;

  return <div ref={ref} className={'canvas' + (space ? ' panning' : '') + (drag?.kind === 'pan' ? ' grabbing' : '') + (moving ? ' dragging' : '') + (drag?.kind === 'bend' && drag.started ? ' bending' : '')}
    style={{ backgroundPosition: `${view.x}px ${view.y}px, ${view.x}px ${view.y}px`, backgroundSize: `${24 * view.k}px ${24 * view.k}px, ${120 * view.k}px ${120 * view.k}px`, ['--grid-fade' as any]: view.k < 0.45 ? 0 : 1 }}
    onPointerDown={onBgDown} onDoubleClick={onBgDouble} onContextMenu={onContext}
    onDragOver={e => e.preventDefault()}
    onDrop={e => { e.preventDefault(); const w = toWorld(e.clientX, e.clientY); const files = [...e.dataTransfer.files]; captureInto(boardId, w.x, w.y, files, files.length ? undefined : e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')); }}>
    <div key={transition?.n ?? 0} className={'scene' + (transition ? ' enter-' + transition.dir : '')} style={{ transformOrigin: origin }}>
      <div className="world" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.k})`, ['--tilt' as any]: `${drag?.kind === 'move' ? drag.tilt : 0}deg`, ['--lift' as any]: drag?.kind === 'move' && drag.ids.length > 1 ? 1 : 1.025 }}>
        <svg className="threads" width="1" height="1">
          <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="arrowhead" /></marker></defs>
          {threads.map(t => { const a = map[t.from], b = map[t.to]; if (!a || !b) return null;
            const g = threadPath(a, b, { type: t.style, points: threadPoints(t) }); const arrows = t.arrows ?? 'end';
            const sel = selThread === t.id; const rewiring = drag?.kind === 'rewire' && drag.id === t.id;
            const bending = drag?.kind === 'bend' && drag.id === t.id && drag.started;
            const hr = 5.5 / view.k, er = 4.5 / view.k;
            const grab = (e: React.PointerEvent, index: number, insert: boolean) => {
              if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); // no native text selection while dragging
              (document.activeElement as HTMLElement | null)?.blur?.(); setSelThread(t.id); store.setUI({ selection: [] });
              snapRef.current = {};
              setDrag({ kind: 'bend', id: t.id, index, insert, started: false, p0: toWorld(e.clientX, e.clientY) });
            };
            return <g key={t.id} data-thread={t.id} className={'thread' + (sel ? ' sel' : '') + (selBend?.id === t.id ? ' has-pick' : '') + (rewiring ? ' rewiring' : '') + (bending ? ' bending' : '') + (moving && (moving.has(t.from) || moving.has(t.to)) ? ' live' : '')}
              onPointerDown={e => grab(e, -1, true)}>
              <path d={g.d} className="hit"><title>Drag the line to bend it here</title></path>
              <path d={g.d} className="line" markerEnd={arrows !== 'none' ? 'url(#arrow)' : undefined} markerStart={arrows === 'both' ? 'url(#arrow)' : undefined} />
              {t.label && <text x={g.anchor.x} y={g.anchor.y - 10 / view.k} className="thread-label" style={{ fontSize: 11 / Math.max(view.k, .6) }}>{t.label}</text>}
              {g.ghost && <circle className="bend-handle auto" cx={g.ghost.x} cy={g.ghost.y} r={hr} onPointerDown={e => grab(e, 0, false)}><title>Drag to bend</title></circle>}
              {g.points.map((pt, i) => { const picked = selBend?.id === t.id && selBend.index === i;
                const grabbed = bending && drag?.kind === 'bend' && drag.index === i;
                return <circle key={i} className={'bend-handle' + (picked ? ' picked' : '') + (grabbed ? ' grabbed' : '')} cx={pt.x} cy={pt.y} r={picked ? hr * 1.25 : hr} data-bend-index={i}
                  onPointerDown={e => grab(e, i, false)} onDoubleClick={e => { e.stopPropagation(); removeBend(t.id, i); }}>
                  <title>Drag to move · click then Delete, or double-click, to remove this bend</title></circle>; })}
              {sel && !rewiring && (['from', 'to'] as const).map(end => { const pt = end === 'from' ? g.start : g.end;
                return <circle key={end} className="thread-end" cx={pt.x} cy={pt.y} r={er}
                  onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); const w = toWorld(e.clientX, e.clientY); setDrag({ kind: 'rewire', id: t.id, end, x: w.x, y: w.y, over: null }); }}>
                  <title>Drag onto another block to reconnect</title></circle>; })}
            </g>; })}
          {drag?.kind === 'rewire' && (() => { const t = allThreads[drag.id]; const fixed = t && map[drag.end === 'from' ? t.to : t.from]; if (!fixed) return null;
            return <line className="thread-temp" x1={fixed.x + fixed.w / 2} y1={fixed.y + fixed.h / 2} x2={drag.x} y2={drag.y} />; })()}
          {threadFrom && drag?.kind === 'thread' && <line className="thread-temp" x1={threadFrom.x + threadFrom.w / 2} y1={threadFrom.y + threadFrom.h / 2} x2={drag.x} y2={drag.y} />}
          {guides.map((g, i) => g.axis === 'x'
            ? <line key={i} className="guide" x1={g.at} x2={g.at} y1={g.from} y2={g.to} />
            : <line key={i} className="guide" y1={g.at} y2={g.at} x1={g.from} x2={g.to} />)}
        </svg>
        {blocks.map(b => {
          const ab = absorb?.ids.has(b.id);
          return <BlockView key={b.id} block={b} selected={selection.includes(b.id)} editing={editing === b.id}
            state={(moving?.has(b.id) ? ' lifting' : '') + (b.id === (drag?.kind === 'move' ? drag.target : null) ? ' drop-target' : '') + (b.id === (drag?.kind === 'move' ? drag.frame : null) ? ' frame-target' : '')
              + ((drag?.kind === 'thread' || drag?.kind === 'rewire') && drag.over === b.id ? ' link-target' : '') + (resizing?.id === b.id ? ' resizing' : '') + (ab ? ' absorbing' : '') + (received === b.id ? ' received' : '')}
            absorbTo={ab ? { x: absorb!.to.x - (b.x + b.w / 2), y: absorb!.to.y - (b.y + b.h / 2) } : undefined}
            onPointerDown={e => onBlockDown(e, b)} onDoubleClick={e => onBlockDouble(e, b)} />;
        })}
        {drag?.kind === 'move' && drag.target && map[drag.target] && <div className="drop-chip" style={{ left: map[drag.target].x + map[drag.target].w / 2, top: map[drag.target].y - 10 }}>Move into “{store.ws.boards[map[drag.target].data.boardId]?.title}”</div>}
        {resizing && <div className="size-chip mono" style={{ left: resizing.x + resizing.w, top: resizing.y + resizing.h + 8 }}>{resizing.w} × {resizing.h}</div>}
        {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        {st && map[st.from] && map[st.to] && (() => { const g = threadPath(map[st.from], map[st.to], { type: st.style, points: threadPoints(st) }); const bends = threadPoints(st).length;
          const setT = (patch: Parameters<typeof threadPatch>[1]) => threadPatch(st.id, patch);
          const style = st.style ?? 'curve', arrows = st.arrows ?? 'end';
          // keep the popover on the outside of the bend so it never covers the line
          const ca = center(map[st.from]), cb = center(map[st.to]);
          const above = g.anchor.y < (ca.y + cb.y) / 2 - 2;
          return <div className={'thread-pop' + (above ? ' above' : '') + (drag ? ' hushed' : '')} aria-hidden={drag ? true : undefined} style={{ left: g.anchor.x, top: g.anchor.y, ['--k' as any]: view.k }} onPointerDown={e => e.stopPropagation()}>
            <input data-nodrag placeholder="Label" defaultValue={st.label ?? ''} key={st.id} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
              onBlur={e => e.target.value !== (st.label ?? '') && store.dispatch({ type: 'thread/update', id: st.id, label: e.target.value })} />
            <span className="tp-sep" />
            <div className="tp-seg" role="radiogroup" aria-label="Line style">
              {(['curve', 'straight', 'elbow'] as const).map(v => <button key={v} role="radio" aria-checked={style === v} className={style === v ? 'on' : ''} title={v === 'curve' ? 'Curved' : v === 'straight' ? 'Straight' : 'Right angles'} aria-label={v}
                onClick={() => setT({ style: v === 'curve' ? undefined : v })}><Icon name={'line-' + v} size={16} /></button>)}
            </div>
            <button className="tp-btn" title={arrows === 'end' ? 'Arrow at end' : arrows === 'both' ? 'Arrows at both ends' : 'No arrows'} aria-label="Arrowheads"
              onClick={() => setT({ arrows: arrows === 'end' ? 'both' : arrows === 'both' ? 'none' : undefined })}><Icon name={'arrow-' + arrows} size={16} /></button>
            <button className="tp-btn" title="Snap to horizontal / vertical" aria-label="Snap to axes" onClick={() => { snapThreadToAxes(st.id); setSelBend(null); }}><Icon name="axes" size={16} /></button>
            {selBend?.id === st.id && <button className="tp-btn danger" title="Remove the selected bend (Delete)" aria-label="Remove selected bend" onClick={() => { removeBend(st.id, selBend.index); setSelBend(null); }}><Icon name="bend-remove" size={16} /></button>}
            {bends > 0 && <button className="tp-btn" title={`Remove ${bends === 1 ? 'the bend' : `all ${bends} bends`}`} aria-label="Reset shape" onClick={() => setT({ bend: undefined, points: undefined })}><Icon name="reset" size={16} /></button>}
            <span className="tp-sep" />
            <button className="tp-btn danger" title="Delete connection" aria-label="Delete connection" onClick={() => { store.dispatch({ type: 'thread/delete', id: st.id }); setSelThread(null); flashToast('Connection deleted', { label: 'Undo', run: store.undo }); }}><Icon name="trash" size={16} /></button>
          </div>; })()}
      </div>
    </div>
    {!blocks.length && <div className="empty-state">
      <svg className="empty-mosaic" width="72" height="72" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="9" height="9" rx="2" className="m-ink" /><rect x="13" y="2" width="9" height="5" rx="1.6" /><rect x="13" y="9" width="9" height="13" rx="1.6" /><rect x="2" y="13" width="9" height="9" rx="1.6" /></svg>
      <h2 className="serif">Nothing on this board yet</h2>
      <p>Double-click anywhere to write a note, drop images or files here, or paste a link.</p>
      <div className="empty-actions">
        <button className="btn primary" onClick={() => (window as any).__tesseraAdd?.('note')}><Icon name="note" size={16} />Write a note<kbd>N</kbd></button>
        <button className="btn" onClick={() => (window as any).__tesseraAdd?.('board')}><Icon name="board" size={16} />Add a board<kbd>B</kbd></button>
      </div>
    </div>}
    <div className="zoom-ctl" role="group" aria-label="Zoom">
      <button onClick={() => (window as any).__tesseraZoom(1 / 1.25)} title="Zoom out (−)" aria-label="Zoom out"><Icon name="minus" size={16} /></button>
      <button className="zoom-pct" onClick={() => animateView(DEFAULT_VIEW)} title="Reset to 100% (Ctrl 0)" aria-label="Reset zoom">{Math.round(view.k * 100)}%</button>
      <button onClick={() => (window as any).__tesseraZoom(1.25)} title="Zoom in (+)" aria-label="Zoom in"><Icon name="plus" size={16} /></button>
      <span className="zoom-sep" />
      <button onClick={() => (window as any).__tesseraFit()} title="Fit content (Shift 1)" aria-label="Zoom to fit"><Icon name="fit" size={16} /></button>
    </div>
  </div>;
}

/** Remove one bend from a connection (one undo step). */
export function removeBend(id: ID, index: number) {
  const t = store.ws.threads[id]; if (!t) return;
  const pts = threadPoints(t); if (index < 0 || index >= pts.length) return;
  const rest = pts.filter((_, j) => j !== index);
  store.dispatch({ type: 'thread/update', id, patch: { points: rest.length ? rest : undefined, bend: undefined } });
  flashToast(rest.length ? `Bend removed · ${rest.length} left` : 'Bend removed', { label: 'Undo', run: store.undo });
}
/** Square every leg of a connection to the horizontal/vertical axes (one undo step). */
export function snapThreadToAxes(id: ID) {
  const t = store.ws.threads[id]; const a = t && store.ws.blocks[t.from], b = t && store.ws.blocks[t.to]; if (!t || !a || !b) return;
  const pts = alignToAxes(center(a), center(b), threadPoints(t));
  store.dispatch({ type: 'thread/update', id, patch: { points: pts.length ? pts : undefined, bend: undefined, style: t.style === 'curve' || !t.style ? 'straight' : t.style } });
}

/** Shape/style change on a connection, as one undo step. */
export function threadPatch(id: ID, patch: { style?: 'curve' | 'straight' | 'elbow'; arrows?: 'end' | 'both' | 'none'; bend?: { x: number; y: number }; points?: { x: number; y: number }[] }) {
  store.dispatch({ type: 'thread/update', id, patch });
}

let zoneEl: HTMLElement | null = null;
/** Highlight the off-canvas drop zone (breadcrumb / Atlas row) under the pointer. */
function markZone(el: HTMLElement | null) { if (zoneEl === el) return; zoneEl?.classList.remove('drop-hover'); el?.classList.add('drop-hover'); zoneEl = el; }
let lastToast: HTMLElement | null = null;
/** Transient status message; an optional action (e.g. Undo) keeps it up longer and is clickable. */
export function flashToast(text: string, action?: { label: string; run: () => void }) {
  lastToast?.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
  const span = document.createElement('span'); span.textContent = text; t.appendChild(span);
  const life = action ? 5200 : 1800;
  let timer = 0;
  const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 400); };
  if (action) {
    const b = document.createElement('button'); b.className = 'toast-action'; b.textContent = action.label;
    b.onclick = () => { clearTimeout(timer); action.run(); dismiss(); };
    t.appendChild(b);
    t.onpointerenter = () => clearTimeout(timer);
    t.onpointerleave = () => { timer = window.setTimeout(dismiss, 1800); };
  }
  document.body.appendChild(t); lastToast = t;
  timer = window.setTimeout(dismiss, life);
}

const isBackground = (e: React.SyntheticEvent) => e.target === e.currentTarget || /\b(world|scene)\b/.test((e.target as HTMLElement).className);

export function isTyping() {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}
