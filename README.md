# Excalidraw QA

An independent QA project on [Excalidraw](https://github.com/excalidraw/excalidraw), the open-source canvas whiteboard editor. I chose it because it is a complex, editing-heavy product: drawing, selecting, transforming, undo/redo, autosave and export, all on a `<canvas>`.

The goal is to show a full QA cycle on an editor: risk analysis, test planning, exploratory testing, defect reporting, and targeted browser automation.

> This is a personal project on open-source software. It is not affiliated with or endorsed by the Excalidraw project. Expected behaviour is inferred from the documentation, existing upstream tests, and how the product behaves, not from internal requirements.

## Status

| Phase | What | Status |
|-------|------|--------|
| 1 | Risk map, test strategy, test plan | Done (draft) |
| 2 | Exploratory sessions, test case execution, bug reports | Done |
| 3 | Playwright + TypeScript suite, GitHub Actions CI | Done (pending first green CI run) |
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
tests/                    Playwright + TypeScript suite
  specs/                  undo-redo, autosave, export-import, transform,
                          selection-grouping, copy-paste-duplicate
  pages/CanvasPage.ts     Page object: draw, select, read the scene from localStorage
  fixtures/base.ts        Clean browser state per test
.github/workflows/e2e.yml CI pipeline
```

## Version tested

Note this in before any results are recorded, and update it if you re-test on a newer version.

| Item | Value |
|------|-------|
| Excalidraw commit | `2b9da9610083254edaec68871d593fb6b08e9072` |
| Commit date | 2026-09-22 |
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

Requires Node 18 or newer and Yarn. To match the results here, run `git checkout 2b9da9610083254edaec68871d593fb6b08e9072` first.

## Run the automated suite

With Excalidraw running (see above):

```bash
cd tests
npm ci
npx playwright install chromium
npm run test:smoke        # @smoke: failure means "do not merge / users lose work"
npm run test:regression   # @regression: everything else
npm test                  # both
npm run report            # open the HTML report
```

Set `BASE_URL` if the app is not on `http://localhost:3001`. Each test has exactly one tag.

## CI

`.github/workflows/e2e.yml` checks out Excalidraw at the pinned commit, starts it, and runs the suite on Chromium:

| Trigger | Runs |
|---------|------|
| Push to `main` | `@smoke` only |
| Manual (Actions tab) | `@regression`, with a `repeat` count (use 5 to check the "no flakes" exit criterion) |
| Nightly, 02:00 UTC | `@regression` (currently disabled, commented out in the workflow) |

Playwright reports, traces, screenshots and videos are uploaded as artifacts (kept 14 days). CI uses 1 worker and 2 retries; a test that passes only on retry is flagged flaky in the report.

To bump the Excalidraw version under test, change `EXCALIDRAW_SHA` in the workflow and the table above together, then re-run with `repeat: 5`.

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


