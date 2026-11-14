# Testing & CI/CD Strategy

This document defines the test pyramid, tooling, and CI gates for `simple-budget-app`. All testing rules in agent personas are **conditional on the stage of the repository**: during pure documentation/planning stories (before `package.json` and `src/` exist), agents do not block on missing test suites; once code implementation begins, the test pyramid is mandatory.

## The Test Pyramid (Who Does What & When)

| Layer | Author | Reviewer / Executor | When It Runs | Tooling |
| ----- | ------ | ------------------- | ------------ | ------- |
| **1. Unit & Module Integration** | `software-engineer` writes (`src/**/*.test.ts`) | `senior-software-engineer` reviews & runs | Every code Task/`Bug:` PR (`task -> feature branch`) + in GitHub Actions CI | **Vitest** (`vitest run`; `fake-indexeddb` allowed in `devDependencies` for `indexeddb.ts` adapter tests) |
| **2. E2E & Regression** | `software-engineer` writes (`e2e/**/*.spec.ts` or bundle integration test on the story's final integration task) | `staff-software-engineer` executes & verifies | Once per story on the **feature branch** (before opening/merging the Feature PR to `main`) + in CI | **Playwright** (`@playwright/test` in headless mode) for UI/PWA; Vitest integration against built bundle for backend-only stories |
| **3. Spec Compliance & "Live Test"** | `qa` executes | `qa` | Once per story on the **Feature PR** (`feature branch -> main`), after `staff-software-engineer` approves | Full test suite + non-interactive CLI/headless verification against `Task`, `Summary`, and `Original Prompt` |

## Conventions

- **Test location:** Colocated with source (`src/**/*.test.ts`) for unit/integration tests; `e2e/**/*.spec.ts` for Playwright E2E tests.
- **First-in-project bootstrap rule:** When the first code implementation story is decomposed (and `package.json` / `vitest` / `.github/workflows/ci.yml` do not yet exist), the `project-manager` creates an initial foundational `Task:` ticket to scaffold `package.json`, TypeScript, Biome, Vitest, and `.github/workflows/ci.yml` per `project-plan/dependency-strategy.md` before feature tasks that depend on it.
- **E2E authoring rule:** Because `staff-software-engineer` and `qa` do not write code, for any code story that delivers user-facing UI or a complete backend API slice, the `project-manager` includes writing/updating the automated E2E/regression test in the story's final integration `Task:` ticket for the `software-engineer`.
- **Expectation per code task:** Every code change in `src/` must include unit/integration tests covering its happy path and edge cases (e.g., idempotency, IEEE-754 integer-cent rounding, date boundaries, storage/backup validation errors), and must not break existing tests.
- **CI shape (`.github/workflows/ci.yml`):** Configure triggers so CI runs once per PR update (targeting `main` or `feature/**`) and once on merges to `main`, avoiding duplicate runs on task-branch pushes:
  ```yaml
  on:
    pull_request:
    push:
      branches: [main]
  ```
  Pipeline steps (a single job, e.g. `jobs: ci:`):
  0. `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` (with pnpm cache), then `pnpm install --frozen-lockfile`
  1. `pnpm run lint` (Biome)
  2. `pnpm run typecheck` (`tsc --noEmit`)
  3. `pnpm run test` (`vitest run`)
  4. `pnpm run build` (`vite build`)
  5. Once a UI shell / Playwright E2E suite exists: run `pnpm exec playwright install --with-deps chromium webkit` (or `chromium`) to install headless browser binaries on the runner, followed by `pnpm run test:e2e` (Playwright headless)

  The bootstrap task defines the `lint`, `typecheck`, `test`, `build` (and later `test:e2e`) scripts in `package.json` so these names are real.
- **System-enforced `main` gate (GitHub branch protection):** Once `.github/workflows/ci.yml` is merged to `main`, the `staff-software-engineer` (immediately after that merge) enables branch protection on `main` requiring the CI **job** status check to pass before a PR can be merged. The required check name is the **job name** from `ci.yml` (e.g. `ci`), not the individual step names — a single-job workflow produces one check. `enforce_admins` MUST be `true`, because every agent authenticates as the repo owner and admins bypass protection by default:
  ```bash
  gh api -X PUT "repos/$REPO_OWNER/$REPO_NAME/branches/main/protection" --input - <<'EOF'
  {
    "required_status_checks": { "strict": false, "checks": [ { "context": "ci" } ] },
    "enforce_admins": true,
    "required_pull_request_reviews": null,
    "restrictions": null
  }
EOF
  ```
  **Important caveat:** Do **not** enable GitHub's "Require approvals" PR review rule, because all agent roles authenticate under the same GitHub account and GitHub forbids a user from approving their own PR; multi-role review gates are enforced by the orchestrator's signed-comment verification gates. Agents must **never** pass `--admin` to `gh pr merge`.

## Headless / CLI Execution Rule (No Hanging Dev Servers)

Agents run in a non-interactive CLI environment (`opencode`). When `software-engineer`, `senior-software-engineer`, `staff-software-engineer`, or `qa` runs tests or performs a "live test":
- **NEVER** run an interactive watch command (`vitest` without `run`) or a foreground dev server (`pnpm run dev` / `vite`) that blocks the terminal indefinitely.
- For **backend-only stories** (before UI exists): run `pnpm run build` and execute an automated integration test or one-shot script (`node` / `vitest run`) importing the public API (`createBudgetApi`) from the built bundle to verify end-to-end behavior.
- For **UI / PWA stories**: use `npx playwright test` (configured with `webServer` in `playwright.config.ts` to auto-start and auto-stop the preview server), or start the preview server in the background, run headless browser/HTTP checks with a timeout, and kill the server PID before finishing the command.
