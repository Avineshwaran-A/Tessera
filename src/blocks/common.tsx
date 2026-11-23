import { useEffect, useRef, useState } from 'react';
import { getBlob } from '../core/persistence';
import { store } from '../core/store';

export const setData = (id: string, data: Record<string, any>) => store.dispatch({ type: 'block/update', id, patch: {}, data });

export function useBlobUrl(blobId?: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blobId) return; let u: string | undefined; let live = true;
    getBlob(blobId).then(b => { if (b && live) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [blobId]);
  return url;
}

/** Inline single-line text that becomes editable when `editing`. Commits on blur. */
export function InlineText({ value, editing, onCommit, placeholder, className }: { value: string; editing: boolean; onCommit: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing) return <div className={className}>{value || <span className="ph">{placeholder}</span>}</div>;
  return <input data-nodrag autoFocus className={className + ' inline-input'} value={v} placeholder={placeholder}
    onChange={e => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key !== 'Escape') e.stopPropagation(); }} />;
}

/** Rich text area (bold/italic/lists via browser shortcuts). */
export function RichText({ html, editing, onCommit }: { html: string; editing: boolean; onCommit: (h: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ html, onCommit }); latest.current = { html, onCommit };
  useEffect(() => { if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html; }, [html]);
  // commit when leaving edit mode, before anything can reset the DOM
  useEffect(() => { if (!editing) return; const el = ref.current; return () => { if (el && el.innerHTML !== latest.current.html) latest.current.onCommit(el.innerHTML); }; }, [editing]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); const r = document.createRange(); r.selectNodeContents(ref.current); r.collapse(false); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); } }, [editing]);
  return <div ref={ref} className={'rich' + (editing ? ' editing' : '')} data-nodrag={editing || undefined} contentEditable={editing} suppressContentEditableWarning
    onBlur={e => { const h = e.currentTarget.innerHTML; if (h !== html) onCommit(h); }}
    onKeyDown={e => e.key !== 'Escape' && e.stopPropagation()} data-placeholder="Write something…" />;
}

export const fmtSize = (n = 0) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
