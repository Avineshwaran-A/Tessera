/**
 * Right-click menus. Each builder returns plain MenuItem lists so plugins (AI, GitHub MCP, REA)
 * can extend them later through `registerMenuContributor`.
 */
import { store, boardPath, makeBlock, nextZ, createBoardPortal } from '../core/store';
import { getBlockDef } from '../core/registry';
import { blockText } from '../core/api';
import { PALETTE, uid } from '../core/model';
import type { ID, Block } from '../core/model';
import type { MenuItem } from './ContextMenu';
import { flashToast } from '../canvas/Canvas';
import { captureInto } from '../core/capture';

type Pt = { x: number; y: number };
export type MenuKind = 'block' | 'canvas' | 'board' | 'thread';
type Contributor = (kind: MenuKind, target: { ids?: ID[]; boardId?: ID; threadId?: ID; at?: Pt }) => MenuItem[];
const contributors: Contributor[] = [];
/** Extension point: add items to any context menu. */
export const registerMenuContributor = (c: Contributor) => { contributors.push(c); };
const extra = (kind: MenuKind, target: Parameters<Contributor>[1]): MenuItem[] => {
  const items = contributors.flatMap(c => c(kind, target));
  return items.length ? [{ separator: true }, ...items] : [];
};

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const blocksOf = (ids: ID[]) => ids.map(id => store.ws.blocks[id]).filter(Boolean) as Block[];

/** Counts what a deletion takes with it (boards nest), for honest confirmation copy. */
function deletionScope(ids: ID[]) {
  const boards = new Set<ID>();
  blocksOf(ids).forEach(b => { if (b.type === 'board' && b.data.boardId) collect(b.data.boardId, boards); });
  const inner = Object.values(store.ws.blocks).filter(b => boards.has(b.boardId)).length;
  return { boards: boards.size, inner };
}
function collect(id: ID, out: Set<ID>) { out.add(id); Object.values(store.ws.boards).forEach(b => b.parentId === id && collect(b.id, out)); }

/** Delete blocks (and nested boards) as one undo step, with an Undo button in the toast. */
export function deleteBlocks(ids: ID[]) {
  if (!ids.length) return;
  const { boards, inner } = deletionScope(ids);
  const list = blocksOf(ids); const n = list.length;
  const first = n === 1 ? (list[0].type === 'board' ? `“${store.ws.boards[list[0].data.boardId]?.title ?? 'board'}”` : (getBlockDef(list[0].type)?.label ?? 'item').toLowerCase()) : '';
  store.dispatch({ type: 'block/delete', ids });
  const tail = n === 1 && list[0].type === 'board'
    ? (inner ? ` with ${plural(inner, 'item')}` : '')
    : boards ? ` and ${plural(boards, 'board')}${inner ? ` with ${plural(inner, 'item')}` : ''} inside` : '';
  flashToast((n === 1 ? `Deleted ${first}` : `Deleted ${plural(n, 'item')}`) + tail, { label: 'Undo', run: store.undo });
}

/** Delete a board from the Atlas: removes every portal to it (and so the board and everything inside). */
export function deleteBoard(boardId: ID) {
  const b = store.ws.boards[boardId]; if (!b || boardId === store.ws.rootId) return;
  const portals = Object.values(store.ws.blocks).filter(x => x.type === 'board' && x.data.boardId === boardId).map(x => x.id);
  const scope = new Set<ID>(); collect(boardId, scope);
  const inner = Object.values(store.ws.blocks).filter(x => scope.has(x.boardId)).length;
  const sub = scope.size - 1;
  if (store.ui.boardId && scope.has(store.ui.boardId)) store.openBoard(b.parentId ?? store.ws.rootId);
  if (portals.length) store.dispatch({ type: 'block/delete', ids: portals });
  else store.dispatch({ type: 'board/delete', id: boardId });
  flashToast(`Deleted “${b.title}”${inner || sub ? ` with ${[inner && plural(inner, 'item'), sub && plural(sub, 'board')].filter(Boolean).join(' and ')}` : ''}`, { label: 'Undo', run: store.undo });
}

function setColor(ids: ID[], c: string | null) {
  store.checkpoint();
  ids.forEach(id => store.dispatch({ type: 'block/update', id, patch: { color: c ?? undefined } }, { record: false }));
}
function duplicate(ids: ID[]) {
  const sel = blocksOf(ids).filter(b => b.type !== 'board');
  if (!sel.length) return;
  const copies = sel.map((b, i) => ({ ...b, id: uid(), x: b.x + 24, y: b.y + 24, z: nextZ() + i, data: structuredClone(b.data) }));
  store.dispatch({ type: 'block/add', blocks: copies }); store.setUI({ selection: copies.map(c => c.id) });
}
function restack(ids: ID[], where: 'front' | 'back') {
  const list = blocksOf(ids).filter(b => b.type !== 'frame'); if (!list.length) return;
  const zs = Object.values(store.ws.blocks).filter(b => b.boardId === list[0].boardId && b.type !== 'frame').map(b => b.z);
  store.checkpoint();
  list.sort((a, b) => a.z - b.z).forEach((b, i) => store.dispatch({ type: 'block/update', id: b.id, patch: { z: where === 'front' ? Math.max(...zs) + 1 + i : Math.min(...zs) - list.length + i } }, { record: false }));
}
/** Boards a set of blocks may move to: every board except the current one and (for portals) their own subtrees. */
function moveTargets(ids: ID[]): MenuItem[] {
  const here = store.ui.boardId;
  const banned = new Set<ID>([here]);
  blocksOf(ids).forEach(b => { if (b.type === 'board') collect(b.data.boardId, banned); });
  const rows = Object.values(store.ws.boards).filter(b => !banned.has(b.id))
    .map(b => ({ b, path: boardPath(store.ws, b.id).map(x => x.title).join(' / ') }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!rows.length) return [{ label: 'No other boards yet', disabled: true }];
  return rows.slice(0, 30).map(({ b, path }) => ({ id: 'mv' + b.id, label: path, icon: b.id === store.ws.rootId ? 'home' : 'board', run: () => moveTo(ids, b.id) }));
}
function moveTo(ids: ID[], boardId: ID) {
  const list = blocksOf(ids);
  const inner = Object.values(store.ws.blocks).filter(b => b.boardId === boardId);
  const minX = Math.min(...list.map(b => b.x)), minY = Math.min(...list.map(b => b.y));
  const baseY = inner.length ? Math.max(...inner.map(b => b.y + b.h)) + 48 : 40;
  const pos: Record<ID, Pt> = {}; list.forEach(b => (pos[b.id] = { x: b.x - minX + 40, y: b.y - minY + baseY }));
  store.dispatch({ type: 'block/reparent', ids, boardId, pos });
  flashToast(`Moved ${plural(list.length, 'item')} to “${store.ws.boards[boardId]?.title}”`, { label: 'Undo', run: store.undo });
}
async function copyText(b: Block) {
  const text = b.type === 'link' ? b.data.url : blockText(b);
  try { await navigator.clipboard.writeText(text); flashToast(b.type === 'link' ? 'Link copied' : 'Text copied'); } catch { flashToast('Could not reach the clipboard'); }
}

// ---------- menus ----------
export function blockMenu(ids: ID[], edit: (id: ID) => void, openThreadFrom?: (id: ID) => void): MenuItem[] {
  const list = blocksOf(ids); if (!list.length) return [];
  const one = list.length === 1 ? list[0] : null;
  const def = one ? getBlockDef(one.type) : null;
  const editable = one && ['note', 'todo', 'link', 'frame', 'image', 'board'].includes(one.type);
  const scope = deletionScope(ids);
  return [
    ...(one?.type === 'board' ? [{ label: 'Open board', icon: 'open', kbd: 'Dbl-click', run: () => store.openBoard(one.data.boardId) }] : []),
    ...(one?.type === 'link' && one.data.url ? [{ label: 'Open link in browser', icon: 'open', run: () => window.open(one.data.url, '_blank', 'noopener') }] : []),
    ...(editable ? [{ label: one!.type === 'board' ? 'Rename board' : one!.type === 'frame' ? 'Rename frame' : one!.type === 'image' ? 'Edit caption' : `Edit ${def?.label.toLowerCase()}`, icon: 'edit', kbd: one!.type === 'board' ? undefined : 'Dbl-click', run: () => edit(one!.id) }] : []),
    ...(one && (one.type === 'note' || one.type === 'todo' || one.type === 'link') ? [{ label: one.type === 'link' ? 'Copy link' : 'Copy text', icon: 'copy', run: () => copyText(one) }] : []),
    { separator: true },
    { label: 'Duplicate', icon: 'copy', kbd: 'Ctrl D', disabled: list.every(b => b.type === 'board'), run: () => duplicate(ids) },
    { label: 'Move to board', icon: 'move', children: moveTargets(ids) },
    ...(one && openThreadFrom && one.type !== 'frame' ? [{ label: 'Connect to…', icon: 'thread', run: () => openThreadFrom(one.id) }] : []),
    { label: 'Wrap in frame', icon: 'frame', kbd: 'F', run: () => (window as any).__tesseraAdd?.('frame') },
    { separator: true },
    { label: 'Bring to front', icon: 'front', disabled: list.every(b => b.type === 'frame'), run: () => restack(ids, 'front') },
    { label: 'Send to back', icon: 'back', disabled: list.every(b => b.type === 'frame'), run: () => restack(ids, 'back') },
    { separator: true },
    { label: 'Colour', swatches: { colors: [...PALETTE, null], current: one ? one.color ?? null : undefined, pick: c => setColor(ids, c) } },
    { separator: true },
    { label: list.length > 1 ? `Delete ${plural(list.length, 'item')}` : one?.type === 'board' ? `Delete board${scope.inner ? ` and its ${plural(scope.inner, 'item')}` : ''}` : 'Delete', icon: 'trash', kbd: 'Del', danger: true, run: () => deleteBlocks(ids) },
    ...extra('block', { ids }),
  ];
}

export function canvasMenu(at: Pt, edit: (id: ID) => void): MenuItem[] {
  const boardId = store.ui.boardId;
  const add = (type: string) => {
    if (type === 'board') { const b = createBoardPortal(boardId, at.x, at.y); store.setUI({ selection: [b.id] }); return; }
    const d = getBlockDef(type)!.defaults();
    const b = makeBlock(boardId, type, Math.round(at.x / 8) * 8, Math.round(at.y / 8) * 8, d.w, d.h, d.data);
    store.dispatch({ type: 'block/add', blocks: [b] }); store.setUI({ selection: [b.id] });
    if (type !== 'frame') setTimeout(() => edit(b.id));
  };
  const count = Object.values(store.ws.blocks).filter(b => b.boardId === boardId).length;
  const parent = store.ws.boards[boardId]?.parentId;
  return [
    { label: 'Add note here', icon: 'note', kbd: 'N', run: () => add('note') },
    { label: 'Add checklist here', icon: 'todo', kbd: 'T', run: () => add('todo') },
    { label: 'Add link here', icon: 'link', kbd: 'L', run: () => add('link') },
    { label: 'Add board here', icon: 'board', kbd: 'B', run: () => add('board') },
    { label: 'Add frame here', icon: 'frame', kbd: 'F', run: () => add('frame') },
    { label: 'Paste here', icon: 'paste', kbd: 'Ctrl V', run: () => pasteAt(at) },
    { separator: true },
    { label: 'Select all', icon: 'select', kbd: 'Ctrl A', disabled: !count, run: () => store.setUI({ selection: Object.values(store.ws.blocks).filter(b => b.boardId === boardId).map(b => b.id) }) },
    { label: 'Zoom to fit', icon: 'fit', kbd: '⇧ 1', disabled: !count, run: () => (window as any).__tesseraFit?.() },
    ...(parent ? [{ label: 'Go to parent board', icon: 'up', kbd: 'Backspace', run: () => store.openBoard(parent) }] : []),
    ...extra('canvas', { boardId, at }),
  ];
}
async function pasteAt(at: Pt) {
  try {
    const items = await navigator.clipboard.read().catch(() => null);
    const files: File[] = []; let text = '';
    if (items) for (const it of items) {
      const img = it.types.find(t => t.startsWith('image/'));
      if (img) files.push(new File([await it.getType(img)], 'pasted.' + img.split('/')[1], { type: img }));
      else if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
    } else text = await navigator.clipboard.readText();
    if (!files.length && !text) return flashToast('The clipboard is empty');
    captureInto(store.ui.boardId, at.x, at.y, files, files.length ? undefined : text);
  } catch { flashToast('Could not read the clipboard. Use Ctrl+V instead.'); }
}

export function boardMenu(boardId: ID, rename: (id: ID) => void): MenuItem[] {
  const b = store.ws.boards[boardId]; if (!b) return [];
  const isRoot = boardId === store.ws.rootId;
  const scope = new Set<ID>(); collect(boardId, scope);
  const inner = Object.values(store.ws.blocks).filter(x => scope.has(x.boardId)).length;
  return [
    { label: 'Open', icon: 'open', disabled: store.ui.boardId === boardId, run: () => store.openBoard(boardId) },
    { label: 'Rename', icon: 'edit', disabled: isRoot, run: () => rename(boardId) },
    { label: 'New board inside', icon: 'plus', run: () => {
      const inside = Object.values(store.ws.blocks).filter(x => x.boardId === boardId);
      const y = inside.length ? Math.max(...inside.map(x => x.y + x.h)) + 40 : 40;
      createBoardPortal(boardId, 40, y);
      store.openBoard(boardId);
      flashToast(`Added a board inside “${b.title}”`);
    } },
    ...(isRoot ? [] : [
      { separator: true },
      { label: inner ? `Delete board and ${plural(inner, 'item')}` : 'Delete board', icon: 'trash', danger: true, run: () => deleteBoard(boardId) },
    ]),
    ...extra('board', { boardId }),
  ];
}

export function threadMenu(threadId: ID, editLabel: (id: ID) => void): MenuItem[] {
  const t = store.ws.threads[threadId]; if (!t) return [];
  const set = (patch: Record<string, unknown>) => store.dispatch({ type: 'thread/update', id: t.id, patch: patch as any });
  const style = t.style ?? 'curve', arrows = t.arrows ?? 'end';
  return [
    { label: t.label ? 'Edit label' : 'Add label', icon: 'edit', run: () => editLabel(threadId) },
    { label: 'Line style', icon: 'line-' + style, children: [
      { label: 'Curved', icon: 'line-curve', kbd: style === 'curve' ? '✓' : undefined, run: () => set({ style: undefined }) },
      { label: 'Straight', icon: 'line-straight', kbd: style === 'straight' ? '✓' : undefined, run: () => set({ style: 'straight' }) },
      { label: 'Right angles', icon: 'line-elbow', kbd: style === 'elbow' ? '✓' : undefined, run: () => set({ style: 'elbow' }) },
    ] },
    { label: 'Arrowheads', icon: 'arrow-' + arrows, children: [
      { label: 'At the end', icon: 'arrow-end', kbd: arrows === 'end' ? '✓' : undefined, run: () => set({ arrows: undefined }) },
      { label: 'At both ends', icon: 'arrow-both', kbd: arrows === 'both' ? '✓' : undefined, run: () => set({ arrows: 'both' }) },
      { label: 'None', icon: 'arrow-none', kbd: arrows === 'none' ? '✓' : undefined, run: () => set({ arrows: 'none' }) },
    ] },
    { label: 'Snap to horizontal / vertical', icon: 'axes', run: () => (window as any).__tesseraSnapAxes?.(t.id) },
    { label: 'Reverse direction', icon: 'redo', run: () => set({ from: t.to, to: t.from }) },
    { label: (t.points?.length ?? 0) > 1 ? `Remove all ${t.points!.length} bends` : 'Remove bend', icon: 'reset', disabled: !(t.points?.length || t.bend), run: () => set({ bend: undefined, points: undefined }) },
    { separator: true },
    { label: 'Delete connection', icon: 'trash', danger: true, run: () => { store.dispatch({ type: 'thread/delete', id: threadId }); flashToast('Connection deleted', { label: 'Undo', run: store.undo }); } },
    ...extra('thread', { threadId }),
  ];
}
