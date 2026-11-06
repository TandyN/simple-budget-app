# T14 — Hardening: performance, accessibility, resilience

**Depends on:** T12, T13 — **Milestone:** Release

## Goal

Prove the app is blazing fast on 10 years of data, accessible, visually stable on every device profile, and resilient
to errors — then do a final full docs audit.

## Read first

`docs/architecture.md` §8, everything in `docs/`.

## Scope

**In:** performance fixture + measurements, optimizations if needed, axe sweep of every screen in both layouts, visual
regression baselines, error boundary with export escape hatch, local diagnostics log, operation-sequence fuzzing at the
use-case level, final docs audit.
**Out:** new features.

## Steps

1. Extend the fixture generator: 10 years, ~25,000 entries, 30 tags → `e2e/fixtures/backups/ten-years-of-history.json` (planned).
2. Perf journeys (WebKit, both Duo sizes): import the fixture, then measure with `performance.mark/measure` exposed in
   preview builds: month screen data, insights "All time", add-expense-to-updated-budget, cold start offline. Assert §8 budgets.
   If any is missed, profile first; add a `monthTotals` cache only with a property test proving it always equals the derived value.
3. Accessibility: axe on every screen × both layouts × light/dark; VoiceOver labels audit; Dynamic Type check (large text doesn't clip).
4. Visual regression: `toHaveScreenshot` baselines for setup, month, entry sheet, settings, insights at every profile, generated
   **inside the Playwright container** for deterministic rendering.
5. Error boundary: friendly screen with *Export backup* and *Reload* buttons; errors stored in a small local ring buffer, viewable
   and exportable in Settings → Diagnostics. Never crash to a blank screen.
6. Fuzz: fast-check model-based test driving use-cases (add/edit/delete/plan change/travel in time/export-import) against a simple
   reference model; the current budget and every carried over must match the model.
7. Final docs audit with the `keep-docs-accurate` skill; README with screenshots (folded + unfolded).

## Behaviors to prove

- `with ten years of history the month screen loads within 30 ms`
- `with ten years of history all-time insights load within 100 ms`
- `adding an expense updates the current budget within 50 ms`
- `the installed app starts offline within one second`
- `every screen has no accessibility violations when folded or unfolded, in light or dark mode`
- `screens look the same as their approved screenshots on every device profile`
- `if something goes wrong, the app offers to export a backup instead of showing a blank screen`
- `for any sequence of actions, the app's budget matches a simple reference calculation`

## Acceptance criteria

- [ ] All performance budgets met in WebKit (numbers recorded in Completion notes).
- [ ] Zero axe violations across the matrix.
- [ ] Visual baselines committed and stable across three consecutive runs.
- [ ] Docs audit complete; `bash scripts/check-docs.sh` passes; every task in `docs/plan/README.md` is `done`.
- [ ] `pnpm verify` passes.

## Docs to update

All of `docs/` as needed, `README.md` (screenshots, status → "1.0").

## Completion notes

_Filled in by the agent when done._

