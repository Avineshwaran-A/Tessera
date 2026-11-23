# 03 — Architecture

```
src/
  core/        framework-free domain layer (no React)
    model.ts        types: Workspace, Board, Block, Thread
    store.ts        state container: actions -> immutable updates, undo/redo, subscribe
    persistence.ts  autosave (localStorage) + blob store (IndexedDB)
    registry.ts     extension points: block types, commands, event bus
    api.ts          serialisable Action API (window.tessera) for agents/MCP/REA
  canvas/      viewport, pan/zoom, drag/resize, marquee, threads
  blocks/      one component per block type, registered via registry
  ui/          Atlas (tree), Breadcrumbs, Dock, Palette, StatusPill
```

## Principles
- **One source of truth.** `store.dispatch(action)` is the only way to mutate state. Actions are plain JSON, so an AI agent, an MCP server or a REA pipeline can send the same actions the UI sends (`window.tessera.dispatch`, `window.tessera.query`).
- **Block registry.** A new block type means one call, `registerBlock({type, label, defaults, render})`. The canvas never switches on block type.
- **Command registry.** The Palette and keyboard shortcuts read from `registerCommand`. Integrations add commands the same way.
- **Event bus.** `bus.on('action', fn)` sees every dispatched action, which is the hook point for sync, telemetry and assistant observers.
- **Persistence adapter.** `persistence.ts` exposes `load/save/putBlob/getBlob`. It can be swapped for a server backend without touching the UI.

## Future integration seams
| Integration | Seam |
|------------|------|
| AI assistant | Register commands (e.g. "Summarise board"). Read `api.query.board(id)`, write via `dispatch`. |
| GitHub MCP | A `link` block subtype, or a new `github` block registered via the registry. An MCP bridge maps tool calls to actions. |
| REA engine | A `rea-report` block type plus commands that import Evidence bundles as boards/threads. |
