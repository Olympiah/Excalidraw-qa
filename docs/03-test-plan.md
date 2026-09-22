# Test Plan: Excalidraw Editor (Web)

> **Author:** Oly · **Status:** DRAFT · Companion to `01-risk-map.md` and `02-test-strategy.md`. Schedule dates to be set.

## Objective
- Verify that Excalidraw's highest-risk editing flows (undo/redo, autosave, export/import, selection and transforms) behave as expected in a real browser.
- Demonstrate a complete QA cycle on a canvas-based editor: risk analysis, exploratory testing, targeted automation, and defect reporting.

## Scope
**In scope**
- Drawing tools (rectangle, ellipse, diamond, arrow, line, text, freedraw)
- Selection, multi-select, grouping
- Move, resize, rotate, flip
- Undo / redo
- Copy, paste, duplicate
- Autosave and reload persistence
- Export / import (`.excalidraw`, PNG, SVG)
- Keyboard shortcuts
- Zoom and pan
- Style panel (stroke, fill, font)

**Out of scope**
- Live collaboration and end-to-end encryption
- AI / text-to-diagram features
- Native mobile behaviour
- Performance and load testing
- Third-party integrations

## Test Environments
| Item | Detail |
|------|--------|
| OS | Windows 11 (primary); Linux (CI) |
| Browsers | Chromium (primary); Firefox, WebKit (Phase 3+) |
| Viewport | Desktop 1280×720 |
| Test environment | Excalidraw built locally from a pinned commit (recorded in README); `excalidraw.com` for light exploratory use only |
| Access credentials | None required |
| Test data | Small `.excalidraw` fixture scenes stored in `tests/fixtures/` |

## Defect Reporting Procedure
- **Tool:** GitHub Issues in this repo for tracking; confirmed, reproducible defects are also reported upstream on Excalidraw's GitHub after a duplicate check.
- **Bug lifecycle:** Triage → Reported → Fixed (upstream) → Verified → Closed
- **Severity/Priority:** Urgent / High / Medium / Low (definitions in `bug-reports/_TEMPLATE.md`)
- **Format:** every bug uses the repo bug report template, with the optional Root Cause Analysis and Recommended Fix sections filled in only where supportable.
- **Escalation:** upstream maintainers via the GitHub issue; nothing is escalated without reproduction steps and evidence.

## Test Strategy
- **Types of testing:** Functional, Regression, Exploratory, targeted Visual
- **Manual vs automation:** exploratory sessions manually; repeatable high-risk flows automated with Playwright + TypeScript
- **Assertions:** scene data first (`localStorage["excalidraw"]`, exported JSON), UI state second, visual snapshots sparingly (canvas shapes are not DOM nodes)
- **Test data management:** fresh browser context and cleared storage per test; fixture scenes checked in
- **Pass/fail criteria:** a test passes when scene data and UI state match the expected result; any deviation is a fail and is triaged as a defect or a test issue
- Full detail: `02-test-strategy.md`

## Test Schedule
| Task | Dates |
|------|-------|
| Creating Test Plan | _TBD_ |
| Test Case Creation | _TBD_ |
| Test Case Execution (exploratory + automated) | _TBD_ |
| Summary Report Submission | _TBD_ |

## Test Deliverables
- Test Plan (this document)
- Risk Map and Test Strategy
- Test Cases (with traceability to risk map items)
- Exploratory session notes
- Bug Reports and Defect Log
- Playwright test suite + CI pipeline
- Final QA Summary Report

## Entry and Exit Criteria
**Entry**
- Excalidraw builds and runs locally from the pinned commit
- Test data and fixtures available
- Test plan and risk map reviewed

**Exit**
- All planned charters executed and documented
- Automated suite green in CI, repeated 5 runs without flakes
- All critical defects reported or documented with reason if not reproducible
- Summary report submitted

## Test Execution
**Entry:** approved test cases and plan; environment ready
**Exit:** all test cycles completed and results reviewed

## Test Closure
- Lessons learned
- Metrics summary (defects found, reported upstream, confirmed fixed, reopened)
- Sign-off: self-review against exit criteria (independent project, no separate QA Lead)

**Entry:** final regression run completed
**Exit:** summary report published in the repo README and portfolio case study

## Tools
- Automation: Playwright + TypeScript
- CI: GitHub Actions
- Defect tracking: GitHub Issues
- Evidence capture: Jam.dev, Playwright traces and videos

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Canvas content cannot be located via the DOM | High | Assert on scene data; keep visual snapshots few and stable |
| Flaky tests from timing and rendering | High | Assert on state not timing; repeat 5 runs before calling the suite stable |
| Upstream app changes break selectors or behaviour | Medium | Pin the commit; update deliberately |
| Expected behaviour is inferred (no internal requirements) | Medium | Base expectations on docs, existing upstream tests, and comparable behaviour; state assumptions in each report |
| Limited time on a solo project | Medium | Prioritize by risk score; drop lowest-risk areas first |
