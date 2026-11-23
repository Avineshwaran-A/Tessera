import type { ComponentType } from 'react';
import type { Block } from './model';

export interface BlockProps { block: Block; selected: boolean; editing: boolean; }
export interface BlockDef {
  type: string; label: string; icon: string; key?: string;
  defaults: () => { w: number; h: number; data: Record<string, any> };
  render: ComponentType<BlockProps>;
  resizable?: boolean; autoHeight?: boolean;
}
export interface CommandDef { id: string; title: string; shortcut?: string; run: () => void; }

const blocks = new Map<string, BlockDef>();
const commands = new Map<string, CommandDef>();
type Fn = (p: any) => void;
const listeners = new Map<string, Set<Fn>>();

export const registerBlock = (d: BlockDef) => { blocks.set(d.type, d); };
export const getBlockDef = (t: string) => blocks.get(t);
export const allBlockDefs = () => [...blocks.values()];
export const registerCommand = (c: CommandDef) => { commands.set(c.id, c); };
export const allCommands = () => [...commands.values()];

export const bus = {
  on(ev: string, fn: Fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev)!.add(fn); return () => listeners.get(ev)!.delete(fn); },
  emit(ev: string, p?: any) { listeners.get(ev)?.forEach(f => f(p)); },
};
