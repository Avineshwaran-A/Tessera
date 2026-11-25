export type ID = string;
export type BlockType = 'note' | 'todo' | 'image' | 'file' | 'link' | 'board' | 'frame' | (string & {});

export interface Board { id: ID; title: string; parentId: ID | null; createdAt: number; }
export interface Block {
  id: ID; boardId: ID; type: BlockType;
  x: number; y: number; w: number; h: number; z: number;
  color?: string;
  data: Record<string, any>;
}
export type ThreadStyle = 'curve' | 'straight' | 'elbow';
export type ThreadArrows = 'end' | 'both' | 'none';
export interface Thread {
  id: ID; boardId: ID; from: ID; to: ID; label?: string;
  /** user-dragged waypoint, as an offset from the midpoint between the two block centres; absent = automatic shape */
  bend?: { x: number; y: number };
  /** any number of user waypoints (offsets from the centres' midpoint), in order from `from` to `to`; supersedes `bend` */
  points?: { x: number; y: number }[];
  style?: ThreadStyle;   // default 'curve'
  arrows?: ThreadArrows; // default 'end'
}
export interface Workspace {
  version: 1; rootId: ID;
  boards: Record<ID, Board>;
  blocks: Record<ID, Block>;
  threads: Record<ID, Thread>;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function emptyWorkspace(): Workspace {
  const rootId = uid();
  return { version: 1, rootId, boards: { [rootId]: { id: rootId, title: 'Home', parentId: null, createdAt: Date.now() } }, blocks: {}, threads: {} };
}

export const PALETTE = ['#d9482b', '#e0a526', '#3f8f5a', '#2f6db5', '#8a4fb0', '#6b6b6b'];
