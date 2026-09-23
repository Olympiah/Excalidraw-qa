# Excalidraw: Test Strategy (Phase 1 draft)

**Author:** Oly · **Status:** DRAFT for review
Companion to `01-risk-map.md`.

## 1. Objective

Provide real-browser confidence in Excalidraw's highest-risk editing flows, and document how a QA engineer approaches a complex canvas-based editor: risk analysis, exploratory testing, targeted automation, and clear defect reporting.

## 2. Where this fits (test pyramid)

Excalidraw already has extensive unit and component tests (Vitest). This project deliberately does **not** duplicate them. It adds the layer above:

| Layer | Who covers it | This project |
|-------|---------------|--------------|
| Unit / component | Upstream (Vitest, ~49 test files) | Not duplicated |
| **E2E, real browser** | Gap | **Automated with Playwright** |
| **Exploratory** | - | **Session-based, documented** |
| Visual regression | Gap | Small, targeted set |

## 3. Approach by activity

### 3.1 Exploratory testing (Phase 2)
- Time-boxed sessions (45 to 60 min), each with a charter, notes, and findings.
- Planned charters:
  1. *Explore undo/redo across multi-step edits, selection changes, and grouping to discover history errors.*
  2. *Explore copy/paste/duplicate and export/import to discover data-integrity and positioning issues.*
  3. *Explore keyboard-only operation of core tools to discover accessibility and shortcut problems.*
- Every defect gets a bug report in my template (steps, expected vs actual, environment, evidence, severity/priority).
- Real, reproducible defects are reported upstream on Excalidraw's GitHub after checking for duplicates. No invented findings; if an area is solid, the write-up says so.

### 3.2 Automation (Phase 3), Playwright + TypeScript
**Core challenge:** shapes are drawn on `<canvas>`, so there is no DOM node per shape.

Assertion strategy, in order of preference:
1. **Scene data**: read the persisted scene — elements from `localStorage["excalidraw"]`, app state (selection, tool, zoom) from the separate `localStorage["excalidraw-state"]` — or exported `.excalidraw` JSON, and assert on element counts, types, positions, sizes, group ids. Fast, deterministic, meaningful.
2. **UI state**: toolbar `data-testid` selectors, active-tool state, properties panel values.
3. **Visual snapshots**: only for a small set of stable scenes (export output, a rendered scene at fixed viewport). Kept deliberately few to limit flakiness.

Interactions use real mouse/keyboard input (drag-to-draw, shift-click, shortcuts), because the point is to test the editor as a user does.

**Architecture** (same discipline as my OrangeHRM project):
- Page Object for the canvas and toolbar, with helpers like `drawRectangle(from, to)`, `getScene()`
- Fixtures for a clean scene per test (fresh browser context, cleared storage)
- Tags: `@smoke` (critical happy paths, fast) and `@regression` (full)
- GitHub Actions: smoke on every PR, full regression nightly, traces/screenshots/videos on failure

### 3.3 Planned automated coverage (first cut, ordered by risk score)
1. Undo/redo (draw, move, resize, delete, then undo/redo sequences)
2. Autosave: edit, reload, scene restored
3. Export/import round trip: export `.excalidraw`, import, scenes match
4. Transform: move, resize, rotate, flip verified against scene JSON
5. Selection and grouping
6. Keyboard shortcut map (data-driven table)
7. Copy/paste/duplicate

## 4. Environment

- Excalidraw run locally from a pinned commit (recorded in README) so results are reproducible and the public site is not loaded by test runs.
- Exploratory sessions use the public site (excalidraw.com) in light, low-volume manual use.
- Chromium first, then Firefox and WebKit via Playwright projects. Desktop viewport.

## 5. Entry / exit criteria

- **Entry:** app builds and starts locally; risk map approved.
- **Exit (per phase):** all planned charters executed and documented; automated suite green in CI on a clean run, repeated 5 times with no flakes before it is called stable; all found defects triaged.

## 6. Deliverables

| Phase | Deliverable |
|-------|-------------|
| 1 | Risk map, test strategy (this) |
| 2 | Charters and session notes, test cases, bug reports |
| 3 | Playwright suite + CI pipeline + README |
| 4 | Portfolio case study page |

## 7. Honest limitations

- Independent project on open-source software, not commissioned work.
- I do not have access to Excalidraw's internal requirements; expected behaviour is inferred from documentation, existing upstream tests, and product behaviour.
- Collaboration, performance, and native mobile are out of scope (see risk map).
