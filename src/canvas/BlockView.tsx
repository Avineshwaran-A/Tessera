import { useEffect, useRef, useState } from 'react';
import type { Block } from '../core/model';
import { getBlockDef } from '../core/registry';
import { fresh, store } from '../core/store';

interface P {
  block: Block; selected: boolean; editing: boolean; state: string;
  absorbTo?: { x: number; y: number };
  onPointerDown: (e: React.PointerEvent) => void; onDoubleClick: (e: React.MouseEvent) => void;
}
export function BlockView({ block, selected, editing, state, absorbTo, onPointerDown, onDoubleClick }: P) {
  // play the entry animation only for blocks created this session (not on reload/navigation)
  const [born, setBorn] = useState(() => fresh.has(block.id));
  const def = getBlockDef(block.type);
  const ref = useRef<HTMLDivElement>(null);
  const auto = !!def?.autoHeight;
  // auto-height blocks: the DOM decides the height; mirror it into the model for geometry (threads, snapping)
  useEffect(() => {
    if (!auto || !ref.current) return;
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const h = Math.round(ref.current?.offsetHeight ?? 0); const cur = store.ws.blocks[block.id];
      if (cur && h && Math.abs(h - cur.h) > 1) store.dispatch({ type: 'block/update', id: block.id, patch: { h } }, { record: false });
    }); });
    ro.observe(ref.current); return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [auto, block.id]);
  if (!def) return null;
  const R = def.render;
  return <div ref={ref} data-block={block.id}
    className={`block b-${block.type}${auto ? ' auto' : ''}${block.color ? ' tagged' : ''}${selected ? ' selected' : ''}${editing ? ' editing' : ''}${born ? ' born' : ''}${state}`}
    style={{ left: block.x, top: block.y, width: block.w, height: auto ? undefined : block.h, zIndex: block.type === 'frame' ? 0 : block.z, ['--tab' as any]: block.color,
      ...(absorbTo ? { ['--ax' as any]: absorbTo.x + 'px', ['--ay' as any]: absorbTo.y + 'px' } : {}) }}
    onAnimationEnd={e => { if (e.animationName === 'pop-in') { fresh.delete(block.id); setBorn(false); } }}
    onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
    {block.type === 'board' && <div className="sheets" aria-hidden="true"><i /><i /></div>}
    <div className="block-body" data-scroll={editing || undefined}><R block={block} selected={selected} editing={editing} /></div>
    {block.type !== 'frame' && <div className="handle" data-handle title="Drag to connect" />}
    {def.resizable && <div className="resize" data-resize />}
  </div>;
}
