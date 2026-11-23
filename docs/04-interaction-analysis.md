# 04 — Interaction & Motion Analysis → Tessera Motion Spec

## Method and coverage
- **First pass:** REA `capture_browser_scenario` ran on milanote.com in a launched Chromium (motion not reduced) and completed cleanly. The public site is marketing pages only. **The workspace canvas requires a signed-in account.** No account was created and no sign-in was attempted, so no live canvas trace (event listeners, timing curves) was captured.
- The first table below comes from Milanote's publicly documented and demonstrated behavior: help-centre articles, product demos, and general knowledge of the app. Its timings are our own design values. Measured values are in the last section.
- **Live trace (2026-11-22):** the user signed in to the browser pane, and the canvas was traced on a throwaway board, *"Tessera test (safe to delete)"*. REA could not attach because the pane exposes no debugging endpoint, so the trace used read-only in-page instrumentation: a MutationObserver plus a per-frame sampler of layout, transform, opacity and box-shadow, and reading computed styles and stylesheets. Only behavior and timings were recorded. No source or assets were copied. About 10 cross-origin stylesheets were unreadable.

## Reference behaviors observed → what we keep / change
| Area | Reference behavior | Tessera decision |
|---|---|---|
| Card drag | Card lifts on grab (shadow grows) and follows the pointer 1:1. | Keep the 1:1 follow. Lift = scale 1.025 + deep shadow + **velocity tilt** (±4°) that springs back on drop. |
| Positioning | Cards snap to an invisible grid. | 8px grid snap, plus **smart alignment guides** (edges and centers of nearby blocks) that take priority over the grid. Alt disables snapping. |
| Drop settle | Card settles into place. | Drop eases the last few pixels with `--ease-out` over 180ms, and the lift releases with a spring curve. |
| Drop into board | Dropping a card on a board card moves it inside. | Same, plus the target board card highlights while hovered and shows a "Move into" chip. The moved cards animate into the portal. |
| Grouping | Columns that reflow cards. | Frames (spatial). They highlight when a dragged block will land inside them, and their contents travel with them. |
| Board navigation | Opening a board transitions into it. | **Zoom-through:** the canvas scales out from the portal's screen position when entering, and in the reverse direction when going up. 260ms. |
| Pan | Drag the background / scroll the wheel. | Space+drag, middle-drag, wheel. **Inertial glide** after release, with exponential decay (friction 0.92 per frame). |
| Zoom | Toolbar and pinch/ctrl-wheel, anchored to the cursor. | Ctrl-wheel stays 1:1 and anchored to the cursor. Buttons, reset, zoom-to-fit and search jumps **tween** at 240ms. |
| Resize | Corner handle. | Grid-snapped resize. **Images keep their aspect ratio** (Shift frees it). Live size readout. |
| Create | Card appears where it is placed. | Pop-in (scale 0.94 → 1, fade) over 200ms, only for newly created blocks, never on reload or navigation. |
| Keyboard | — | Arrow keys nudge by 1px; Shift+arrow nudges by one grid step. |

## Motion system (tokens)
| Token | Value | Use |
|---|---|---|
| `--ease-out` | cubic-bezier(.2,.8,.2,1) | settles, zoom tweens, UI entry |
| `--ease-spring` | cubic-bezier(.34,1.56,.64,1) | lift release, pop-in |
| `--t-fast` | 120ms | hover, handles |
| `--t-med` | 200ms | settle, pop-in |
| `--t-slow` | 260ms | board transitions |

Rules:
- Nothing animates while it is under direct manipulation; it follows the pointer exactly.
- Animation only communicates a change of state: lift, settle, enter, or a destination.
- `prefers-reduced-motion` turns off tilt, inertia, tweens and transitions. Snapping and guides stay.

## Measured on the live canvas (test board)
| Behavior | Measured | Tessera response |
|---|---|---|
| Canvas model | `CanvasViewport` is a native scroll container. Zoom is a transform on `canvas-document`. | Kept our single transformed layer: it allows inertial glide and zoom anchored to the cursor. |
| Drag start | Original element collapses. A **preview copy** renders in a separate drag layer with an initial shadow that grows to a lifted shadow. The workspace gets an `is-dragging` state. | Same lift idea in place (scale, shadow, our own 2D velocity tilt). No separate layer is needed in a single-transform canvas. |
| Drop placement | Positions snap to a **10px grid** on drop (e.g. 310, 310). The card follows the pointer freely during the drag. | **Changed:** cards now follow the pointer 1:1 (magnetic alignment guides only) and snap to our 8px grid **on drop**. |
| Drop settle | The remaining offset **halves every frame** (`translate3d` 1px → 0.5 → 0.25 …, about 6–8 frames) while a small **3D tilt** (rotateX/rotateY ≈1°) relaxes. | Settle uses the existing 200ms ease-out left/top transition, which has the same "last few px glide" feel. We keep a 2D tilt so the look stays our own. |
| Drop on breadcrumb | During a drag the breadcrumb becomes a **drop target** (`can-drop`), so cards can move to an ancestor board. | **Added, extended:** breadcrumbs *and every Atlas tree row* accept dropped cards. The row highlights, the cards shrink away, and a toast confirms. |
| Note resize | Notes resize **width only**. Height follows content. The width is fractional while dragging and committed as whole pixels. The viewport locks the cursor (`resizing-element`). | **Changed:** notes and checklists are now auto-height with a width-only side handle. Other blocks keep corner resize. |
| Resize handle | Hidden (opacity 0) until hover/selection. Fades in at 100ms linear. | Matches our 120ms handle fade. |
| Column grouping | Hovering a column highlights its empty placeholder. On drop the card reflows into the list instantly, takes the column width, and the count updates. | Frames highlight only when being entered (already built). |
| Micro-timing | Hover/handle transitions 100ms. Grid fade 600ms linear. Workspace dim 250ms linear. | Our tokens: 120 / 200 / 260ms. |
| Creation | Cards are created by dragging a tool from the left toolbar onto the canvas (drag shadow). | Not adopted yet. Tessera places at the view center or by double-click. Candidate for later. |
