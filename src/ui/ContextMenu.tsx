import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './icons';

/** One entry in a context menu. `children` makes a submenu; `swatches` renders a colour row. */
export interface MenuItem {
  id?: string;
  label?: string;
  icon?: string;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  children?: MenuItem[];
  swatches?: { colors: (string | null)[]; current?: string | null; pick: (c: string | null) => void };
  run?: () => void;
}
interface MenuState { x: number; y: number; items: MenuItem[]; title?: string }

// tiny external store: any component (canvas, Atlas, top bar, plugins) can open the one shared menu
let state: MenuState | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export const contextMenu = {
  open(x: number, y: number, items: MenuItem[], title?: string) { contextMenu.owner = null; state = { x, y, items: tidy(items), title }; emit(); },
  close() { if (state) { state = null; contextMenu.owner = null; emit(); } },
  get isOpen() { return !!state; },
  /** owner tag lets a menubar know which of its menus is showing */
  owner: null as string | null,
  openFor(owner: string, x: number, y: number, items: MenuItem[]) { this.owner = owner; state = { x, y, items: tidy(items) }; emit(); },
  subscribe(cb: () => void) { subs.add(cb); return () => { subs.delete(cb); }; },
};
/** drop leading/trailing/double separators left behind by conditional items */
function tidy(items: MenuItem[]) {
  const out: MenuItem[] = [];
  for (const it of items) { if (it.separator && (!out.length || out[out.length - 1].separator)) continue; out.push(it); }
  while (out.length && out[out.length - 1].separator) out.pop();
  return out;
}

export function ContextMenuHost() {
  const s = useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => state);
  useEffect(() => {
    if (!s) return;
    const close = () => contextMenu.close();
    const onDown = (e: PointerEvent) => { const t = e.target as HTMLElement; if (!t.closest('.ctx') && !(contextMenu.owner && t.closest('[data-menubar]'))) close(); };
    window.addEventListener('pointerdown', onDown, true); window.addEventListener('blur', close); window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('blur', close); window.removeEventListener('resize', close); window.removeEventListener('wheel', close); };
  }, [s]);
  if (!s) return null;
  return <Menu key={`${s.x},${s.y}`} x={s.x} y={s.y} items={s.items} title={s.title} root />;
}

function Menu({ x, y, items, title, root, onBack }: { x: number; y: number; items: MenuItem[]; title?: string; root?: boolean; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y, ready: false });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ i: number; x: number; y: number } | null>(null);
  const actionable = items.map((it, i) => (!it.separator && !it.disabled && !it.swatches ? i : -1)).filter(i => i >= 0);

  // keep the menu inside the window; flip left/up when there isn't room
  useLayoutEffect(() => {
    const el = ref.current!; const r = el.getBoundingClientRect(); const pad = 8;
    let nx = x, ny = y;
    if (nx + r.width > innerWidth - pad) nx = root ? Math.max(pad, x - r.width) : Math.max(pad, x - r.width - (ref.current!.dataset.parentW ? +ref.current!.dataset.parentW : 0));
    if (ny + r.height > innerHeight - pad) ny = Math.max(pad, innerHeight - pad - r.height);
    setPos({ x: nx, y: ny, ready: true });
    if (root) el.focus();
  }, [x, y, root]);

  const run = (it: MenuItem) => { if (it.disabled || !it.run) return; contextMenu.close(); it.run(); };
  const openSub = (i: number) => {
    const row = ref.current?.querySelectorAll<HTMLElement>('[data-row]')[i]; if (!row) return;
    const r = row.getBoundingClientRect(); setSub({ i, x: r.right - 4, y: r.top - 5 });
  };
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const at = actionable.indexOf(active);
    if (e.key === 'Escape') { e.preventDefault(); onBack ? onBack() : contextMenu.close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(actionable[(at + 1) % actionable.length]); setSub(null); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(actionable[(at - 1 + actionable.length) % actionable.length]); setSub(null); }
    else if (e.key === 'ArrowRight' && active >= 0 && items[active].children) { e.preventDefault(); openSub(active); }
    else if (e.key === 'ArrowLeft' && onBack) { e.preventDefault(); onBack(); }
    else if ((e.key === 'Enter' || e.key === ' ') && active >= 0) { e.preventDefault(); items[active].children ? openSub(active) : run(items[active]); }
  };

  return <>
    <div ref={ref} className={'ctx' + (pos.ready ? ' ready' : '')} role="menu" tabIndex={-1} aria-label={title ?? 'Actions'}
      style={{ left: pos.x, top: pos.y }} onKeyDown={onKey} onContextMenu={e => e.preventDefault()}>
      {title && <div className="ctx-title ellipsis">{title}</div>}
      {items.map((it, i) => {
        if (it.separator) return <div key={'s' + i} className="ctx-sep" role="separator" />;
        if (it.swatches) return <div key={'w' + i} className="ctx-swatches" role="group" aria-label={it.label ?? 'Colour'}>
          {it.swatches.colors.map(c => <button key={c ?? 'none'} className={'ctx-sw' + ((it.swatches!.current ?? null) === c ? ' on' : '') + (c ? '' : ' none')} style={c ? { ['--sw' as any]: c } : undefined}
            aria-label={c ? 'Tag ' + c : 'No colour'} onClick={() => { contextMenu.close(); it.swatches!.pick(c); }}>{!c && <Icon name="minus" size={12} />}</button>)}
        </div>;
        return <div key={it.id ?? it.label ?? i} data-row role="menuitem" aria-disabled={it.disabled || undefined} aria-haspopup={it.children ? 'menu' : undefined}
          className={'ctx-row' + (i === active ? ' active' : '') + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '')}
          onPointerEnter={() => { setActive(it.disabled ? -1 : i); if (it.children) openSub(i); else setSub(null); }}
          onClick={() => (it.children ? openSub(i) : run(it))}>
          <span className="ctx-ic">{it.icon && <Icon name={it.icon} size={16} />}</span>
          <span className="ctx-label ellipsis">{it.label}</span>
          {it.kbd && <kbd>{it.kbd}</kbd>}
          {it.children && <Icon name="chevron" size={14} className="ctx-more" />}
        </div>;
      })}
    </div>
    {sub && items[sub.i]?.children && <Menu key={sub.i} x={sub.x} y={sub.y} items={tidy(items[sub.i].children!)} onBack={() => { setSub(null); ref.current?.focus(); }} />}
  </>;
}
