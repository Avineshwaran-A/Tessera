import { useEffect, useState, useSyncExternalStore } from 'react';
import { store, useStore, boardPath } from '../core/store';
import { allCommands } from '../core/registry';
import { native } from '../core/persistence';
import { Icon } from './icons';
import { contextMenu, MenuItem } from './ContextMenu';
import { flashToast } from '../canvas/Canvas';

/**
 * Desktop title bar: the app's own menus and window controls, drawn in Tessera's materials
 * instead of the OS chrome. Only rendered inside the desktop shell.
 */
const cmd = (id: string, icon: string, label?: string): MenuItem | null => {
  const c = allCommands().find(x => x.id === id);
  return c ? { id, icon, label: label ?? c.title, kbd: c.shortcut, run: c.run } : null;
};
const items = (...xs: (MenuItem | null | false)[]) => xs.filter(Boolean) as MenuItem[];

function menus(): Record<string, () => MenuItem[]> {
  const w = native!.window; const info = native!.info();
  return {
    File: () => items(
      cmd('add.note', 'note', 'New note'), cmd('add.todo', 'todo', 'New checklist'), cmd('add.board', 'board', 'New board'), cmd('add.upload', 'upload', 'Upload images or files…'),
      { separator: true },
      cmd('data.import', 'import', 'Import workspace…'), cmd('data.export', 'export', 'Export workspace…'), cmd('data.reveal', 'folder', 'Show data folder'),
      { separator: true },
      { label: 'Quit Tessera', icon: 'quit', kbd: 'Ctrl Q', run: () => native!.quit() }),
    Edit: () => items(
      cmd('edit.undo', 'undo'), cmd('edit.redo', 'redo'),
      { separator: true },
      cmd('edit.duplicate', 'copy', 'Duplicate selection'), cmd('edit.delete', 'trash', 'Delete selection'),
      { separator: true },
      cmd('edit.selectAll', 'select', 'Select all on board')),
    View: () => items(
      cmd('palette', 'command', 'Search and commands…'),
      { separator: true },
      cmd('view.zoomIn', 'plus'), cmd('view.zoomOut', 'minus'), cmd('view.fit', 'fit', 'Zoom to fit'), cmd('view.reset', 'search', 'Actual size'),
      { separator: true },
      cmd('view.theme', 'contrast', 'Light / dark theme'),
      { label: 'Full screen', icon: 'fullscreen', kbd: 'F11', run: () => w.toggleFullscreen() },
      info.dev && { label: 'Developer tools', icon: 'command', kbd: 'Ctrl ⇧ I', run: () => w.toggleDevTools() }),
    Go: () => {
      const boards = Object.values(store.ws.boards).map(b => ({ b, path: boardPath(store.ws, b.id).map(x => x.title).join(' / ') })).sort((a, b) => a.path.localeCompare(b.path));
      return items(
        cmd('nav.home', 'home', 'Home board'), cmd('nav.up', 'up', 'Parent board'),
        { separator: true },
        ...boards.slice(0, 20).map(({ b, path }) => ({ id: 'go' + b.id, label: path, icon: b.id === store.ws.rootId ? 'home' : 'board', disabled: b.id === store.ui.boardId, run: () => store.openBoard(b.id) })));
    },
    Help: () => items(
      { label: 'Keyboard shortcuts', icon: 'keyboard', run: () => flashToast('N note · T checklist · L link · B board · F frame · U upload · Ctrl K search · Del delete · ⇧F10 actions') },
      { label: 'About Tessera', icon: 'info', run: () => flashToast(`Tessera ${info.version} — your boards are saved in ${info.dataDir}`) }),
  };
}

export function TitleBar() {
  const [win, setWin] = useState(() => native!.window.state());
  const [focused, setFocused] = useState(true);
  const open = useSyncExternalStore(contextMenu.subscribe, () => contextMenu.owner);
  const cur = useStore(s => s.ws.boards[s.ui.boardId]?.title ?? '');
  useEffect(() => { const a = native!.window.onState(setWin); const b = native!.window.onFocus(setFocused); return () => { a(); b(); }; }, []);
  // Ctrl+Q quits, F11 toggles full screen (the native menu that used to own these is gone)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') { e.preventDefault(); native!.quit(); }
      if (e.key === 'F11') { e.preventDefault(); native!.window.toggleFullscreen(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') native!.window.toggleDevTools();
      if (e.altKey && !e.ctrlKey && !e.shiftKey && /^[fevgh]$/i.test(e.key)) {
        const name = ({ f: 'File', e: 'Edit', v: 'View', g: 'Go', h: 'Help' } as Record<string, string>)[e.key.toLowerCase()];
        const btn = document.querySelector<HTMLElement>(`[data-menu="${name}"]`); if (btn) { e.preventDefault(); show(name, btn); }
      }
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, []);
  const mac = native!.platform === 'darwin';
  const show = (name: string, el: HTMLElement) => { const r = el.getBoundingClientRect(); contextMenu.openFor(name, r.left - 2, r.bottom + 4, menus()[name]()); };

  return <div className={'titlebar' + (focused ? '' : ' blurred') + (mac ? ' mac' : '') + (win.fullscreen ? ' full' : '')}
    onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button')) native!.window.toggleMaximize(); }}>
    {!mac && <span className="tb-mark" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24"><rect x="2" y="2" width="9" height="9" rx="2" className="m-ink" /><rect x="13" y="2" width="9" height="5" rx="1.6" /><rect x="13" y="9" width="9" height="13" rx="1.6" className="m-soft" /><rect x="2" y="13" width="9" height="9" rx="1.6" className="m-soft" /></svg></span>}
    <nav className="tb-menus" data-menubar role="menubar" aria-label="Application menu">
      {Object.keys(menus()).map(name => <button key={name} data-menu={name} role="menuitem" aria-haspopup="menu" aria-expanded={open === name}
        className={'tb-menu' + (open === name ? ' open' : '')}
        onClick={e => (open === name ? contextMenu.close() : show(name, e.currentTarget))}
        onPointerEnter={e => { if (open && open !== name) show(name, e.currentTarget); }}>{name}</button>)}
    </nav>
    <div className="tb-drag" aria-hidden="true" title={cur} />
    {!mac && <div className="tb-controls">
      <button className="tb-ctl" aria-label="Minimize" onClick={() => native!.window.minimize()}><Icon name="win-min" size={16} /></button>
      <button className="tb-ctl" aria-label={win.maximized ? 'Restore' : 'Maximize'} onClick={() => native!.window.toggleMaximize()}><Icon name={win.maximized ? 'win-restore' : 'win-max'} size={16} /></button>
      <button className="tb-ctl close" aria-label="Close" onClick={() => native!.window.close()}><Icon name="win-close" size={16} /></button>
    </div>}
  </div>;
}
