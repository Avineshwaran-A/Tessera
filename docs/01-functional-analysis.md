# 01 — Functional Analysis of the Reference Product (Milanote)

Sources: Milanote's public product/marketing pages (milanote.com/product, read in a browser), its public help-centre concepts, and general public knowledge of how the product works. No proprietary code, assets, private APIs or branding were looked at or copied. REA's live-page inspector needs a CDP endpoint attached to a session, so for this phase the analysis was done on public pages only. Bundle-level REA analysis (`analyze_web_bundle`, `trace_application_feature`) is left as a future integration point (see 03-architecture.md).

## 1. Product positioning
A visual workspace where creative work is organised on boards instead of in documents. It is used for moodboards, brainstorming, storyboards, creative writing hubs, visual project management, whiteboarding, mind maps, vision boards and collages. All of these use cases are built from the same primitives.

## 2. Core capability inventory
| # | Capability | Observed behaviour | Depends on |
|---|-----------|--------------------|------------|
| C1 | Boards | A titled freeform canvas. The top-level "home" board holds everything. | — |
| C2 | Nested boards | A board placed on a board acts as a card; opening it goes inside it. Breadcrumbs show the path. Nesting depth is unlimited. | C1 |
| C3 | Free placement | Cards sit at arbitrary x/y, can be dragged, and some can be resized. | C1 |
| C4 | Notes | Rich text cards (basic formatting) that grow to fit their text. | C3 |
| C5 | To-do lists | Checklist cards. | C3 |
| C6 | Images | Images added by upload, drag-and-drop or paste. Shown inline with a caption. | C3, storage |
| C7 | Files | Any file can be attached as a card that shows its name/type and can be downloaded. | C3, storage |
| C8 | Links | A pasted URL becomes a link card (preview). | C3 |
| C9 | Columns / grouping | A vertical container cards can be stacked into. It moves as a unit. | C3 |
| C10 | Connections | Lines/arrows between cards, used for mind maps and flows. Optional labels. | C3 |
| C11 | Colour | Cards and boards can be colour-coded. | — |
| C12 | Templates | Starter boards for common workflows. | C1–C10 |
| C13 | Search | Find content across boards. | all |
| C14 | Autosave | No save button. Every change is saved straight away. | storage |
| C15 | Collaboration/sharing | Real-time multi-user editing, comments, public links. | backend (out of scope for v1) |
| C16 | Clients | Web, desktop, mobile, iPad, web clipper. | — |
| C17 | Undo / multi-select / duplicate / trash | Standard editing affordances. | C3 |

## 3. Primary user workflows
1. **Capture:** drop or paste images, files and links onto a board, or type a note.
2. **Arrange:** drag cards into spatial clusters, stack related items in a column.
3. **Structure:** turn a cluster into a sub-board, then navigate in and out.
4. **Relate:** draw connections between ideas.
5. **Find:** search across all boards, jump to a result.
6. **Plan:** track tasks with to-dos inside a board.

## 4. Interaction model (functional, not visual)
- Creating content: a toolbar of card types, drag-to-place, paste and drop.
- Selection: click, shift-click and box-select, then act on the group (move, delete, duplicate, colour).
- Navigation: breadcrumbs plus double-click/open on a board card.
- Persistence: implicit and continuous.

## 5. Limitations / gaps worth rethinking
- Columns are the only grouping primitive. Spatial frames are a more natural fit for "regions".
- Navigation is mostly breadcrumb-based. A persistent tree helps with deep nesting.
- There is no keyboard-first command surface.
- Capture is largely mouse-driven.
- Sharing and collaboration need a backend.

## 6. Extracted functional requirements (for our product)
- FR1 Hierarchical boards with unlimited nesting, and both tree and breadcrumb navigation.
- FR2 An infinite canvas with pan, zoom, drag, resize, multi-select and marquee select.
- FR3 Block types: note, todo, image, file, link, board-portal, group frame.
- FR4 Connections between any two blocks, with an editable label, deleted along with their endpoints.
- FR5 Groups (frames) that carry the blocks inside them when moved.
- FR6 Paste and drop capture for images, files, URLs and text.
- FR7 Autosave of all state including binary blobs, surviving reloads.
- FR8 Undo/redo, duplicate, delete, colour.
- FR9 Global search plus a command palette.
- FR10 An extension API (block registry, command registry, event bus, and a serialisable action API) so AI assistants, GitHub MCP and REA can drive the workspace later.
- Out of scope for v1: real-time collaboration, accounts, sharing (C15, C16).
