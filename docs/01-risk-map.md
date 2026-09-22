# Excalidraw: Risk Map (Phase 1 draft)

**Product under test:** Excalidraw, open-source canvas whiteboard editor (web app, `excalidraw-app`)
**Author:** Oly · **Status:** DRAFT for review · **Scope:** browser (Chromium first; Firefox/WebKit later)

## 1. What I checked before writing this

Findings from reading the repo (not assumptions):

- The project already has ~49 Vitest/Testing Library component-test files in `packages/excalidraw/tests` (history, drag, rotate, flip, clipboard, export, library, lasso...).
- I found **no Playwright/Cypress config** in the root or app `package.json`. Real-browser, end-to-end coverage of full user flows is the visible gap this project fills.
- Scene data persists to `localStorage` under the key `excalidraw` (app state under `excalidraw-state`), so I can assert on saved state instead of only pixels.
- Toolbar buttons expose `data-testid="toolbar-*"` attributes, which gives stable selectors for tools.
- Shapes render on `<canvas>`, so they cannot be located as DOM elements. This is the main testing challenge and shapes the whole strategy.

Anything below marked **(verify)** is a hypothesis to confirm in Phase 2 exploratory sessions.

## 2. How risk is scored

Risk = **Impact** (what a user loses) × **Likelihood** (how complex/fragile the area is). Scale 1 to 3 each, so scores run 1 to 9.

## 3. Risk map

| # | Area | What could go wrong | Impact | Likelihood | Score | Approach |
|---|------|---------------------|:------:|:----------:|:-----:|----------|
| 1 | **Autosave and reload persistence** | Work lost or corrupted after refresh, tab crash, or rapid edits | 3 | 2 | **6** | Automate (E2E) + exploratory |
| 2 | **Undo / redo** | History skips, duplicates, or reverts the wrong change, especially across multi-step edits and selection changes | 3 | 3 | **9** | Automate + exploratory |
| 3 | **Selection, multi-select, grouping** | Wrong elements selected, group breaks on ungroup, selection lost after transform | 2 | 3 | **6** | Exploratory first, then automate |
| 4 | **Transform: move / resize / rotate / flip** | Element drifts, wrong size after resize with shift/alt, rotation snaps wrongly | 2 | 3 | **6** | Automate (assert on scene JSON) |
| 5 | **Export / import** (PNG, SVG, `.excalidraw`, clipboard) | Exported file differs from canvas, scene fails to re-import, background/scale options ignored | 3 | 2 | **6** | Automate (round-trip) + visual |
| 6 | **Copy / paste / duplicate** | Pasted elements offset wrongly, lose binding, or paste into wrong position | 2 | 2 | **4** | Exploratory + light automation |
| 7 | **Text and arrow binding** | Arrows detach from shapes when shapes move; text edit loses content or focus | 2 | 3 | **6** | Exploratory (verify) |
| 8 | **Keyboard shortcuts** | Shortcut collisions, tools not switching, shortcuts firing while typing in text | 2 | 2 | **4** | Automate (data-driven) |
| 9 | **Zoom / pan / viewport** | Zoom drifts, elements mis-hit after zoom, pan breaks on trackpad/wheel | 2 | 2 | **4** | Exploratory + visual |
| 10 | **Style panel** (stroke, fill, font) | Style applied to wrong selection, mixed-selection states shown incorrectly | 2 | 2 | **4** | Exploratory |
| 11 | **Library and image insert** | Uploaded image fails, library items corrupt on reuse | 2 | 2 | **4** | Exploratory |
| 12 | **Cross-browser / responsive** | Behaviour differs on Firefox/WebKit or small viewport | 2 | 2 | **4** | Playwright projects (Phase 3+) |
| 13 | **Accessibility of core flows** | Keyboard-only users cannot reach or operate tools | 2 | 2 | **4** | Exploratory + axe scan |
| 14 | **Collaboration** (live rooms) | Sync conflicts, lost updates | 3 | 3 | **9** | **Out of scope** (needs a server and multiple clients; noted as future work) |

## 4. Top risks that drive the plan

1. **Undo/redo (9)**: most complex state logic, biggest user-visible damage.
2. **Autosave/persistence (6)** and **export/import (6)**: data loss and data integrity.
3. **Selection/transform (6)**: the core "editing" experience Readymag-style products depend on.

Collaboration scores highest on paper but is excluded deliberately: it needs infrastructure I would not represent honestly in a portfolio-scale project. Saying so in the write-up is part of the point.

## 5. Out of scope

- Live collaboration and end-to-end encryption
- AI / text-to-diagram features
- Mobile native behaviour (desktop viewport first)
- Load and performance testing
