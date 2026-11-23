import { store, makeBlock } from './store';
import { putBlob } from './persistence';
import { uid, ID } from './model';
import type { Block } from './model';

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise(res => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(u); }; i.onerror = () => res({ w: 260, h: 200 }); i.src = u; });
}

/** Turn dropped/pasted files and text into blocks on a board, laid out in a cascade from (x,y). */
export async function captureInto(boardId: ID, x: number, y: number, files: File[], text?: string) {
  const blocks: Block[] = [];
  let ox = 0;
  for (const f of files) {
    const blobId = uid();
    await putBlob(blobId, f);
    if (f.type.startsWith('image/')) {
      const { w, h } = await imageSize(f); const W = Math.min(320, w); const H = Math.round((h / w) * W) + 34;
      blocks.push(makeBlock(boardId, 'image', x + ox, y, W, H, { blobId, name: f.name, caption: '' }));
      ox += W + 24;
    } else {
      blocks.push(makeBlock(boardId, 'file', x + ox, y, 260, 72, { blobId, name: f.name, size: f.size, mime: f.type }));
      ox += 284;
    }
  }
  if (text?.trim()) {
    const t = text.trim();
    if (isUrl(t)) blocks.push(makeBlock(boardId, 'link', x + ox, y, 260, 96, { url: t, title: '' }));
    else blocks.push(makeBlock(boardId, 'note', x + ox, y, 240, Math.min(400, 60 + t.length / 1.6), { html: esc(t).replace(/\n/g, '<br>') }));
  }
  blocks.forEach((b, i) => (b.z += i));
  if (blocks.length) { store.dispatch({ type: 'block/add', blocks }); store.setUI({ selection: blocks.map(b => b.id) }); }
}
