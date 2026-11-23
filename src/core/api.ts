/**
 * Serializable Action API. AI assistants, the GitHub MCP bridge and the REA engine
 * drive Tessera through here, using the same actions the UI dispatches.
 */
import { store, Action, boardPath, makeBlock, createBoardPortal } from './store';
import { bus, registerBlock, registerCommand, allBlockDefs, allCommands } from './registry';
import type { ID } from './model';

export const api = {
  dispatch: (a: Action) => store.dispatch(a),
  undo: store.undo, redo: store.redo,
  open: (boardId: ID) => store.openBoard(boardId),
  addBlock: (boardId: ID, type: string, x: number, y: number, data: Record<string, any> = {}) => {
    const def = allBlockDefs().find(d => d.type === type); if (!def) throw new Error('unknown block type ' + type);
    if (type === 'board') return createBoardPortal(boardId, x, y, data.title);
    const d = def.defaults(); const b = makeBlock(boardId, type, x, y, d.w, d.h, { ...d.data, ...data });
    store.dispatch({ type: 'block/add', blocks: [b] }); return b;
  },
  query: {
    workspace: () => store.ws,
    currentBoard: () => store.ui.boardId,
    board: (id: ID) => ({
      board: store.ws.boards[id], path: boardPath(store.ws, id).map(b => b.title),
      blocks: Object.values(store.ws.blocks).filter(b => b.boardId === id),
      threads: Object.values(store.ws.threads).filter(t => t.boardId === id),
    }),
    search: (q: string) => searchBlocks(q),
  },
  on: bus.on, registerBlock, registerCommand,
  listCommands: () => allCommands().map(c => ({ id: c.id, title: c.title })),
  runCommand: (id: string) => allCommands().find(c => c.id === id)?.run(),
  exportJSON: () => JSON.stringify(store.ws, null, 2),
};

export function blockText(b: { type: string; data: any }): string {
  const d = b.data;
  const strip = (h = '') => h.replace(/<[^>]+>/g, ' ');
  return [d.title, strip(d.html), d.url, d.name, d.caption, ...(d.items ?? []).map((i: any) => i.text),
    b.type === 'board' ? store.ws.boards[d.boardId]?.title : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
export function searchBlocks(q: string) {
  const s = q.toLowerCase().trim(); if (!s) return [];
  const res: { kind: 'block' | 'board'; id: ID; boardId: ID; text: string }[] = [];
  Object.values(store.ws.boards).forEach(b => b.title.toLowerCase().includes(s) && res.push({ kind: 'board', id: b.id, boardId: b.id, text: b.title }));
  Object.values(store.ws.blocks).forEach(b => { const t = blockText(b); if (t.toLowerCase().includes(s)) res.push({ kind: 'block', id: b.id, boardId: b.boardId, text: t }); });
  return res.slice(0, 40);
}

declare global { interface Window { tessera: typeof api; } }
window.tessera = api;
