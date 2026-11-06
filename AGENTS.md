# AGENTS.md — onboarding for coding agents

Read this whole file before touching anything. It's short on purpose.

## What this project is

**Simple Budget** is a free, local-only, manual budgeting app. No bank connections, no accounts,
no server, no subscription. You type in your monthly income and your recurring expenses, then log
expenses and deposits by hand. Whatever is left at the end of a month **rolls over** into the next.

- Runs as an installable **Progressive Web App (PWA)**. Primary device: **iPhone Duo** (Apple's
  foldable), both folded (cover screen) and unfolded (inner screen). Android works as a PWA too.
- All data lives on the device in IndexedDB. Export/import of a JSON backup is a first-class feature.
- The owner's rent depends on the numbers being right. **Correctness beats cleverness, always.**

## Where things are

| Path                        | What it is                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                 | This file.                                                                                                |
| `README.md`                 | Human-facing intro.                                                                                       |
| `docs/plan/README.md`       | **The build plan.** Ordered task list with status. Start here when asked to "do the next task".           |
| `docs/architecture.md`      | Stack, layers, data model, key flows, and the reasons behind each decision.                               |
| `docs/testing.md`           | How tests must be written (human-readable, end-to-end first). **Mandatory reading before writing tests.** |
| `docs/design.md`            | Visual design system, layouts for folded/unfolded, device profiles.                                       |
| `docs/developer-setup.md`   | Toolchain install, every `pnpm` command, viewing the app on Linux and on a real phone.                    |
| `docs/install-on-iphone.md` | Free hosting + installing on the iPhone (and why not TestFlight).                                         |
| `scripts/verify.sh`         | The one verification gate: docs, format, lint, types, unit, build, e2e.                                   |
| `scripts/check-docs.sh`     | Mechanical docs-accuracy check (paths exist, scripts/skills/folders documented).                          |
| `scripts/run-e2e.sh`        | Runs Playwright journeys natively (with Ubuntu 24.04 WebKit libs on Arch) or in the Playwright container. |
| `config/devices.ts`         | Device viewport profiles shared by Playwright and the dev device wall.                                    |
| `e2e/`                      | Playwright journeys (`e2e/journeys/`) and the readable test driver (`e2e/support/budget-app.ts`).         |
| `config/workflows/ci.yml`  | GitHub Actions CI gate running on every push and pull request.                                            |
| `.agents/skills/`           | Project skills for agents (see below).                                                                    |

Target source layout (built by the plan; each folder gets a row in the table above once it exists):

- `src/domain/` (planned) — pure TypeScript business rules: money, calendar, ledger math, config changes, insights. No React, no Dexie, no DOM.
- `src/data/` (planned) — Dexie (IndexedDB) schema, migrations, repositories, backup serialization.
- `src/app/` (planned) — use-cases (commands/queries) that combine domain + data; clock and id providers; React hooks.
- `src/ui/` (planned) — theme tokens, layout primitives, components, screens.
- `src/pwa/` (planned) — service worker registration, install guidance, storage persistence.

## Golden rules

1. **Money is integer cents.** Never use floats for money. Parse user input with the money module; format with it too.
2. **Dates are plain strings.** `IsoDate` = `"YYYY-MM-DD"`, `MonthKey` = `"YYYY-MM"`, always in the device's local calendar. Never store timestamps for ledger dates. No `Temporal` (not in iOS Safari).
3. **Ledger entry amounts are signed.** Positive adds to the budget, negative subtracts. `current budget = carried over + sum(entries in month)`.
4. **The domain is pure.** Anything in `src/domain/` (planned until T02) must be deterministic and free of I/O so it can be tested exhaustively.
5. **History is immutable-ish.** Recurring lines are snapshotted into a month when it opens. Mid-month config changes appear as _adjustment_ lines, never by rewriting the snapshot.
6. **Every behavior change ships with a readable test** following `docs/testing.md`. Journey tests drive the real UI.
7. **Schema changes need a migration** (new Dexie version + backup-format migration + test). Never edit an existing Dexie version.
8. **Never change the deploy origin** (URL) casually — IndexedDB is per-origin; users would "lose" their data.
9. **Do not commit until `scripts/verify.sh` passes** and you have seen the feature work (use the `verify-before-commit` skill).
10. **Docs must stay 100% accurate.** Update docs in the same commit as the change (use the `keep-docs-accurate` skill).

## Glossary (use these exact words in code, UI copy and test names)

| Term                  | Meaning                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| **Monthly income**    | The recurring income from the budget plan.                                                            |
| **Recurring expense** | A named expense from the budget plan that is subtracted every month (rent, phone…).                   |
| **Budget plan**       | Monthly income + recurring expenses (the configuration).                                              |
| **Purchase power**    | Monthly income − sum of recurring expenses.                                                           |
| **Carried over**      | Last month's final current budget, brought into this month as the first ledger line. Can be negative. |
| **Expense**           | A manual line that subtracts from the budget.                                                         |
| **Deposit**           | A manual line that adds to the budget.                                                                |
| **Adjustment**        | A system line created when the budget plan changes "this month". Shows the difference.                |
| **Current budget**    | Carried over + every line this month. The big number on the main screen.                              |
| **Opening a month**   | Snapshotting recurring income/expenses into a month the first time the app sees it (rollover).        |
| **Starting point**    | The carried over line + the month's recurring lines.                                                  |

## Commands

The full command list lives in `docs/developer-setup.md`. The two you need most: `pnpm dev` and `pnpm verify` (or `bash scripts/verify.sh`).

## Skills (in `.agents/skills/`)

| Skill                  | Use it when                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `work-next-plan-task`  | Asked to work on the plan / "do the next task". Picks the task, runs the full loop. |
| `write-readable-tests` | Writing or changing any test.                                                       |
| `verify-before-commit` | Before **every** commit. Runs the gate and a hands-on check of the feature.         |
| `keep-docs-accurate`   | After any change to code, scripts, structure or behavior — and before committing.   |

## Commit style

Conventional Commits with the plan task id, e.g. `feat(ledger): subtract manual expenses from the current budget [T06]`.
One logical change per commit. Never commit generated folders (`dist/`, `test-results/`, `playwright-report/`).
