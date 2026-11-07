# AGENTS.md — onboarding for coding agents

Read this whole file before touching anything. It's short on purpose.

## What this project is

**Simple Budget** is a free, local-only, manual budgeting app. No bank connections, no accounts,
no server, no subscription. You type in your monthly income and your recurring expenses, then log
expenses and deposits by hand. Whatever is left at the end of a month **rolls over** into the next.

- **Canonical GitHub Repository:** `TandyN/simple-budget-app` (`https://github.com/TandyN/simple-budget-app`) — all commits, branches, PRs, and releases happen ONLY in this repository.
- **Native iOS App + Live Web Preview:** Ships as a **Native iOS App (`ios/`)** via TestFlight / App Store Connect (where data lives in native iOS `Application Support`, completely immune to Safari cache clearing) AND as a live web preview at `https://tandyn.github.io/simple-budget-app/`. Primary device: **iPhone Duo** (Apple's foldable), both folded (cover screen) and unfolded (inner screen).
- All data lives locally on the device (native iOS `Application Support` + `IndexedDB` mirror). Export/import of a JSON backup is a first-class feature.
- The owner's rent depends on the numbers being right. **Correctness beats cleverness, always.**

## Working with you (the tech lead)

You are our **tech lead**; we agents are your **engineers**. We are trusted to do our own due
diligence and **ship** — you don't hand-hold. This maps to how you expect an engineer to behave:

- **Do the due diligence:** verify on real device widths, not just in your head. Money and the
  iPhone Duo layouts are non-negotiable.
- **Ship the full loop:** implement → test locally → open a PR → independent review → your final
  sign-off. See the `## Agent workflow` section and the skills in `.agents/skills/`.
- **Ask only when you actually must:** you think a lot, and you ask when you have a **genuine**
  blocker (something you truly cannot decide without us). The moment there is **enough** to start,
  **start** — don't bounce a "what do you mean" back at us.
- **If the intent is ambiguous:** state the interpretation you'll use, the plan default you're
  leaning on, then proceed to build, test, troubleshoot, review and hand off. We never silently
  guess on money or on the owner-visible UI.
- **You own the final gate:** review the PR with fresh eyes, do the final hands-on QA at real
  device widths, then **you merge to `main` and you ship** to production. By default agents do not
  merge their own work — but **if you (the tech lead) explicitly authorize it in the conversation,
  the agent may run `gh pr merge` on your behalf**, including in the original task prompt. See the
  `## Agent workflow` section for the exact handoff.

## Where things are

| Path                            | What it is                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                     | This file.                                                                                                                                                          |
| `README.md`                     | Human-facing intro (**Note:** `# Human Description` at the top is human-only; agents must NEVER touch it).                                                          |
| `LICENSE`                       | MIT License (`Copyright (c) 2026 Tandy Nguyen`) — requires attribution/credit when reusing this work.                                                               |
| `CHANGELOG.md`                  | Automated SemVer release history (`0.y.z` pre-1.0 → `1.0.0`).                                                                                                       |
| `docs/plan/README.md`           | **The build plan.** Ordered task list with status. Start here when asked to "do the next task".                                                                     |
| `docs/workflow.md`              | Branch, PR, independent review, SemVer release, GitHub Pages + TestFlight deploy, live QA & rollback.                                                               |
| `docs/architecture.md`          | Stack, layers, data model, key flows, and the reasons behind each decision.                                                                                         |
| `docs/testing.md`               | How tests must be written (human-readable, end-to-end first). **Mandatory reading before writing tests.**                                                           |
| `docs/design.md`                | Visual design system, layouts for folded/unfolded, device profiles.                                                                                                 |
| `docs/developer-setup.md`       | Toolchain install, every `pnpm` command, viewing the app on Linux and on a real phone.                                                                              |
| `docs/install-on-iphone.md`     | Native iOS TestFlight / App Store automated deployment + live web preview on iPhone.                                                                                |
| `ios/`                          | Native Swift iOS app target (`ios/project.yml`, `ios/SimpleBudget/`) with native file storage bridge.                                                               |
| `scripts/verify.sh`             | The one verification gate: docs & policy check, format, lint, types, unit, build, e2e.                                                                              |
| `scripts/check-docs.sh`         | Mechanical docs & policy check (paths exist, human README intact, zero extra runtime deps).                                                                         |
| `scripts/run-e2e.sh`            | Runs Playwright journeys natively (with Ubuntu 24.04 WebKit libs on Arch) or in the Playwright container.                                                           |
| `scripts/build-ios.sh`          | Bundles `dist/` into `ios/SimpleBudget/www/`, compiles Xcode iOS target, and uploads `.ipa` to TestFlight.                                                          |
| `scripts/deploy.sh`             | Builds `dist/`, deploys to `gh-pages`, enables GitHub Pages, tags `v*`, and creates the GitHub Release.                                                             |
| `scripts/verify-live.mjs`       | Post-deploy live WebKit + offline PWA verification against `https://tandyn.github.io/simple-budget-app/`.                                                           |
| `scripts/rollback.sh`           | One-command rollback of the live site to any previous `v*` tag.                                                                                                     |
| `config/devices.ts`             | Device viewport profiles shared by Playwright and the dev device wall.                                                                                              |
| `dev/devices.html`              | Dev-only side-by-side device wall showing every profile from `config/devices.ts` with a dark-mode toggle.                                                           |
| `src/domain/`                   | Pure TypeScript business rules: money, calendar, UTC instants, ledger math, budget plan changes, and domain rule tests.                                             |
| `src/data/`                     | Native browser IndexedDB schema v1, transactional wrapper, repositories, and iOS storage bridge sync.                                                               |
| `src/app/`                      | Application use-cases (`completeSetup`, `addEntry`, `updateEntry`, `deleteEntry`, `restoreEntry`, `openMonthsThrough`, `getMonthView`), clock/id providers & hooks. |
| `src/ui/`                       | Design tokens (`src/ui/theme/tokens.css`), responsive shell (`AppShell`, `TwoPane`), screens (`src/ui/screens/`), and components.                                   |
| `src/pwa/`                      | Service worker registration and offline status hook (`public/sw.js` + `public/manifest.webmanifest`).                                                               |
| `e2e/`                          | Playwright journeys (`e2e/journeys/`) and the readable test driver (`e2e/support/budget-app.ts`).                                                                   |
| `.github/workflows/ci.yml`      | PR verification pipeline: unit/E2E tests, isolated `/pr-<N>/` preview QA, and Xcode iOS Simulator artifact.                                                         |
| `.github/workflows/release.yml` | Production release pipeline on merge to `main`: SemVer bump, release notes, PWA deploy, and TestFlight.                                                             |
| `.agents/skills/`               | Project skills for agents (see below).                                                                                                                              |

## Golden rules

1. **Money is integer cents.** Never use floats for money. Parse user input with the money module; format with it too.
2. **Every moment is a UTC timestamp.** Ledger entries store `occurredAt` as a UTC ISO-8601 string (`2026-11-05T17:30:00.000Z`) and convert to the device's local time only to display it or to pick the day/month (`src/domain/instant.ts`). `IsoDate` (`"YYYY-MM-DD"`) and `MonthKey` (`"YYYY-MM"`) are the local calendar day/month _derived_ from that instant and stored only so they can be indexed. Always use the `instant` helpers; never hand-parse. No `Temporal` (not in iOS Safari).
3. **Ledger entry amounts are signed.** Positive adds to the budget, negative subtracts. `current budget = carried over + sum(entries in month)`.
4. **The domain is pure.** Anything in `src/domain/` must be deterministic and free of I/O so it can be tested exhaustively.
5. **History is immutable-ish.** Recurring lines are snapshotted into a month when it opens. Mid-month config changes appear as _adjustment_ lines, never by rewriting the snapshot.
6. **Every behavior change ships with a readable test** following `docs/testing.md`. Journey tests drive the real UI.
7. **Schema changes need a migration** (new IndexedDB version + backup-format migration + test). Never edit an existing IndexedDB version.
8. **Never change the deploy origin** (`https://tandyn.github.io/simple-budget-app/`) casually — IndexedDB is per-origin; users would "lose" their data.
9. **Do not commit until `scripts/verify.sh` passes** and you have seen the feature work (use the `verify-before-commit` and `agent-commit` skills).
10. **Docs must stay 100% accurate.** Update docs in the same commit as the change (use the `keep-docs-accurate` skill).
11. **NEVER touch `# Human Description` in `README.md`.** Everything in `README.md` above `# Simple Budget` is strictly human-authored and mechanically protected by `scripts/check-docs.sh`.
12. **Zero extra runtime dependencies.** `package.json` `"dependencies"` may contain **only** `react` and `react-dom` (enforced by `scripts/check-docs.sh`). Use native browser APIs (`indexedDB`, `<dialog>`, hash routing, inline SVGs, CSS variables, standard Service Worker). Well-tested dev tools belong in `"devDependencies"` only.
13. **Every agent commit ends with `(agent-generated)`** on both the subject line and the commit body, and every completed task ships through a PR, independent review, SemVer bump, GitHub Pages deploy, and live offline QA (`docs/workflow.md`).
14. **Agents never merge their own work without the tech lead's explicit permission.** The independent reviewer does the CI gate + review + hands-on QA and returns `APPROVED`; **the tech lead owns the final production gate**. By default the tech lead runs `gh pr merge` themselves, but they may explicitly authorize an agent to merge on their behalf (in the original prompt or after the review) — in that case, and only in that case, the agent may run `gh pr merge` after CI is green and the review is `APPROVED`.

## Glossary (use these exact words in code, UI copy and test names)

| Term                  | Meaning                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| **Monthly income**    | The recurring income from the budget plan.                                                            |
| **Recurring expense** | A named expense from the budget plan that is subtracted every month (rent, phone…).                   |
| **Budget plan**       | Monthly income + recurring expenses (the configuration).                                              |
| **Available funds**   | Monthly income − sum of recurring expenses in setup; after setup it is the **Current budget**.        |
| **Carried over**      | Last month's final current budget, brought into this month as the first ledger line. Can be negative. |
| **Expense**           | A manual line that subtracts from the budget.                                                         |
| **Deposit**           | A manual line that adds to the budget.                                                                |
| **Adjustment**        | A system line created when the budget plan changes "this month". Shows the difference.                |
| **Current budget**    | Carried over + every line this month. Shown on screen as **Available funds** (the big number).        |
| **Opening a month**   | Snapshotting recurring income/expenses into a month the first time the app sees it (rollover).        |

## Commands

The full command list lives in `docs/developer-setup.md`. The ones you need most: `pnpm dev`, `pnpm verify`, `pnpm release:deploy`, and `pnpm verify:live`.

## Agent workflow (trunk-based, independent review)

Every feature ships through the same loop that a human trunk-based team would use. **You are the
tech lead; the agents below are engineers you delegate to:**

1. **Implement on a feature branch** (`feat/Txx-<slug>` or `fix/<slug>`) — incremental
   Conventional-Commit commits, `(agent-generated)` suffix on every commit, tests-first per
   `write-readable-tests`, hands-on Duo check per `verify-before-commit`.
2. **Open a PR** to `main` and wait for CI to go green (`verify`, preview QA, `ios-simulator`).
3. **An independent reviewer subagent** (a separate context, launched via the `task` tool) audits
   the diff against the golden rules, does **hands-on QA in the browser at both iPhone Duo
   layouts**, and posts a structured `gh pr review` + comment on the PR. It returns a verdict —
   `APPROVED` or `CHANGES REQUESTED` — and **does not merge**.
4. **The final review and ship is the tech lead's gate:** with fresh eyes, do the final hands-on
   QA at real device widths, then **merge to `main` and ship**. Merging triggers
   `.github/workflows/release.yml` (SemVer bump, `CHANGELOG.md`, PWA deploy, live offline QA,
   `vX.Y.Z` tag), which we watch to a green finish after the merge. By default **the tech lead
   runs `gh pr merge`** — but if they **explicitly authorize an agent to merge on their behalf**
   (in the original prompt or after the review), that agent may run `gh pr merge` instead, once
   CI is green and the independent review returned `APPROVED`.

The line in the sand: **agents build, test, and review each other's work; merging stays a
tech-lead decision.** By default no agent merges its own or another's work — but the tech lead may
explicitly authorize a merge on their behalf, which keeps the final ship accountable to a human.
The implementer does not review its own work, and the reviewer never merges; that independent
review plus the explicit-authorization boundary is what keeps both the review honest and the
final ship accountable. See `ship-and-verify-release` §3 for the exact `task` dispatch and
`review-pr` for the reviewer checklist.

## Skills (in `.agents/skills/`)

| Skill                     | Use it when                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `never-stop-mid-task`     | **Read at the start of every multi-turn session** (fixing a bug, working a plan task, reviewing, releasing) and whenever the user reports an agent stopping / stalling mid-task. Cuts off the three failure modes: ending a turn on narration, blocking silently on long commands, and bouncing questions that already have an answer. |
| `work-next-plan-task`     | Asked to work on the plan / "do the next task". Picks the task, runs the full loop + release.                                                                                                                                                                                                                                          |
| `write-readable-tests`    | Writing or changing any test.                                                                                                                                                                                                                                                                                                          |
| `verify-before-commit`    | Before **every** commit. Runs the gate and a hands-on check of the feature.                                                                                                                                                                                                                                                            |
| `keep-docs-accurate`      | After any change to code, scripts, structure or behavior — and before committing.                                                                                                                                                                                                                                                      |
| `agent-commit`            | Making any git commit. Enforces the `(agent-generated)` suffix and human-README protection.                                                                                                                                                                                                                                            |
| `review-pr`               | The **reviewer subagent** runs this checklist on a PR — CI gate + hands-on QA + structured comment, and returns a verdict. It never merges.                                                                                                                                                                                            |
| `ship-and-verify-release` | The implementer's side of the pipeline: open the PR, then dispatch the reviewer subagent to review + QA, and hand the approved PR to the tech lead.                                                                                                                                                                                    |
| `rollback-release`        | Rolling back the live deployment to a previous `v*` release tag.                                                                                                                                                                                                                                                                       |
| `orchestrate-tasks`       | Coordinating multi-agent personas (`implementer`, `reviewer`) or running independent plan tasks in parallel.                                                                                                                                                                                                                           |

## Commit style

Commit **frequently as each logical sub-step is completed** (3–6 commits per task) so the commit log tells a clear story — never dump an entire feature into one giant commit. Use Conventional Commits with the plan task id and mandatory `(agent-generated)` suffix, e.g.:
`feat(ledger): subtract manual expenses from the current budget [T06] (agent-generated)`.
When the tech lead merges an approved PR (`gh pr merge --merge`), the merge commit subject should summarize the shipped feature (`feat(scope): ... (#PR) [Txx] (agent-generated)`). Never commit generated folders (`dist/`, `test-results/`, `playwright-report/`).
