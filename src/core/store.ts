import { useSyncExternalStore } from 'react';
import { Workspace, Block, Board, Thread, ID, uid, emptyWorkspace } from './model';
import { loadWorkspace, saveWorkspace, saveWorkspaceNow, deleteBlob } from './persistence';
import { bus } from './registry';

export type Action =
  | { type: 'board/create'; board: Board }
  | { type: 'board/rename'; id: ID; title: string }
  | { type: 'board/delete'; id: ID }
  | { type: 'block/add'; blocks: Block[] }
  | { type: 'block/update'; id: ID; patch: Partial<Omit<Block, 'data'>>; data?: Record<string, any> }
  | { type: 'block/move'; ids: ID[]; dx: number; dy: number }
  | { type: 'block/place'; pos: Record<ID, { x: number; y: number }> }
  | { type: 'block/reparent'; ids: ID[]; boardId: ID; pos: Record<ID, { x: number; y: number }> }
  | { type: 'block/delete'; ids: ID[] }
  | { type: 'thread/add'; thread: Thread }
  | { type: 'thread/update'; id: ID; label: string }
  | { type: 'thread/delete'; id: ID }
  | { type: 'ws/replace'; ws: Workspace };

function descendants(ws: Workspace, id: ID): ID[] {
  const out = [id];
  for (let i = 0; i < out.length; i++)
    for (const b of Object.values(ws.boards)) if (b.parentId === out[i]) out.push(b.id);
  return out;
}

function removeBlocks(ws: Workspace, ids: Set<ID>): Workspace {
  const blocks = { ...ws.blocks }; let boards = ws.boards;
  const boardKill = new Set<ID>();
  ids.forEach(id => {
    const b = blocks[id]; if (!b) return;
    if (b.type === 'board' && b.data.boardId) descendants(ws, b.data.boardId).forEach(x => boardKill.add(x));
    delete blocks[id];
  });
  if (boardKill.size) {
    boards = { ...boards }; boardKill.forEach(id => delete boards[id]);
    for (const b of Object.values(blocks)) if (boardKill.has(b.boardId)) { ids.add(b.id); delete blocks[b.id]; }
  }
  const threads: Record<ID, Thread> = {};
  for (const t of Object.values(ws.threads)) if (!ids.has(t.from) && !ids.has(t.to) && !boardKill.has(t.boardId)) threads[t.id] = t;
  return { ...ws, blocks, boards, threads };
}

export function reduce(ws: Workspace, a: Action): Workspace {
  switch (a.type) {
    case 'board/create': return { ...ws, boards: { ...ws.boards, [a.board.id]: a.board } };
    case 'board/rename': return ws.boards[a.id] ? { ...ws, boards: { ...ws.boards, [a.id]: { ...ws.boards[a.id], title: a.title } } } : ws;
    case 'board/delete': {
      if (a.id === ws.rootId) return ws;
      const portals = Object.values(ws.blocks).filter(b => b.type === 'board' && b.data.boardId === a.id).map(b => b.id);
      return removeBlocks(ws, new Set(portals));
    }
    case 'block/add': { const blocks = { ...ws.blocks }; a.blocks.forEach(b => (blocks[b.id] = b)); return { ...ws, blocks }; }
    case 'block/update': {
      const b = ws.blocks[a.id]; if (!b) return ws;
      return { ...ws, blocks: { ...ws.blocks, [a.id]: { ...b, ...a.patch, data: a.data ? { ...b.data, ...a.data } : b.data } } };
    }
    case 'block/move': {
      const blocks = { ...ws.blocks };
      a.ids.forEach(id => { const b = blocks[id]; if (b) blocks[id] = { ...b, x: b.x + a.dx, y: b.y + a.dy }; });
      return { ...ws, blocks };
    }
    case 'block/place': {
      const blocks = { ...ws.blocks };
      for (const id in a.pos) { const b = blocks[id]; if (b) blocks[id] = { ...b, x: a.pos[id].x, y: a.pos[id].y }; }
      return { ...ws, blocks };
    }
    case 'block/reparent': {
      if (!ws.boards[a.boardId]) return ws;
      const blocks = { ...ws.blocks }; let boards = ws.boards;
      const moving = new Set(a.ids);
      for (const id of a.ids) {
        const b = blocks[id]; if (!b) continue;
        if (b.type === 'board') {
          // refuse cycles: target must not be inside the moved board
          if (descendants(ws, b.data.boardId).includes(a.boardId)) { moving.delete(id); continue; }
          boards = { ...boards, [b.data.boardId]: { ...boards[b.data.boardId], parentId: a.boardId } };
        }
        blocks[id] = { ...b, boardId: a.boardId, ...(a.pos[id] ?? {}) };
      }
      const threads: Record<ID, Thread> = {};
      for (const t of Object.values(ws.threads)) if (moving.has(t.from) === moving.has(t.to)) threads[t.id] = moving.has(t.from) ? { ...t, boardId: a.boardId } : t;
      return { ...ws, blocks, boards, threads };
    }
    case 'block/delete': return removeBlocks(ws, new Set(a.ids));
    case 'thread/add': return { ...ws, threads: { ...ws.threads, [a.thread.id]: a.thread } };
    case 'thread/update': return ws.threads[a.id] ? { ...ws, threads: { ...ws.threads, [a.id]: { ...ws.threads[a.id], label: a.label } } } : ws;
    case 'thread/delete': { const threads = { ...ws.threads }; delete threads[a.id]; return { ...ws, threads }; }
    case 'ws/replace': return a.ws;
  }
}

// ---------- container ----------
export interface UIState { transition?: { dir: 'in' | 'out'; ox: number; oy: number; n: number }; boardId: ID; selection: ID[]; view: Record<ID, { x: number; y: number; k: number }>; saved: 'saved' | 'saving' | 'error'; }

let ws: Workspace = loadWorkspace() ?? seed();
let ui: UIState = { boardId: ws.rootId, selection: [], view: {}, saved: 'saved' };
const past: Workspace[] = []; const future: Workspace[] = [];
const subs = new Set<() => void>();
const notify = () => subs.forEach(f => f());
let saveTimer: number | undefined;
/** ids created this session that should play their entry animation once */
export const fresh = new Set<ID>();

function scheduleSave() {
  ui = { ...ui, saved: 'saving' };
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const snapshot = ws; const ok = await saveWorkspace(snapshot);
    if (snapshot === ws) ui = { ...ui, saved: ok ? 'saved' : 'error' };
    gcBlobs(); notify();
  }, 400);
}
/** Flush pending changes immediately (window closing). */
export function flushSave() { if (ui.saved !== 'saved') { clearTimeout(saveTimer); saveWorkspaceNow(ws); ui = { ...ui, saved: 'saved' }; } }
if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => flushSave());
let knownBlobs = new Set<string>();
function gcBlobs() {
  const live = new Set(Object.values(ws.blocks).map(b => b.data.blobId).filter(Boolean));
  // only delete blobs not referenced by any snapshot in history either
  [...past, ...future].forEach(s => Object.values(s.blocks).forEach(b => b.data.blobId && live.add(b.data.blobId)));
  knownBlobs.forEach(id => { if (!live.has(id)) { deleteBlob(id).catch(() => {}); knownBlobs.delete(id); } });
  live.forEach(id => knownBlobs.add(id));
}

export const store = {
  get ws() { return ws; },
  get ui() { return ui; },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  /** Save an undo point. Call before a burst of non-recorded dispatches (e.g. drag). */
  checkpoint() { past.push(ws); if (past.length > 200) past.shift(); future.length = 0; },
  dispatch(a: Action, opts: { record?: boolean } = {}) {
    const next = reduce(ws, a);
    if (next === ws) return;
    if (opts.record !== false) store.checkpoint();
    ws = next;
    if (!ws.boards[ui.boardId]) ui = { ...ui, boardId: ws.rootId };
    ui = { ...ui, selection: ui.selection.filter(id => ws.blocks[id]) };
    if (a.type === 'block/add') a.blocks.forEach(b => fresh.add(b.id));
    bus.emit('action', a); scheduleSave(); notify();
  },
  undo() { const p = past.pop(); if (!p) return; future.push(ws); ws = p; fixUi(); scheduleSave(); notify(); },
  redo() { const n = future.pop(); if (!n) return; past.push(ws); ws = n; fixUi(); scheduleSave(); notify(); },
  setUI(patch: Partial<UIState>) { ui = { ...ui, ...patch }; notify(); },
  /** origin: screen point the transition grows from (e.g. the portal's center). */
  openBoard(id: ID, origin?: { x: number; y: number }) {
    if (!ws.boards[id] || id === ui.boardId) return;
    const depth = (b: ID) => boardPath(ws, b).length;
    const dir = depth(id) > depth(ui.boardId) ? 'in' : 'out';
    const o = origin ?? { x: innerWidth / 2, y: innerHeight / 2 };
    ui = { ...ui, boardId: id, selection: [], transition: { dir, ox: o.x, oy: o.y, n: (ui.transition?.n ?? 0) + 1 } };
    bus.emit('navigate', id); notify();
  },
};
function fixUi() { if (!ws.boards[ui.boardId]) ui = { ...ui, boardId: ws.rootId }; ui = { ...ui, selection: ui.selection.filter(id => ws.blocks[id]) }; }

export function useStore<T>(sel: (s: { ws: Workspace; ui: UIState }) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel({ ws, ui }));
}

// ---------- helpers ----------
export const boardPath = (w: Workspace, id: ID): Board[] => {
  const out: Board[] = []; let b: Board | undefined = w.boards[id];
  while (b) { out.unshift(b); b = b.parentId ? w.boards[b.parentId] : undefined; }
  return out;
};
export const nextZ = () => Object.values(ws.blocks).reduce((m, b) => Math.max(m, b.z), 0) + 1;

export function makeBlock(boardId: ID, type: string, x: number, y: number, w: number, h: number, data: Record<string, any>): Block {
  return { id: uid(), boardId, type, x, y, w, h, z: type === 'frame' ? 0 : nextZ(), data };
}

/** Creates a child board + portal block in one undo step. */
export function createBoardPortal(parentId: ID, x: number, y: number, title = 'Untitled board'): Block {
  const board: Board = { id: uid(), title, parentId, createdAt: Date.now() };
  const block = makeBlock(parentId, 'board', x, y, 200, 150, { boardId: board.id });
  store.checkpoint();
  store.dispatch({ type: 'board/create', board }, { record: false });
  store.dispatch({ type: 'block/add', blocks: [block] }, { record: false });
  return block;
}

function seed(): Workspace {
  const w = emptyWorkspace();
  const r = w.rootId;
  const sub: Board = { id: uid(), title: 'Moodboard', parentId: r, createdAt: Date.now() };
  w.boards[sub.id] = sub;
  const mk = (type: string, x: number, y: number, wd: number, h: number, data: any, z = 1): Block => ({ id: uid(), boardId: r, type, x, y, w: wd, h, z, data });
  const frame = mk('frame', 60, 60, 560, 380, { title: 'Getting started' }, 0);
  const a = mk('note', 90, 120, 240, 140, { html: '<b>Welcome to Tessera.</b><br>Double-click the canvas to add a note. Drag a block\'s ● handle onto another block to connect them.' }, 2);
  const t = mk('todo', 360, 120, 230, 160, { title: 'First steps', items: [{ id: uid(), text: 'Paste an image or URL', done: false }, { id: uid(), text: 'Open the Moodboard', done: false }, { id: uid(), text: 'Press Ctrl+K', done: false }] }, 3);
  const p = mk('board', 700, 120, 200, 150, { boardId: sub.id }, 4);
  const l = mk('link', 700, 330, 240, 90, { url: 'https://en.wikipedia.org/wiki/Tessera', title: 'Tessera' }, 5);
  [frame, a, t, p, l].forEach(b => (w.blocks[b.id] = b));
  const th = { id: uid(), boardId: r, from: t.id, to: p.id, label: 'next' };
  w.threads[th.id] = th;
  return w;
}
