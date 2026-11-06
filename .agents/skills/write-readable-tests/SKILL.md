---
name: write-readable-tests
description: >-
  Use this skill whenever writing, changing, or reviewing tests in Simple Budget (Playwright journeys in e2e/
  or Vitest rule tests in src/). It enforces the project's human-readable, end-to-end-first test style so the
  owner can read any test and immediately see what is tested and how.
---

# Write readable tests

The full style guide is `docs/testing.md`. Read it first; this is the checklist.

## Choose the kind of test

- Can a user see it? → **Journey test** in `e2e/journeys/<feature>.spec.ts`, driven through `budgetApp`.
- Is it a rule with many edge cases (money parsing, leap years, rollover math, import validation)? →
  **Rule test** next to the code (`src/domain/<thing>.test.ts`). Usually you want **both**: one journey
  proving the user sees it, rule tests covering the edge cases.

## Checklist (every test must pass all of these)

- [ ] The name is a plain-English sentence about the behavior (`an expense is subtracted from the current budget`).
- [ ] Arranged like a user would: `openOn(date)` → `finishSetup(...)` → action. No database seeding.
      (History may only be loaded through the app's import feature with a fixture in `e2e/fixtures/backups/` (planned until T09).)
- [ ] The final assertion reads a value **off the screen** (journeys) or off the public function result (rules).
- [ ] Money written as humans write it: `'$1,800.00'`. Arithmetic shown in a comment above the assertion.
- [ ] Explicit fixed dates. Clock moved with `budgetApp.travelTo(...)`, never real waiting.
- [ ] One behavior per test; given / when / then separated by blank lines.
- [ ] No CSS selectors, no test ids: roles and accessible names only (inside the driver).
- [ ] Full-word names from the glossary in `AGENTS.md`. No abbreviations.
- [ ] No `waitForTimeout`, no `test.only`, no `.skip` without a linked follow-up in the plan.
- [ ] Property tests name their property: `for any ..., ...`.

## Growing the driver

When a journey needs a new user action, add a method to `e2e/support/budget-app.ts` (planned until T01):

1. Name it with a verb from the glossary (`changeMonthlyIncome`, `removeRecurringExpense`).
2. Parameters are exactly what the user types/chooses (strings like `'$40.00'`, `'starting next month'`).
3. Inside, use `getByRole` / `getByLabel`. If an element has no accessible name, **fix the app**, not the test.
4. Add a row for it to the driver table in `docs/testing.md`.

## Self-review before moving on

Read each test out loud as if to the owner. If any line needs explaining, rename or restructure until it doesn't.
Then confirm the test fails when the behavior is broken (temporarily break the code, or check the red run you did first).
