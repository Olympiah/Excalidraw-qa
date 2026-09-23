# Excalidraw QA

An independent QA project on [Excalidraw](https://github.com/excalidraw/excalidraw), the open-source canvas whiteboard editor. I chose it because it is a complex, editing-heavy product: drawing, selecting, transforming, undo/redo, autosave and export, all on a `<canvas>`.

The goal is to show a full QA cycle on an editor: risk analysis, test planning, exploratory testing, defect reporting, and targeted browser automation.

> This is a personal project on open-source software. It is not affiliated with or endorsed by the Excalidraw project. Expected behaviour is inferred from the documentation, existing upstream tests, and how the product behaves, not from internal requirements.

## Status

| Phase | What | Status |
|-------|------|--------|
| 1 | Risk map, test strategy, test plan | Done (draft) |
| 2 | Exploratory sessions, test case execution, bug reports | In progress |
| 3 | Playwright + TypeScript suite, GitHub Actions CI | Planned |
| 4 | Case study write-up | Planned |

## What is in this repo

```
docs/
  01-risk-map.md          Where the product is most likely to fail, and why
  02-test-strategy.md     Approach: exploratory, automation, assertions on canvas
  03-test-plan.md         Scope, environment, schedule, entry/exit criteria, risks
  sample-bug-report-sanitized.md   Illustrative bug report (fictional app)
test-cases/
  Excalidraw_Test_Cases.xlsx       22 test cases + summary of execution status
bug-reports/
  _TEMPLATE.md            Bug report template
tests/                    (Phase 3) Playwright suite
```

## Version tested

Note this in before any results are recorded, and update it if you re-test on a newer version.

| Item | Value |
|------|-------|
| Excalidraw commit | `<paste output of git rev-parse HEAD>` |
| Commit date | `<YYYY-MM-DD>` |
| Browser | Chromium `<version>` |
| OS | Windows 11 |


Manual sessions on the hosted app (excalidraw.com) record the date and browser version instead of a commit, since the hosted app changes over time. Bugs found there are reproduced on a local build before being reported.

## Run Excalidraw locally

Clone Excalidraw **outside** this repo:

```bash
git clone https://github.com/excalidraw/excalidraw.git
cd excalidraw
git rev-parse HEAD        # record this above
yarn install
yarn start                # http://localhost:3001 (port may differ; check the terminal)
```

Requires Node 18 or newer and Yarn.

## How to use the test cases

1. Open `test-cases/Excalidraw_Test_Cases.xlsx`.
2. Start each test from a clean state (fresh browser profile or cleared site data).
3. Follow the numbered Test Steps and compare with the Expected Result.
4. Record what actually happened in Actual Result, and set Status to Pass, Fail, Blocked or Skipped.
5. For a Fail, write a bug report from `bug-reports/_TEMPLATE.md` with a screen recording, and search Excalidraw's GitHub issues for duplicates before reporting upstream.

Expected results marked "(verify)" are assumptions to be confirmed while exploring, not established facts.

## Findings

_To be filled in after Phase 2. Each real defect will link to its bug report and, where reported, the upstream issue._

| ID | Area | Severity | Summary | Upstream issue |
|----|------|----------|---------|----------------|
| | | | | |

## Out of scope

Live collaboration and encryption, AI / text-to-diagram features, native mobile behaviour, and performance or load testing.

## Links

- Blog: https://myblogsaboutsoftwarequalityassurance.blogspot.com/
- LinkedIn: https://www.linkedin.com/in/olympiah-otieno


