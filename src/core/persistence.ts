import type { Workspace } from './model';
const KEY = 'tessera.workspace.v1';
const DB = 'tessera-blobs';

/** Present when running inside the desktop shell (electron/preload.cjs). */
export interface NativeBridge {
  platform: string;
  loadWorkspace(): string | null;
  saveWorkspace(text: string): Promise<boolean>;
  saveWorkspaceSync(text: string): boolean;
  exportWorkspace(text: string): Promise<boolean>;
  importWorkspace(): Promise<string | null>;
  revealData(): Promise<string>;
  onCommand(cb: (id: string) => void): () => void;
  info(): { version: string; dataDir: string; dev: boolean };
  quit(): void;
  window: {
    minimize(): void; toggleMaximize(): void; close(): void; toggleFullscreen(): void; toggleDevTools(): void;
    state(): { maximized: boolean; fullscreen: boolean };
    onState(cb: (s: { maximized: boolean; fullscreen: boolean }) => void): () => void;
    onFocus(cb: (focused: boolean) => void): () => void;
  };
}
declare global { interface Window { tesseraNative?: NativeBridge; } }
export const native = typeof window !== 'undefined' ? window.tesseraNative : undefined;
export const isDesktop = !!native;

export function loadWorkspace(): Workspace | null {
  try {
    if (native) {
      const t = native.loadWorkspace();
      if (t) return JSON.parse(t);
      // first desktop launch: adopt anything the web build left in this profile
      const legacy = localStorage.getItem(KEY); return legacy ? JSON.parse(legacy) : null;
    }
    const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
/** Desktop: atomic file write in the app data folder. Web: localStorage. */
export async function saveWorkspace(ws: Workspace): Promise<boolean> {
  const text = JSON.stringify(ws);
  if (native) return native.saveWorkspace(text).catch(() => false);
  try { localStorage.setItem(KEY, text); return true; } catch { return false; }
}
/** Synchronous flush used when the window is closing. */
export function saveWorkspaceNow(ws: Workspace) {
  const text = JSON.stringify(ws);
  if (native) native.saveWorkspaceSync(text); else try { localStorage.setItem(KEY, text); } catch {}
}

let dbp: Promise<IDBDatabase> | null = null;
function db() {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const q = fn(d.transaction('blobs', mode).objectStore('blobs')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export const putBlob = (id: string, b: Blob) => tx('readwrite', s => s.put(b, id));
export const getBlob = (id: string) => tx<Blob | undefined>('readonly', s => s.get(id));
export const deleteBlob = (id: string) => tx('readwrite', s => s.delete(id));
