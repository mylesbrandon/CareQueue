# Validation strategy

Run the automated suite and production build from a clean install:

```bash
npm ci
npm test
npm run build
```

The domain suite contains **104 named synthetic scenarios** using Node's built-in `node:test`. No external service, real patient data, or API key is needed. The test count reported by `npm test` is the reproducible source of truth; the number of generated demo cases is not a test count.

| Executable suite | Focus |
| --- | --- |
| [`tests/assignment.test.js`](../tests/assignment.test.js) | Eligibility, capacity, priority, tie-breaks, workspace isolation, and seeded plan invariants. |
| [`tests/workflow.test.js`](../tests/workflow.test.js) | Reasoned overrides, review invalidation, publication guards, immutable snapshots, and subsequent runs. |
| [`tests/alerts-validation.test.js`](../tests/alerts-validation.test.js) | Aging and risk boundaries, UTC time behavior, malformed inputs, and alert completeness. |

[`tests/fixtures.js`](../tests/fixtures.js) centralizes small synthetic cases, rosters, and a fixed UTC reference time. [GitHub Actions](../.github/workflows/ci.yml) runs `npm ci`, the scenario suite, the production build, and the Playwright Chromium suite for pull requests and pushes to `main`. For a coverage report, run `npm run test:coverage`; coverage percentage is a diagnostic, not evidence of clinical validity.

## What should stay true

| Area | Behavioral checks |
| --- | --- |
| Eligibility | Active status, workspace, client, exact capability, state, and capacity all gate assignment. |
| Priority | Risk and age boundaries, specialty ordering, and tie-breaks behave consistently. |
| Capacity | Existing workload and every assignment in the current run are counted; no nurse exceeds the limit. |
| Completeness | Every open workspace case is assigned once or appears in overflow; existing assignments are not duplicated. |
| Overrides | Invalid targets and blank reasons are rejected; changes are recorded and derived views stay consistent. |
| Lifecycle | Review is required, changes invalidate review, publication validates again, and published runs are locked. |
| Alerts | Aging threshold boundaries and distinct overflow blockers are visible in the plan. |
| Repeatability | Fixed inputs produce the same recommendations; seeded scenarios verify invariants across varied workflows. |

Small fixtures isolate a single rule. Seeded workflows combine constraints and verify properties across an entire plan. This combination makes failures easier to diagnose while exercising interactions such as a nurse becoming full partway through a run.

## Automated browser checks

```bash
npm run build
npx playwright install chromium
npm run test:e2e
```

[`e2e/workflow.spec.js`](../e2e/workflow.spec.js) contains **7 browser scenarios** using the production server to check reasoned overrides, destination selection, review invalidation, publication locks, reload persistence, history, subsequent runs, roster edits, invalid input rejection, corrupt-storage recovery, reset, and a narrow viewport with keyboard dismissal. Failed runs retain traces in `test-results/` and an HTML report in `playwright-report/`.

## Manual browser checks

Follow the [demo walkthrough](demo.md) and verify these after changes to UI or persistence:

- A roster change affects a new unfinished plan.
- Reassigning or removing a case updates counts, capacity, overflow, and the override log.
- Publish is unavailable until review; a published run cannot be edited.
- The published result appears in Runs and Metrics and survives a page reload.
- CSV export matches the current assignment list.
- A clean browser has a useful empty history state.
- The workspace, tables, and dialogs remain usable at narrow widths and with a keyboard.

Unit and workflow tests do not prove accessibility, cross-browser behavior, multi-user concurrency, or clinical safety. The browser suite targets Chromium; it is not a comprehensive accessibility audit or cross-browser certification.
