# Testing & CI/CD Strategy

This document defines the test pyramid, tooling, and CI gates for `simple-budget-app`. The CI plan covers **both the backend library and the PWA UI** — the frontend is a first-class, zero-prod-dep shell (see [frontend.md](frontend.md)), not "out of scope". All testing rules in agent personas are **conditional on the stage of the repository**: during pure documentation/planning stories (before `package.json` and `src/` exist), agents do not block on missing test suites; once code implementation begins, the test pyramid is mandatory.

## The Test Pyramid (Who Does What & When)

| Layer | Author | Reviewer / Executor | When It Runs | Tooling |
| ----- | ------ | ------------------- | ------------ | ------- |
| **1. Unit & Module Integration** | `software-engineer` writes (`src/**/*.test.ts`) | `senior-software-engineer` reviews & runs | Every code Task/`Bug:` PR (`task -> feature branch`) + in GitHub Actions CI | **Vitest** (`vitest run`; `fake-indexeddb` allowed in `devDependencies` for `indexeddb.ts` adapter tests) |
| **2. E2E & Regression** | `software-engineer` writes (`e2e/**/*.spec.ts`) | `staff-software-engineer` executes & verifies | Once per story on the **feature branch** (before opening/merging the Feature PR to `main`) + in CI | **Playwright** (`@playwright/test` headless Chromium + WebKit) exercises the **PWA UI** (add expense, set recurring, edit/backdate, search/insights, export/import) against the `BudgetApi` it renders ([frontend.md](frontend.md)); for a story that delivers a pure backend slice *before* any UI shell exists, a Vitest integration test against the built bundle is the interim regression test until `test:e2e` is unblocked by the UI shell |
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
   0b. **Zero-prod-dep CI check** — assert `package.json` **`dependencies` is empty** so a PR that introduces a production dependency fails the gate *before* review, not after. E.g. `node -e "const p=require('./package.json'); if (Object.keys(p.dependencies ?? {}).length) { throw new Error('dependencies must be empty (zero-prod-dep)') }"`. This is the CI-enforced half of the zero-prod-dep rule in [dependency-strategy.md](dependency-strategy.md); the human gate (senior sign-off) still applies.
   1. `pnpm run lint` (Biome)
  2. `pnpm run typecheck` (`tsc --noEmit`)
  3. `pnpm run test` (`vitest run`)
  4. `pnpm run build` (`vite build`)
  5. Once a UI shell / Playwright E2E suite exists (the PWA UI from [frontend.md](frontend.md)): run `pnpm exec playwright install --with-deps chromium webkit` to install the headless browser binaries on the runner, followed by `pnpm run test:e2e` — Playwright headless (**Chromium + WebKit**) exercising the PWA UI end-to-end (add expense, set recurring, edit/backdate, search/insights, export/import). `test:e2e` is **gated on the UI shell existing**: until a UI shell ships, step 5 is a no-op in CI and the backend regression is covered by the Vitest integration test in layer 2.

  The bootstrap task defines the `lint`, `typecheck`, `test`, `build` (and later `test:e2e`) scripts in `package.json` so these names are real.

  **Zero-prod-dep coherence (req 1).** The CI/dev-deps surface is consistent with [dependency-strategy.md](dependency-strategy.md): every package the pipeline installs or runs — pnpm, Vite, Vitest, Playwright, `fake-indexeddb`, Biome, tsc — lives in **`devDependencies`** and is used **only** at build/test/lint time; `package.json` **`dependencies` MUST stay empty**, so CI never installs or ships a production dependency and nothing production is loaded at runtime. The two load-bearing decisions — **integer-cent money** (`amountCents`, pure integer-domain TS) and the **reserved bank-OAuth slots** (`bank-sync` / `externalTxnId` / `sourceAccountId`) — are **pure TypeScript logic** over built-in Web APIs and therefore **introduce no production dependency**: they never appear as a new package in `dependencies` or `devDependencies`, and they are exercised by the `test` (Vitest unit/integration) and `test:e2e` (PWA UI) steps, not by any runtime package. See [data-model.md](data-model.md) and [activity-model.md](activity-model.md).
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

## CI deploy & preview (GitHub Pages)

The deployment target is **GitHub Pages** (HTTPS, secure context). There is no
Cloudflare Pages in this plan; the architecture below is the **one and only**
deploy/preview architecture. (See [dependency-strategy.md → CI actions
(the allowed set)](dependency-strategy.md#ci-actions-the-allowed-set) for the
allowed, well-maintained GitHub Actions that implement this.)

### Production base path

- **Production base (the site root):** `https://tandyn.github.io/simple-budget-app/`
- The production build is configured with **base path `/simple-budget-app/`**
  (the repo's `VITE_BASE_PATH` / `base` in `vite.config.ts`). This is the URL
  the **production** app is served from on GitHub Pages.
- **Production deploy is unchanged** — it builds to `/simple-budget-app/` and
  writes the production root exactly as before. It is **not** touched by PR
  preview deploys (see the production-untouched guarantee below).

### Configurable base path (explicit build decision)

- The base path is a **configurable build-time input** (`VITE_BASE_PATH`, or
  `base` in `vite.config.ts`), **not a hardcoded constant**. This is an explicit
  architectural decision: it is what makes **mode (a) same-site sub-path** PR
  previews possible without a second site, and it is what lets the **per-PR
  preview path** be computed at build/deploy time from the **PR number**.
- **PR-number source at build/deploy time:** the PR number is read from the
  GitHub event context in the workflow — `github.event.number` (for
  `pull_request`) or `github.event.pull_request.number` (for `pull_request_target`
  / `pull_request_target` close). It is injected into the build as
  `VITE_BASE_PATH=/simple-budget-app/pr-<PR#>/`. This is the **only** source of
  the PR number; nothing else (env var, config file) is used.
- **Worked example:** for **PR #120**, the preview build is configured with
  `VITE_BASE_PATH=/simple-budget-app/pr-120/` and is published to
  `https://tandyn.github.io/simple-budget-app/pr-120/` — a **sub-path** of the
  same production site, with **all asset URLs rewritten** to the `/pr-120/`
  prefix so the preview is a fully self-contained build.

### Mode (a) — same-site sub-path (confirmed architecture)

The **confirmed** PR-preview architecture is **mode (a)**: **same-site,
sub-path**. Each open PR gets a preview at
`tandyn.github.io/simple-budget-app/pr-<PR#>/` — a sub-path of the production
site. The **two hard guarantees** (2026-11-15 user clarification) are:

1. **Production is untouched on a PR deploy.** A PR preview deploy must **not**
   overwrite or clobber the production root (`/simple-budget-app/`); **only the
   `pr-<PR#>/` sub-path is written**. The production root is left exactly as it
   was before the PR deploy ran.
2. **PR sub-paths are pruned on merge.** When a PR is **merged** (or **closed**),
   the `pr-<PR#>/` sub-path is **removed** from the Pages site, so no stale
   preview lingers.

These two guarantees together mean a PR preview is a **pure additive,
self-cleaning** artifact on the same site: it adds a sub-path while open, and
removes it when the PR ends.

### CI workflow mechanics (compose-and-deploy / prune-on-merge / production-unchanged)

The CI workflow (a **deploy** workflow, separate from the `ci` test job above)
implements the three mechanics below. All five actions used here —
`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`,
`actions/upload-pages-artifact`, `actions/deploy-pages` — are in the
[CI actions (the allowed set)](dependency-strategy.md#ci-actions-the-allowed-set)
table in [dependency-strategy.md](dependency-strategy.md).

**1. Compose-and-deploy (on `pull_request`).**

- **Trigger:** `on: pull_request` (any PR targeting any branch).
- **Read the PR number** from the event context (see *PR-number source* above).
- **Build with the per-PR base path:** `VITE_BASE_PATH=/simple-budget-app/pr-<PR#>/ pnpm run build`
  (e.g. `VITE_BASE_PATH=/simple-budget-app/pr-120/ pnpm run build` for PR #120).
- **Deploy the PR assets into the `pr-<PR#>/` sub-path only.** Concretely:
  - Build to a **staged** directory (e.g. `.pr-preview/pr-<PR#>/dist`).
  - **Compose** the existing production site + the PR's `pr-<PR#>/` sub-path into
    a single Pages artifact (the production files **unchanged** at the root, the
    PR's files added under `pr-<PR#>/`). This is the *compose* step — it **adds**
    the sub-path without rewriting the root.
  - `actions/upload-pages-artifact` uploads the composed artifact.
  - `actions/deploy-pages` deploys to GitHub Pages. Because the **production
    root files are byte-for-byte unchanged** in the composed artifact and only
    the `pr-<PR#>/` sub-path was added, **the production root is untouched**
    (guarantee 1).
- **The production root is NOT written** — only the `pr-<PR#>/` sub-path is
  written by a PR preview deploy.

**2. Prune-on-merge (on PR merge or close).**

- **Trigger:** `on: pull_request: types: [closed]` (fires on **both** merge and
  non-merge close).
- **Read the PR number** from the event context.
- **Remove the `pr-<PR#>/` sub-path** from the Pages site: compose the
  production site (root only) without the `pr-<PR#>/` sub-path, upload via
  `actions/upload-pages-artifact`, and deploy via `actions/deploy-pages`.
  Because the production root files are unchanged and the `pr-<PR#>/` sub-path
  is now **absent**, the sub-path is **pruned** (guarantee 2) while the
  production root remains **untouched**.

**3. Production deploy unchanged (on `main`).**

- **Trigger:** `on: push: branches: [main]`.
- **Build with the production base path:** `VITE_BASE_PATH=/simple-budget-app/ pnpm run build`.
- **Deploy to the production root** (`/simple-budget-app/`) via
  `actions/upload-pages-artifact` + `actions/deploy-pages` — **exactly as before,
  unmodified** by this plan. A `main` push is the only thing that writes the
  production root.

**In summary:** a PR preview is a **pure additive** sub-path on the same site;
it is **pruned** on merge/close; the production root is **only ever** written by
a `main` push. These three mechanics, taken together, implement the two hard
guarantees above.

## Android + iOS test-build pipeline (credential-skip, build-only)

The native shells (Capacitor) are a later milestone (see [frontend.md](frontend.md)
and [portability.md](portability.md)), but the **CI pipeline for building the
Android + iOS apps** is specified now so it is designed in-plan alongside the
PWA build. **Build-only** — it does **not** upload to any store (App Store /
Play Store); it only produces the signed build artifacts.

### Behavior: skip-when-credentials-absent

- The Android and iOS build jobs are **gated on the presence of signing
  credentials** (secrets) in the CI environment. **When the secrets are absent,
  the job is SKIPPED (not failed).** This is the **skip-not-fail** behavior:
  the pipeline must not be red when the credentials simply have not been
  provisioned yet.
- **The Web / PWA build is always-run.** It is **not** credential-gated and
  always runs. The native builds are **optional / credential-gated** and coexist
  with the always-run Web build in the same CI pipeline.

### Credential gates (the secret-presence check / conditional)

| Platform | Gating condition (the conditional) |
| -------- | --------------------------------- |
| **Android** | The Android build job runs **only when** `env.ANDROID_KEYSTORE_B64 != ''` (the base64-encoded Android signing keystore secret is present). If absent, the job **skips**. |
| **iOS** | The iOS build job runs **only when** `env.IOS_CERTIFICATE_B64 != ''` **AND** `env.IOS_PROVISIONING_PROFILE_B64 != ''` (both the base64-encoded iOS signing certificate and the base64-encoded iOS provisioning profile are present). If either is absent, the job **skips**. |

In GitHub Actions `if:` expressions, this is expressed as a **conditional job**
(e.g. `if: ${{ secrets.ANDROID_KEYSTORE_B64 != '' }}` for Android, and
`if: ${{ secrets.IOS_CERTIFICATE_B64 != '' && secrets.IOS_PROVISIONING_PROFILE_B64 != '' }}`
for iOS) so that the job is **skipped** (green/skipped) — **not failed** — when
the secrets are absent.

### Build-only scope

- The jobs **build** the signed artifacts (e.g. `cap build android` /
  `cap build ios`, or the equivalent Vite/Capacitor build), then **stop** — they
  do **not** upload to a store, do not run device emulators, and do not publish
  anywhere.
- The produced artifacts are optionally retained as **CI artifacts** for
  inspection, but the pipeline's job is **build-only**.
- This coexists with the **always-run Web / PWA build** in the same CI pipeline:
  the Web build runs regardless of native credentials, and the native builds are
  skipped when their credentials are absent.

## Headless / CLI Execution Rule (No Hanging Dev Servers)

Agents run in a non-interactive CLI environment (`opencode`). When `software-engineer`, `senior-software-engineer`, `staff-software-engineer`, or `qa` runs tests or performs a "live test":
- **NEVER** run an interactive watch command (`vitest` without `run`) or a foreground dev server (`pnpm run dev` / `vite`) that blocks the terminal indefinitely.
- For a **pure-backend slice** of a story (a backend-only story, i.e. before the UI shell exists): run `pnpm run build` and execute an automated integration test or one-shot script (`node` / `vitest run`) importing the public API (`createBudgetApi`) from the built bundle to verify end-to-end behavior.
- For **UI / PWA stories**: use `npx playwright test` (configured with `webServer` in `playwright.config.ts` to auto-start and auto-stop the preview server), or start the preview server in the background, run headless browser/HTTP checks with a timeout, and kill the server PID before finishing the command.
