import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { store, useStore, boardPath, makeBlock, createBoardPortal } from '../core/store';
import { allBlockDefs, allCommands, registerCommand, getBlockDef } from '../core/registry';
import { searchBlocks } from '../core/api';
import { captureInto } from '../core/capture';
import { PALETTE, uid } from '../core/model';
import type { ID, Block } from '../core/model';
import { isTyping, DEFAULT_VIEW } from '../canvas/Canvas';
import { animateView } from '../canvas/motion';
import { GRID } from '../canvas/snap';
import { native } from '../core/persistence';
import { flashToast } from '../canvas/Canvas';
import { Icon } from './icons';
import { contextMenu } from './ContextMenu';
import { boardMenu } from './actions';

const center = () => (window as any).__tesseraCenter?.() ?? { x: 200, y: 200 };

export function addBlockAtCenter(type: string) {
  const boardId = store.ui.boardId; const c = center();
  if (type === 'board') { const b = createBoardPortal(boardId, c.x - 100, c.y - 75); store.setUI({ selection: [b.id] }); return; }
  const def = getBlockDef(type)!; const d = def.defaults();
  const jitter = () => Math.round((Math.random() - 0.5) * 60);
  let b: Block = makeBlock(boardId, type, c.x - d.w / 2 + jitter(), c.y - d.h / 2 + jitter(), d.w, d.h, d.data);
  if (type === 'frame') {
    // wrap selection if any
    const sel = store.ui.selection.map(id => store.ws.blocks[id]).filter(Boolean);
    if (sel.length) { const x = Math.min(...sel.map(s => s.x)) - 30, y = Math.min(...sel.map(s => s.y)) - 50; b = { ...b, x, y, w: Math.max(...sel.map(s => s.x + s.w)) - x + 30, h: Math.max(...sel.map(s => s.y + s.h)) - y + 30 }; }
  }
  store.dispatch({ type: 'block/add', blocks: [b] }); store.setUI({ selection: [b.id] });
  if (type === 'note' || type === 'todo' || type === 'link') setTimeout(() => (window as any).__tesseraEdit?.(b.id));
}

function pickJSON(): Promise<string | null> {
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json'; i.onchange = () => { const f = i.files?.[0]; f ? f.text().then(res) : res(null); }; i.click(); });
}

function pickFiles() {
  const i = document.createElement('input'); i.type = 'file'; i.multiple = true;
  i.onchange = () => { const c = center(); captureInto(store.ui.boardId, c.x - 130, c.y - 100, [...(i.files ?? [])]); };
  i.click();
}

function duplicateSelection() {
  const sel = store.ui.selection.map(id => store.ws.blocks[id]).filter(b => b && b.type !== 'board');
  if (!sel.length) return;
  const copies = sel.map((b, i) => ({ ...b, id: uid(), x: b.x + 30, y: b.y + 30, z: b.z + 1000 + i, data: structuredClone(b.data) }));
  store.dispatch({ type: 'block/add', blocks: copies }); store.setUI({ selection: copies.map(c => c.id) });
}
let lastNudge = 0;
/** Arrow-key nudge; a burst of presses is one undo step. */
function nudge(key: string, step: number) {
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  const now = performance.now(); if (now - lastNudge > 700) store.checkpoint(); lastNudge = now;
  store.dispatch({ type: 'block/move', ids: store.ui.selection, dx, dy }, { record: false });
}
const deleteSelection = () => store.ui.selection.length && store.dispatch({ type: 'block/delete', ids: store.ui.selection });

export function registerCoreCommands(openPalette: () => void) {
  (window as any).__tesseraAdd = addBlockAtCenter;
  allBlockDefs().filter(d => d.type !== 'image' && d.type !== 'file').forEach(d =>
    registerCommand({ id: 'add.' + d.type, title: `Add ${d.label}`, shortcut: d.key?.toUpperCase(), run: () => addBlockAtCenter(d.type) }));
  registerCommand({ id: 'add.upload', title: 'Upload images or files…', shortcut: 'U', run: pickFiles });
  registerCommand({ id: 'edit.undo', title: 'Undo', shortcut: 'Ctrl Z', run: store.undo });
  registerCommand({ id: 'edit.redo', title: 'Redo', shortcut: 'Ctrl ⇧ Z', run: store.redo });
  registerCommand({ id: 'edit.duplicate', title: 'Duplicate selection', shortcut: 'Ctrl D', run: duplicateSelection });
  registerCommand({ id: 'edit.delete', title: 'Delete selection', shortcut: 'Del', run: deleteSelection });
  registerCommand({ id: 'edit.selectAll', title: 'Select all on board', shortcut: 'Ctrl A', run: () => store.setUI({ selection: Object.values(store.ws.blocks).filter(b => b.boardId === store.ui.boardId).map(b => b.id) }) });
  registerCommand({ id: 'nav.home', title: 'Go to Home board', run: () => store.openBoard(store.ws.rootId) });
  registerCommand({ id: 'nav.up', title: 'Go to parent board', shortcut: 'Backspace', run: () => { const p = store.ws.boards[store.ui.boardId]?.parentId; if (p) store.openBoard(p); } });
  registerCommand({ id: 'view.reset', title: 'Reset zoom', shortcut: 'Ctrl 0', run: () => animateView(DEFAULT_VIEW) });
  registerCommand({ id: 'view.fit', title: 'Zoom to fit content', shortcut: '⇧ 1', run: () => (window as any).__tesseraFit?.() });
  registerCommand({ id: 'view.zoomIn', title: 'Zoom in', shortcut: '+', run: () => (window as any).__tesseraZoom?.(1.25) });
  registerCommand({ id: 'view.zoomOut', title: 'Zoom out', shortcut: '−', run: () => (window as any).__tesseraZoom?.(0.8) });
  registerCommand({ id: 'view.theme', title: 'Toggle light / dark', run: () => { const r = document.documentElement; const t = r.dataset.theme === 'dark' ? 'light' : 'dark'; r.dataset.theme = t; try { localStorage.setItem('tessera.theme', t); } catch {} } });
  registerCommand({ id: 'data.export', title: 'Export workspace (JSON)…', run: async () => {
    const json = window.tessera.exportJSON();
    if (native) { if (await native.exportWorkspace(json)) flashToast('Workspace exported'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'tessera-workspace.json'; a.click();
  } });
  registerCommand({ id: 'data.import', title: 'Import workspace (JSON)…', run: async () => {
    const text = native ? await native.importWorkspace() : await pickJSON();
    if (!text) return;
    try { const ws = JSON.parse(text); if (ws?.version !== 1 || !ws.boards?.[ws.rootId]) throw 0; store.dispatch({ type: 'ws/replace', ws }); store.openBoard(ws.rootId); flashToast('Workspace imported — Ctrl+Z to revert'); }
    catch { flashToast('That file is not a Tessera workspace'); }
  } });
  if (native) registerCommand({ id: 'data.reveal', title: 'Show data folder', run: () => { native?.revealData(); } });
  registerCommand({ id: 'palette', title: 'Command palette', shortcut: 'Ctrl K', run: openPalette });
}

export function useKeyboard(openPalette: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (isTyping()) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); allCommands().find(c => c.id === 'edit.selectAll')!.run(); return; }
      if (mod && e.key === '0') { e.preventDefault(); allCommands().find(c => c.id === 'view.reset')!.run(); return; }
      if (mod || e.altKey) return;
      if (e.key.startsWith('Arrow') && store.ui.selection.length) { e.preventDefault(); nudge(e.key, e.shiftKey ? GRID : 1); return; }
      if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) { (window as any).__tesseraFit?.(); return; }
      if (e.key === '+' || e.key === '=') { (window as any).__tesseraZoom?.(1.25); return; }
      if (e.key === '-') { (window as any).__tesseraZoom?.(0.8); return; }
      if (e.key === 'Delete' || (e.key === 'Backspace' && store.ui.selection.length)) { e.preventDefault(); deleteSelection(); return; }
      if (e.key === 'Backspace') { allCommands().find(c => c.id === 'nav.up')!.run(); return; }
      const k = e.key.toLowerCase();
      const def = allBlockDefs().find(d => d.key === k); if (def) { e.preventDefault(); addBlockAtCenter(def.type); return; }
      if (k === 'u') pickFiles();
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [openPalette]);
}

// ---------- Atlas (board tree) ----------
/** Mosaic glyph for a board: four tiles, the "lit" tile picked from the board id so siblings differ. */
function BoardGlyph({ id, active }: { id: ID; active: boolean }) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const lit = h % 4;
  const tiles = [[0, 0, 6, 6], [7, 0, 5, 4], [7, 5, 5, 7], [0, 7, 6, 5]];
  return <svg className={'board-glyph' + (active ? ' on' : '')} width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
    {tiles.map(([x, y, w, hh], i) => <rect key={i} x={x} y={y} width={w} height={hh} rx="1.2" className={i === lit ? 'lit' : ''} />)}
  </svg>;
}

export function Atlas({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const boards = useStore(s => s.ws.boards); const rootId = useStore(s => s.ws.rootId); const cur = useStore(s => s.ui.boardId);
  const blocks = useStore(s => s.ws.blocks);
  const kids = useMemo(() => { const m: Record<ID, ID[]> = {}; Object.values(boards).forEach(b => b.parentId && (m[b.parentId] ??= []).push(b.id)); Object.values(m).forEach(a => a.sort((x, y) => boards[x].createdAt - boards[y].createdAt)); return m; }, [boards]);
  const counts = useMemo(() => { const m: Record<ID, number> = {}; Object.values(blocks).forEach(b => { m[b.boardId] = (m[b.boardId] ?? 0) + 1; }); return m; }, [blocks]);
  const path = useMemo(() => new Set(boardPath(store.ws, cur).map(b => b.id)), [cur, boards]);
  const [open, setOpen] = useState<Record<ID, boolean>>({});
  const [renaming, setRenaming] = useState<ID | null>(null);
  const Node = ({ id, depth }: { id: ID; depth: number }) => {
    const b = boards[id]; const ch = kids[id] ?? []; const isOpen = open[id] ?? path.has(id);
    return <>
      <div data-drop-board={id} role="treeitem" aria-selected={cur === id} aria-expanded={ch.length ? isOpen : undefined} tabIndex={0}
        className={'atlas-row' + (cur === id ? ' active' : '')} style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => renaming !== id && store.openBoard(id)}
        onContextMenu={e => { e.preventDefault(); contextMenu.open(e.clientX, e.clientY, boardMenu(id, setRenaming), b.title); }}
        onKeyDown={e => { if (renaming === id) return; if (e.key === 'F2' && id !== rootId) setRenaming(id); if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); contextMenu.open(r.left + 24, r.bottom, boardMenu(id, setRenaming), b.title); } if (e.key === 'Enter') store.openBoard(id); if (e.key === 'ArrowRight') setOpen({ ...open, [id]: true }); if (e.key === 'ArrowLeft') setOpen({ ...open, [id]: false }); }}>
        <button className={'twisty' + (isOpen ? ' open' : '') + (ch.length ? '' : ' none')} tabIndex={-1} aria-label={isOpen ? 'Collapse' : 'Expand'}
          onClick={e => { e.stopPropagation(); setOpen({ ...open, [id]: !isOpen }); }}><Icon name="chevron" size={14} /></button>
        <BoardGlyph id={id} active={cur === id} />
        {renaming === id
          ? <input className="inline-input atlas-rename" autoFocus defaultValue={b.title} aria-label="Board name" onClick={e => e.stopPropagation()}
              onFocus={e => e.target.select()}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.title) store.dispatch({ type: 'board/rename', id, title: v }); setRenaming(null); }}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.target as HTMLInputElement).value = b.title; (e.target as HTMLInputElement).blur(); } }} />
          : <span className="ellipsis atlas-title">{b.title}</span>}
        <span className="atlas-count">{counts[id] ?? 0}</span>
      </div>
      {isOpen && ch.length > 0 && <div role="group" className="atlas-group">{ch.map(c => <Node key={c} id={c} depth={depth + 1} />)}</div>}
    </>;
  };
  return <aside className={'atlas' + (collapsed ? ' collapsed' : '')}>
    {!native && <div className="brand">
      <svg className="mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="9" height="9" rx="2" className="m-ink" /><rect x="13" y="2" width="9" height="5" rx="1.6" /><rect x="13" y="9" width="9" height="13" rx="1.6" className="m-soft" /><rect x="2" y="13" width="9" height="9" rx="1.6" className="m-soft" /></svg>
      {!collapsed && <span className="brand-name serif">Tessera</span>}
      <button className="icon-btn" onClick={onToggle} title={collapsed ? 'Show boards' : 'Hide boards'} aria-label={collapsed ? 'Show boards' : 'Hide boards'}><Icon name={collapsed ? 'expand' : 'collapse'} /></button>
    </div>}
    {/* desktop: the brand lives in the title bar, so the collapse toggle joins the Boards header */}
    {native && collapsed && <div className="atlas-head"><button className="icon-btn" onClick={onToggle} title="Show boards" aria-label="Show boards"><Icon name="expand" /></button></div>}
    {!collapsed && <>
      <div className="atlas-head"><span>Boards</span><span className="atlas-total">{Object.keys(boards).length}</span>
        {native && <button className="icon-btn atlas-toggle" onClick={onToggle} title="Hide boards" aria-label="Hide boards"><Icon name="collapse" /></button>}</div>
      <div className="atlas-tree" role="tree" data-scroll><Node id={rootId} depth={0} /></div>
      <div className="atlas-foot">
        <button className="atlas-new" onClick={() => addBlockAtCenter('board')}><Icon name="plus" size={16} />New board here<kbd>B</kbd></button>
      </div>
    </>}
  </aside>;
}

// ---------- Top bar ----------
const TYPE_WORD: Record<string, [string, string]> = { note: ['note', 'notes'], todo: ['checklist', 'checklists'], image: ['image', 'images'], file: ['file', 'files'], link: ['link', 'links'], board: ['board', 'boards'], frame: ['frame', 'frames'] };
export function TopBar({ openPalette }: { openPalette: () => void }) {
  const cur = useStore(s => s.ui.boardId); useStore(s => s.ws.boards);
  const blocks = useStore(s => s.ws.blocks);
  const saved = useStore(s => s.ui.saved); const selection = useStore(s => s.ui.selection);
  const path = boardPath(store.ws, cur);
  const [editTitle, setEditTitle] = useState(false);
  const here = Object.values(blocks).filter(b => b.boardId === cur);
  const byType: Record<string, number> = {}; here.forEach(b => (byType[b.type] = (byType[b.type] ?? 0) + 1));
  const summary = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${n} ${(TYPE_WORD[t] ?? [t, t + 's'])[n === 1 ? 0 : 1]}`).join(' · ');
  const current = path[path.length - 1];
  return <header className="topbar">
    <div className="titles">
      {path.length > 1 && <nav className="crumbs" aria-label="Board path">{path.slice(0, -1).map(b =>
        <span key={b.id} className="crumb-wrap"><button data-drop-board={b.id} className="crumb" onClick={() => store.openBoard(b.id)}>{b.title}</button><Icon name="chevron" size={12} className="sep" /></span>)}</nav>}
      <div className="title-row">
        {editTitle && current.id !== store.ws.rootId
          ? <input autoFocus className="inline-input board-title serif" defaultValue={current.title} aria-label="Board name"
              onBlur={e => { store.dispatch({ type: 'board/rename', id: current.id, title: e.target.value.trim() || 'Untitled' }); setEditTitle(false); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditTitle(false); }} />
          : <h1 className="board-title serif" title={current.id === store.ws.rootId ? undefined : 'Click to rename'} onClick={() => current.id !== store.ws.rootId && setEditTitle(true)}>{current.title}</h1>}
        <span className="board-meta">{summary || 'Empty board'}</span>
      </div>
    </div>
    <div className="topbar-right">
      {selection.length > 0 && <div className="swatches" role="group" aria-label="Colour tag for selection">
        <span className="sel-count">{selection.length} selected</span>
        {PALETTE.map(c => <button key={c} style={{ ['--sw' as any]: c }} aria-label={'Tag ' + c} onClick={() => { store.checkpoint(); selection.forEach(id => store.dispatch({ type: 'block/update', id, patch: { color: c } }, { record: false })); }} />)}
        <button className="clear" aria-label="Remove colour tag" onClick={() => { store.checkpoint(); selection.forEach(id => store.dispatch({ type: 'block/update', id, patch: { color: undefined } }, { record: false })); }}><Icon name="minus" size={12} /></button>
      </div>}
      <span className={'save-pill ' + saved} role="status">{saved === 'saved' ? 'Saved' : saved === 'saving' ? 'Saving…' : 'Not saved: storage full'}</span>
      <button className="search-btn" onClick={openPalette}><Icon name="search" size={16} /><span>Search or run a command</span><kbd>Ctrl K</kbd></button>
    </div>
  </header>;
}

// ---------- Dock ----------
export function Dock() {
  const defs = allBlockDefs().filter(d => d.type !== 'image' && d.type !== 'file');
  return <div className="dock" role="toolbar" aria-label="Add to board">
    {defs.map(d => <button key={d.type} onClick={() => addBlockAtCenter(d.type)} aria-label={`Add ${d.label}`}>
      <Icon name={d.icon} size={20} /><span className="dock-label">{d.label}</span><kbd className="dock-key">{d.key?.toUpperCase()}</kbd></button>)}
    <span className="dock-sep" />
    <button onClick={pickFiles} aria-label="Upload images or files"><Icon name="upload" size={20} /><span className="dock-label">Upload</span><kbd className="dock-key">U</kbd></button>
  </div>;
}

// ---------- Palette ----------
const CMD_ICON: Record<string, string> = {
  'add.note': 'note', 'add.todo': 'todo', 'add.link': 'link', 'add.board': 'board', 'add.frame': 'frame', 'add.upload': 'upload',
  'edit.undo': 'undo', 'edit.redo': 'redo', 'edit.duplicate': 'copy', 'edit.delete': 'trash', 'edit.selectAll': 'select',
  'nav.home': 'home', 'nav.up': 'up', 'view.reset': 'search', 'view.fit': 'fit', 'view.zoomIn': 'plus', 'view.zoomOut': 'minus',
  'view.theme': 'contrast', 'data.export': 'export', 'data.import': 'import', 'data.reveal': 'folder',
};
export function Palette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState(''); const [i, setI] = useState(0); const inp = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => inp.current?.focus(), []);
  const cmds = allCommands().filter(c => c.id !== 'palette' && c.title.toLowerCase().includes(q.toLowerCase()));
  const hits = searchBlocks(q);
  type Row = { key: string; title: string; sub?: string; kbd?: string; icon: string; run: () => void };
  const rows: Row[] = [
    ...hits.map(h => { const b = store.ws.blocks[h.id];
      return { key: h.kind + h.id, title: h.text.slice(0, 90), icon: h.kind === 'board' ? 'board' : (b?.type ?? 'note'),
        sub: boardPath(store.ws, h.boardId).map(x => x.title).join(' / '),
        run: () => { store.openBoard(h.boardId); if (h.kind === 'block') { store.setUI({ selection: [h.id] }); (window as any).__tesseraFocus?.(h.id); } } }; }),
    ...cmds.map(c => ({ key: c.id, title: c.title, kbd: c.shortcut, icon: (c as any).icon ?? CMD_ICON[c.id] ?? 'command', run: c.run })),
  ];
  useEffect(() => { listRef.current?.querySelector('.palette-row.active')?.scrollIntoView({ block: 'nearest' }); }, [i]);
  const go = (r?: Row) => { if (!r) return; onClose(); r.run(); };
  return <div className="palette-back" onPointerDown={onClose}>
    <div className="palette" role="dialog" aria-label="Search and commands" onPointerDown={e => e.stopPropagation()}>
      <div className="palette-input"><Icon name="search" size={18} />
        <input ref={inp} value={q} placeholder="Search every board, or type a command" aria-label="Search or command" onChange={e => { setQ(e.target.value); setI(0); }}
          onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(rows.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } if (e.key === 'Enter') go(rows[i]); }} />
        <kbd>Esc</kbd></div>
      <div className="palette-list" ref={listRef} role="listbox" data-scroll>
        {rows.map((r, n) => <Fragment key={r.key}>
          {n === 0 && hits.length > 0 && <div className="palette-sec">On your boards</div>}
          {n === hits.length && cmds.length > 0 && <div className="palette-sec">Commands</div>}
          <div role="option" aria-selected={n === i} className={'palette-row' + (n === i ? ' active' : '')} onMouseMove={() => n !== i && setI(n)} onClick={() => go(r)}>
            <span className="palette-ic"><Icon name={r.icon} size={16} /></span>
            <span className="palette-main"><span className="ellipsis">{r.title}</span>{r.sub && <span className="palette-sub ellipsis">{r.sub}</span>}</span>
            {r.kbd && <kbd>{r.kbd}</kbd>}
          </div></Fragment>)}
        {!rows.length && <div className="palette-empty">Nothing on your boards or in commands matches “{q}”.</div>}
      </div>
      <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
    </div>
  </div>;
}
