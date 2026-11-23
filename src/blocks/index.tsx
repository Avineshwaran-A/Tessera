import { registerBlock, BlockProps } from '../core/registry';
import { store, useStore } from '../core/store';
import { uid } from '../core/model';
import { setData, useBlobUrl, InlineText, RichText, fmtSize } from './common';
import { getBlob } from '../core/persistence';
import { Icon } from '../ui/icons';

function Note({ block, editing }: BlockProps) {
  return <RichText html={block.data.html ?? ''} editing={editing} onCommit={html => setData(block.id, { html })} />;
}

function Todo({ block, editing }: BlockProps) {
  const items: { id: string; text: string; done: boolean }[] = block.data.items ?? [];
  const put = (next: typeof items) => setData(block.id, { items: next });
  const done = items.filter(i => i.done).length;
  return <div className="todo">
    <div className="todo-head">
      <InlineText className="block-title" value={block.data.title ?? ''} placeholder="Checklist" editing={editing} onCommit={title => setData(block.id, { title })} />
      <span className="mono dim">{done}/{items.length}</span>
    </div>
    <div className="meter"><i style={{ width: items.length ? (done / items.length) * 100 + '%' : 0 }} /></div>
    {items.map((it, i) => <label key={it.id} className={'todo-item' + (it.done ? ' done' : '')}>
      <input data-nodrag type="checkbox" checked={it.done} onChange={() => put(items.map(x => x.id === it.id ? { ...x, done: !x.done } : x))} />
      {editing ? <input data-nodrag className="inline-input" defaultValue={it.text} autoFocus={i === items.length - 1 && !it.text}
        onBlur={e => e.target.value !== it.text && put(items.map(x => x.id === it.id ? { ...x, text: e.target.value } : x))}
        onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation();
          if (e.key === 'Enter') { const t = (e.target as HTMLInputElement).value; const n = items.map(x => x.id === it.id ? { ...x, text: t } : x); n.splice(i + 1, 0, { id: uid(), text: '', done: false }); put(n); }
          if (e.key === 'Backspace' && !(e.target as HTMLInputElement).value) { e.preventDefault(); put(items.filter(x => x.id !== it.id)); } }} />
        : <span>{it.text || <span className="ph">Empty item</span>}</span>}
    </label>)}
    {editing && <button data-nodrag className="ghost-btn add-item" onClick={() => put([...items, { id: uid(), text: '', done: false }])}><Icon name="plus" size={14} />Add item</button>}
    {!editing && !items.length && <div className="ph small">Double-click to add items</div>}
  </div>;
}

function ImageB({ block, editing }: BlockProps) {
  const url = useBlobUrl(block.data.blobId) ?? block.data.src;
  return <div className="image">
    {url ? <img src={url} alt={block.data.caption || block.data.name || ''} draggable={false} /> : <div className="ph center">Loading…</div>}
    <InlineText className="caption" value={block.data.caption ?? ''} placeholder={editing ? 'Caption' : ''} editing={editing} onCommit={caption => setData(block.id, { caption })} />
  </div>;
}

function FileB({ block }: BlockProps) {
  const ext = (block.data.name?.split('.').pop() ?? 'file').slice(0, 4).toUpperCase();
  const download = async () => {
    const b = await getBlob(block.data.blobId); if (!b) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = block.data.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return <div className="file">
    <div className="file-badge mono">{ext}</div>
    <div className="file-meta"><div className="block-title ellipsis" title={block.data.name}>{block.data.name}</div><div className="mono dim small">{fmtSize(block.data.size)}</div></div>
    <button data-nodrag className="icon-btn sm" onClick={download} title="Download" aria-label={"Download " + block.data.name}><Icon name="download" size={16} /></button>
  </div>;
}

function LinkB({ block, editing }: BlockProps) {
  let host = ''; try { host = new URL(block.data.url).hostname.replace(/^www\./, ''); } catch {}
  return <div className="link">
    <div className="link-host mono small">{host ? <img src={`https://icons.duckduckgo.com/ip3/${host}.ico`} alt="" width={12} height={12} onError={e => (e.currentTarget.style.display = 'none')} /> : null}{host || 'link'}</div>
    <InlineText className="block-title" value={block.data.title ?? ''} placeholder={host || 'Title'} editing={editing} onCommit={title => setData(block.id, { title })} />
    {editing ? <InlineText className="mono small" value={block.data.url ?? ''} placeholder="https://" editing onCommit={url => setData(block.id, { url })} />
      : <a data-nodrag className="mono small ellipsis" href={block.data.url} target="_blank" rel="noreferrer noopener">{block.data.url}</a>}
  </div>;
}

function Portal({ block, editing }: BlockProps) {
  const id = block.data.boardId;
  const board = useStore(s => s.ws.boards[id]);
  const kids = useStore(s => s.ws.blocks);
  if (!board) return <div className="ph center">Missing board</div>;
  const inner = Object.values(kids).filter(b => b.boardId === id);
  const xs = inner.map(b => b.x), ys = inner.map(b => b.y);
  const minX = Math.min(...xs, 0), minY = Math.min(...ys, 0);
  const maxX = Math.max(...inner.map(b => b.x + b.w), 1), maxY = Math.max(...inner.map(b => b.y + b.h), 1);
  const sx = 100 / (maxX - minX || 1), sy = 100 / (maxY - minY || 1);
  return <div className="portal">
    <div className="minimap">{inner.slice(0, 60).map(b => <i key={b.id} className={'mm-' + b.type}
      style={{ left: (b.x - minX) * sx + '%', top: (b.y - minY) * sy + '%', width: Math.max(b.w * sx, 3) + '%', height: Math.max(b.h * sy, 3) + '%', background: b.color }} />)}
      {!inner.length && <span className="ph small">Empty</span>}</div>
    <div className="portal-foot">
      <InlineText className="block-title" value={board.title} editing={editing} onCommit={title => store.dispatch({ type: 'board/rename', id, title: title || 'Untitled' })} />
      <button data-nodrag className="icon-btn sm" onClick={e => { const r = (e.currentTarget.closest('[data-block]') as HTMLElement).getBoundingClientRect(); store.openBoard(id, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); }} title="Open board" aria-label="Open board"><Icon name="open" size={15} /></button>
    </div>
  </div>;
}

function Frame({ block, editing }: BlockProps) {
  return <InlineText className="frame-title" value={block.data.title ?? ''} placeholder="Frame" editing={editing} onCommit={title => setData(block.id, { title })} />;
}

export function registerCoreBlocks() {
  registerBlock({ type: 'note', label: 'Note', icon: 'note', key: 'n', render: Note, resizable: true, autoHeight: true, defaults: () => ({ w: 240, h: 140, data: { html: '' } }) });
  registerBlock({ type: 'todo', label: 'Checklist', icon: 'todo', key: 't', render: Todo, resizable: true, autoHeight: true, defaults: () => ({ w: 240, h: 180, data: { title: '', items: [{ id: uid(), text: '', done: false }] } }) });
  registerBlock({ type: 'link', label: 'Link', icon: 'link', key: 'l', render: LinkB, resizable: true, defaults: () => ({ w: 260, h: 96, data: { url: '', title: '' } }) });
  registerBlock({ type: 'board', label: 'Board', icon: 'board', key: 'b', render: Portal, resizable: true, defaults: () => ({ w: 200, h: 150, data: {} }) });
  registerBlock({ type: 'frame', label: 'Frame', icon: 'frame', key: 'f', render: Frame, resizable: true, defaults: () => ({ w: 480, h: 320, data: { title: 'Frame' } }) });
  registerBlock({ type: 'image', label: 'Image', icon: 'image', render: ImageB, resizable: true, defaults: () => ({ w: 260, h: 220, data: {} }) });
  registerBlock({ type: 'file', label: 'File', icon: 'file', render: FileB, resizable: true, defaults: () => ({ w: 260, h: 72, data: {} }) });
}
