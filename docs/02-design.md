# 02 — Tessera: Independent Product Design

**Name:** Tessera. A tessera is a single tile in a mosaic: every block is a tile, and every board is a mosaic.

## Identity
- Light theme is a warm paper canvas (`#f4f1ea`) with a faint dot grid. Dark theme is graphite (`#1b1a18`).
- The single accent is vermilion ink (`#d9482b`), used for selection, connections and focus.
- Type: board titles are set in a serif (Fraunces), the UI in Inter, metadata in a monospace.
- Blocks are flat tiles with a 1px hairline border and a coloured *edge tab* on the left instead of a coloured fill.

## Structure (differs deliberately from the reference)
| Area | Tessera approach |
|------|------------------|
| Navigation | Persistent **Atlas** tree on the left (collapsible) plus a breadcrumb trail. Board portals show a mini-map of their contents. |
| Creation | A floating **Dock** at the bottom center. Double-clicking empty canvas creates a note. Paste and drop are supported. |
| Grouping | **Frames**: spatial regions. Anything inside moves with the frame. They replace columns. |
| Connections | **Threads**: drag from a block's handle (●) to another block. Click a thread to label or delete it. |
| Commands | `Ctrl/⌘+K` **Palette**: run commands, search every block in every board, jump to it. |
| Keyboard | `N` note, `T` todo, `B` board, `F` frame, `Del` delete, `Ctrl+D` duplicate, `Ctrl+Z/Shift+Z` undo/redo, `Ctrl+A` select all, Space+drag or middle-drag to pan, `Ctrl+wheel` to zoom. |
| Persistence | Automatic and debounced to localStorage. Binary blobs go to IndexedDB. A status pill shows "Saved". |
