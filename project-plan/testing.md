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
- **CI shape (`.github/workflows/ci.yml`):** Configure top-level least-privilege `permissions: { contents: read }` and triggers so CI runs once per PR update (targeting `main` or `feature/**`) and once on merges to `main`, avoiding duplicate runs on task-branch pushes:
  ```yaml
  permissions:
    contents: read

  on:
    pull_request:
    push:
      branches: [main]
  ```
   Pipeline steps (main `ci` job, with every `uses:` action pinned to a full 40-character commit SHA `# vX.Y.Z` per [dependency-strategy.md](dependency-strategy.md#ci-actions-the-allowed-set)):
   0. `actions/checkout`, `pnpm/action-setup` (reading `packageManager` from `package.json`, no `corepack` assumption), `actions/setup-node` (`node-version-file: '.nvmrc'` with pnpm cache), then `pnpm install --frozen-lockfile`
   0b. **Zero-prod-dep & supply-chain CI checks** — assert `package.json` **`dependencies` is empty** (`{}`) so a PR that introduces a production dependency fails the gate *before* review, not after (e.g. `node -e "const p=require('./package.json'); if (Object.keys(p.dependencies ?? {}).length) { throw new Error('dependencies must be empty (zero-prod-dep)') }"`), run `pnpm audit --audit-level=high` (using pnpm 10+ bulk advisory audit endpoint) to block any known high/critical vulnerability in the dev toolchain, and on `pull_request` run **`actions/dependency-review-action`** to flag newly-introduced vulnerable or risky dependencies. This is the CI-enforced half of the zero-prod-dep and supply-chain rules in [dependency-strategy.md](dependency-strategy.md); the human gate (senior sign-off) still applies.
   1. `pnpm run lint` (Biome)
   2. `pnpm run typecheck` (`tsc --noEmit` with strict compiler flags from [dependency-strategy.md](dependency-strategy.md#strict-typescript-compiler-flags-tsconfigjson))
   3. `pnpm run test` (`vitest run --coverage`, using `@vitest/coverage-v8` and enforcing `>= 95%` line and branch coverage on `src/core/`)
   4. `pnpm run build` (`vite build`)
   4b. **Post-Build Security & Privacy Artifact Gates** — immediately after `pnpm run build`, run automated Node/shell assertions against `src/` and `dist/` verifying:
      1. **Zero production dependencies:** `package.json` `dependencies` is `{}` (reinforcing step 0b).
      2. **CSP & Referrer `<meta>` present in `dist/index.html`:** `dist/index.html` contains `<meta http-equiv="Content-Security-Policy"` with `connect-src 'none'`, `form-action 'none'`, `require-trusted-types-for 'script'`, and `trusted-types sw-register`, plus `<meta name="referrer" content="no-referrer">` (see [frontend.md → Strict Content Security Policy](frontend.md#1-strict-content-security-policy-indexhtml)). Also verifies `dist/sw.js` was emitted by the custom Vite plugin with the build hash and precache manifest.
      3. **Zero external `http://` or `https://` URLs in `dist/`:** No file in `dist/` contains external `http://` or `https://` asset, font, CDN, or API URLs (allowing only standard W3C SVG/XML namespace URIs such as `http://www.w3.org/2000/svg` or `http://www.w3.org/1999/xhtml`).
      4. **Zero banned DOM XSS sinks in `src/`:** No file in `src/` uses banned HTML-parsing or code-evaluation sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`).
   5. Once a UI shell / Playwright E2E suite exists (the PWA UI from [frontend.md](frontend.md)): run `pnpm exec playwright install --with-deps chromium webkit` to install the headless browser binaries on the runner, followed by `pnpm run test:e2e` — Playwright headless (**Chromium + WebKit**) exercising the PWA UI end-to-end (add expense, set recurring, edit/backdate, search/insights, export/import, plus the mandatory zero-egress, DOM XSS, and `@axe-core/playwright` a11y gates below). `test:e2e` is **gated on the UI shell existing**: until a UI shell ships, step 5 is a no-op in CI and the backend regression is covered by the Vitest integration test in layer 2.
   6. **Static security analysis (CodeQL):** A companion `codeql` job (or dedicated `.github/workflows/codeql.yml` workflow) runs **`github/codeql-action`** (`javascript-typescript`) on PRs and pushes to `main` with job-level `permissions: { contents: read, security-events: write }`. *(OSV-Scanner is optional.)*

  The bootstrap task defines the `lint`, `typecheck`, `test`, `build` (and later `test:e2e`) scripts in `package.json` so these names are real.

  **Zero-prod-dep coherence (req 1).** The CI/dev-deps surface is consistent with [dependency-strategy.md](dependency-strategy.md): every *package* the pipeline installs or runs — Vite, Vitest, `@vitest/coverage-v8`, Playwright, `@axe-core/playwright`, `fake-indexeddb`, Biome, tsc — lives in **`devDependencies`** and is used **only** at build/test/lint time; `package.json` **`dependencies` MUST stay empty**, so CI never installs or ships a production dependency and nothing production is loaded at runtime. **pnpm** is the *package manager* that provisions these — it is **not** a `devDependency`; it is set up via the `packageManager` field and `pnpm/action-setup` in CI (no `corepack` assumption; see [dependency-strategy.md](dependency-strategy.md)). The two load-bearing decisions — **integer-cent money** (`amountCents`, pure integer-domain TS) and the **reserved bank-OAuth slots** (`bank-sync` / `externalTxnId` / `sourceAccountId`) — are **pure TypeScript logic** over built-in Web APIs and therefore **introduce no production dependency**: they never appear as a new package in `dependencies` or `devDependencies`, and they are exercised by the `test` (Vitest unit/integration) and `test:e2e` (PWA UI) steps, not by any runtime package. See [data-model.md](data-model.md) and [activity-model.md](activity-model.md).
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

## Coverage Threshold & Mandatory Security / Edge-Case Test Matrix

To guarantee mathematical accuracy, storage durability, and security/privacy compliance across all three targets, the test suite enforces the following coverage gate and mandatory scenario matrix:

### 1. Core Coverage Gate (`>= 95%` on `src/core/`)

- Vitest coverage MUST enforce **`>= 95%` line and branch coverage** across `src/core/` (`types.ts`, `validate.ts`, `engine.ts`, `funds.ts`, `insights.ts`). Any PR that drops `src/core/` coverage below `95%` fails CI step 3.

### 2. Mandatory Unit Test Scenarios (`src/core/*.test.ts`)

- **Integer-cent money & safe-integer boundary guards:**
  - `toCents` / `fromCents` boundary conversions, rejection of `0`, negative numbers, `NaN`, `Infinity`, sub-cent fractions (`12.345`), and values exceeding `Number.MAX_SAFE_INTEGER / 100` (closing the `Number.isInteger(1e23)` overflow gap; see [data-model.md](data-model.md)).
- **Short-month recurring date clamping (`missingPeriods` & `dueDateTime`):**
  - Rules configured with `dayOfMonth = 29`, `30`, or `31` clamp via `Math.min(rule.schedule.dayOfMonth, daysInMonth)` to `2026-02-28T00:00:00.000Z` (non-leap Feb), `2024-02-29T00:00:00.000Z` (leap Feb), and `2026-04-30T00:00:00.000Z` (30-day months), never overflowing `Date.UTC` into the next month (see [recurring-engine.md](recurring-engine.md)).
- **Recurring engine idempotency & lifecycle:**
  - Duplicate `(sourceRuleId, period)` prevention across repeated `runRecurringEngine` calls, multi-month/year-boundary catch-up (`2025-11` → `2026-02`), paused rule (`active: false`) skipping, back-fill upon re-enable, and non-regeneration when a user deletes an already-posted recurring activity (`rule.lastPostPeriod` remains advanced; see [activity-model.md](activity-model.md)).
- **Derived Available Funds & 5-year tag insights:**
  - `computeAvailableFunds` (`income` + `deposit` − `expense` in integer cents), `searchActivities` intersecting `since` / `until` / `tag` / `type` predicates, and `summarizeByTag` rollups over multi-year datasets.
- **Hardened backup payload validation (`validateBackupPayload`):**
  - Rejection of payloads exceeding the 10 MB (`10 * 1024 * 1024` bytes) ceiling before `JSON.parse`, rejection of prototype-pollution keys (`__proto__`, `constructor`, `prototype`) at any nesting depth, rejection of unknown `schemaVersion`, duplicate `id`s, mixed currencies, or invalid ISO-8601 UTC timestamps.

### 3. Mandatory Storage & API Integration Scenarios (`fake-indexeddb`)

- **IndexedDB `DB_VERSION = 1` schema & secondary indexes:**
  - Verifies `onupgradeneeded` creates `"meta"` (`schemaVersion: 1`), `"rules"` (`by_active`), and `"activities"` (`by_dateTime`, `by_type`, `by_tags` multiEntry, and compound `by_rule_period`), and persists data across simulated cold/warm restarts.
- **Atomic backup import rollback test (`replaceAll`):**
  - Seeds existing rules and activities in IndexedDB, attempts `budget.importBackup(...)` with malformed, corrupt, schema-invalid, or prototype-polluting JSON (as well as simulated mid-transaction write failure), and asserts that the call rejects cleanly while all pre-existing IndexedDB records and `getAvailableFunds()` remain **100% intact**.
- **Storage durability persistence call:**
  - Verifies `budget.init()` invokes `navigator.storage?.persist?.()` best-effort and succeeds without throwing when `navigator.storage` is absent or returns `false`.

### 4. Mandatory Playwright E2E Security, Privacy & Viewport Scenarios (`e2e/**/*.spec.ts`)

All Playwright E2E scenarios run against the production-built bundle (`vite preview`) on headless **Chromium** and **WebKit** across all three required viewports (`375×667` iPhone-Duo folded, `829×1194` iPhone-Duo unfolded, and `390×844` typical slab phone; see [frontend.md](frontend.md)):

- **Zero network egress E2E assertion (App Store / Play Store "Data Not Collected" proof):**
  - Before navigating, the test attaches `context.on("request", ...)` (and `page.on("request", ...)`) across the entire end-to-end user journey (initial load, adding rules/activities, running the recurring engine, filtering insights, exporting/importing backups, and offline reload) and fails immediately if any request targets an origin other than the local preview server (`127.0.0.1` / `localhost`) or `data:` / `blob:`:
    ```ts
    context.on("request", (req) => {
      const url = new URL(req.url());
      const allowed =
        url.protocol === "data:" ||
        url.protocol === "blob:" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost";
      expect(allowed, `Unexpected external network request: ${req.url()}`).toBe(true);
    });
    ```
- **DOM XSS immunity E2E test:**
  - Enters `<img src=x onerror="window.__xss=true">` and `<script>window.__xss=true</script>` in rule labels, activity labels, tags, memos, and imported JSON backup payloads. Asserts that every payload renders literally as visible text via `textContent`, `await page.evaluate(() => (window as any).__xss)` is `undefined`, and zero `pageerror`, `console.error`, or CSP violation events occur.
- **Atomic backup import rollback E2E test:**
  - Exports a valid backup from the Settings UI, attempts to import a corrupt/prototype-polluting `.json` file, verifies an accessible error alert (`aria-invalid` / error banner) is displayed while existing activities and Available Funds remain 100% intact, and then imports the valid backup to verify full restoration.
- **iPhone-Duo dual-state layout & WCAG accessibility verification (including automated `axe` scans):**
  - Asserts one-page fit (`document.documentElement.scrollHeight <= window.innerHeight` and `scrollWidth <= window.innerWidth`) on `375×667` (folded single-panel) and `829×1194` (unfolded split-pane), `>= 44×44 CSS px` interactive touch targets, and `aria-live="polite"` Available Funds updates.
  - Runs an automated **`@axe-core/playwright`** (`AxeBuilder`) accessibility scan with tags `["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]` across **every tab** (Budget, Insights, Settings) and **every open `<dialog>`** modal, asserting zero violations.
- **Preview build DB-name isolation E2E test (OQ-1 origin isolation):**
  - Builds and serves the app with a PR-preview base path (e.g. `VITE_BASE_PATH=/simple-budget-app/pr-999/`), initializes the app, and asserts that the opened IndexedDB database is named `simple-budget-app-pr-999` (distinct from production's `simple-budget-app`), proving PR previews never share, mutate, or upgrade the production database on the shared `tandyn.github.io` origin (see [storage.md → IndexedDB Schema Versioning](storage.md#indexeddb-schema-versioning-indexes--migration-strategy)).
- **Service Worker offline, `pr-*` bypass, cache-versioning & update-banner E2E test (Chromium):**
  - Verifies the plugin-emitted `sw.js` registers under `BASE_URL` (and is skipped when `window.Capacitor` is present), populates the versioned `sbapp-<buildhash>` cache with the emitted precache manifest, and serves the app cleanly offline (`context.setOffline(true)` reload via network-first navigation with cache fallback).
  - Verifies that the production SW bypasses/excludes `/simple-budget-app/pr-*` requests instead of serving the cached production `index.html`.
  - Verifies the update lifecycle: when a newer SW version enters `waiting`, the controller does **not** swap silently; an accessible "Update available" banner is shown, and only after user acceptance (sending `{ type: "SKIP_WAITING" }` → `self.skipWaiting()`) does the new `sbapp-<newbuildhash>` cache activate and prune obsolete `sbapp-*` caches on `activate`.

## CI deploy & preview (GitHub Pages)

The deployment target is **GitHub Pages** (HTTPS, secure context), configured
with source **"Deploy from a branch" → `gh-pages` (`/`)**. There is no
Cloudflare Pages in this plan; the architecture below is the **one and only**
deploy/preview architecture. (See [dependency-strategy.md → CI actions
(the allowed set)](dependency-strategy.md#ci-actions-the-allowed-set) for the
allowed, well-maintained GitHub Actions that implement the build steps;
publishing itself uses plain `git` with `GITHUB_TOKEN`.)

### Production base path

- **Production base (the site root):** `https://tandyn.github.io/simple-budget-app/`
- The production build is configured with **base path `/simple-budget-app/`**
  (the repo's `VITE_BASE_PATH` / `base` in `vite.config.ts`). This is the URL
  the **production** app is served from on GitHub Pages.
- **Production deploy writes only the root** — it builds to `/simple-budget-app/`
  and updates root files on the `gh-pages` branch while preserving all open
  `pr-*/` directories. The production root is **not** touched by PR preview
  deploys (see the production-untouched guarantee below).

### Configurable base path (explicit build decision)

- The base path is a **configurable build-time input** (`VITE_BASE_PATH`, or
  `base` in `vite.config.ts`), **not a hardcoded constant**. This is an explicit
  architectural decision: it is what makes **mode (a) same-site sub-path** PR
  previews possible without a second site, and it is what lets the **per-PR
  preview path** be computed at build/deploy time from the **PR number**.
- **PR-number source at build/deploy time:** the PR number is read from the
  GitHub event context in the workflow — `github.event.pull_request.number` on
  `pull_request` events (`opened`, `synchronize`, `reopened`, `closed`). It is
  injected into the build as `VITE_BASE_PATH=/simple-budget-app/pr-<PR#>/`. This
  is the **only** source of the PR number; nothing else (env var, config file)
  is used.
- **Worked example:** for **PR #120**, the preview build is configured with
  `VITE_BASE_PATH=/simple-budget-app/pr-120/` and is published to
  `https://tandyn.github.io/simple-budget-app/pr-120/` — a **sub-path** of the
  same production site, with **all asset URLs rewritten** to the `/pr-120/`
  prefix so the preview is a fully self-contained build.

### Mode (a) — same-site sub-path (confirmed architecture)

The **confirmed** PR-preview architecture is **mode (a)**: **same-site,
sub-path**. Each open PR targeting `main` gets a preview at
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

> **Decision note (OQ-5 — flagged to user):** The user-confirmed **mode (a)**
> behavior and guarantees above (production at root, `pr-<PR#>/` previews,
> cleanup on PR close, serialized `concurrency: { group: "pages-deploy",
> cancel-in-progress: false }`) are preserved unchanged; only the underlying
> publishing **mechanism** is changed from the legacy `actions/deploy-pages`
> artifact flow to **plain `git` publishing to the `gh-pages` branch using
> `GITHUB_TOKEN`** (Pages source = **"Deploy from a branch" → `gh-pages`**).
> This mechanism change is explicitly flagged to the user. **Why (G2):**
> `actions/deploy-pages` on `pull_request` is rejected by the `github-pages`
> environment's default deployment-branch rule (only the default branch may
> deploy), and `actions/deploy-pages` replaces the entire site on every run with
> no built-in source for the previously deployed tree. Publishing to `gh-pages`
> via plain `git` makes the branch itself the persistent source of truth for the
> existing site tree without adding any third-party Pages action (actions such
> as `peaceiris/actions-gh-pages` and `rossjrw/pr-preview-action` are rejected
> under the [first-party / well-maintained criterion](dependency-strategy.md#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency)).

### CI workflow mechanics (`gh-pages` branch publishing / prune-on-merge / production-unchanged)

The CI deploy workflow (`.github/workflows/deploy-pages.yml`, separate from the
`ci` test job above) implements the three mechanics below. It uses only the
already-allowed build actions — `actions/checkout`, `actions/setup-node`, and
`pnpm/action-setup` (all full-SHA pinned, see
[CI actions (the allowed set)](dependency-strategy.md#ci-actions-the-allowed-set))
— plus built-in **`git`** with `GITHUB_TOKEN`. No third-party Pages action is
used, and GitHub Pages is configured in repository settings as **"Deploy from a
branch" → `gh-pages` (`/`)**.

- **Conscious PR trigger scope:** PR preview deploys and prunes trigger **only
  on pull requests targeting `main`** (`on: pull_request: branches: [main],
  types: [opened, synchronize, reopened, closed]`), **not** on every
  intermediate task PR targeting a feature branch. This prevents unnecessary
  `gh-pages` commit churn and deploy-queue contention during task-level work
  while ensuring every feature/story PR targeting `main` receives a live preview
  before merge and is cleaned up on close. Fork PRs do not receive
  `contents: write` on `GITHUB_TOKEN`, so the publish job is skipped on fork PRs
  rather than elevating untrusted triggers.

**1. Preview publish (on `pull_request` targeting `main`: `opened`, `synchronize`, `reopened`).**

- **Trigger:** `on: pull_request: branches: [main], types: [opened, synchronize, reopened]`.
- **Read the PR number** from `github.event.pull_request.number` (see
  *PR-number source* above).
- **Build with the per-PR base path:** `VITE_BASE_PATH=/simple-budget-app/pr-<PR#>/ pnpm run build`
  (e.g. `VITE_BASE_PATH=/simple-budget-app/pr-120/ pnpm run build` for PR #120).
- **Publish only the `pr-<PR#>/` sub-path to `gh-pages`:**
  - Check out the `gh-pages` branch into a working directory (initializing an
    orphan `gh-pages` branch on first run if it does not yet exist).
  - Replace **only** `pr-<PR#>/` (`rm -rf pr-<PR#> && mkdir -p pr-<PR#> && cp -R dist/. pr-<PR#>/`), leaving all production root files and all other
    active `pr-*/` directories byte-for-byte untouched.
  - Commit and `git push origin gh-pages` using `GITHUB_TOKEN` (with
    `contents: write` scoped strictly to the publish job).
- **The production root is NOT written** — only the `pr-<PR#>/` directory is
  written by a PR preview deploy (guarantee 1).

**2. Prune-on-close (on `pull_request` targeting `main`: `closed`).**

- **Trigger:** `on: pull_request: branches: [main], types: [closed]` (fires on
  **both** merge and non-merge close).
- **Read the PR number** from `github.event.pull_request.number`.
- **Remove the `pr-<PR#>/` sub-path** from the `gh-pages` branch:
  - Check out `gh-pages`.
  - If `pr-<PR#>/` exists, run `git rm -rf pr-<PR#>/`, commit, and
    `git push origin gh-pages` using `GITHUB_TOKEN`.
  - Because the production root files and all other `pr-*/` directories are
    unchanged and `pr-<PR#>/` is now removed, the sub-path is **pruned**
    (guarantee 2) while the production root remains **untouched**.

**3. Production deploy (on `push` to `main`).**

- **Trigger:** `on: push: branches: [main]`.
- **Build with the production base path:** `VITE_BASE_PATH=/simple-budget-app/ pnpm run build`.
- **Publish only the root files excluding `pr-*/` to `gh-pages`:**
  - Check out `gh-pages` (orphan-initializing on first run if absent).
  - Remove stale production root files/directories **excluding `.git` and
    `pr-*/`**, then copy `dist/.` into the `gh-pages` root.
  - Commit and `git push origin gh-pages` using `GITHUB_TOKEN`.
  - A `main` push is the only thing that writes the production root, and all
    open `pr-*/` preview directories remain preserved.

**In summary:** a PR preview is a **pure additive** `pr-<PR#>/` directory on
`gh-pages`; it is **pruned** via `git rm -rf pr-<PR#>/` on merge/close; the
production root is **only ever** written by a `main` push (excluding `pr-*/`).
These three mechanics, taken together, implement the two hard mode-(a)
guarantees above.

### GitHub Pages Mode-(a) Concurrency & Site-Tree Preservation (`.github/workflows/deploy-pages.yml`)

Because concurrent pushes to the `gh-pages` branch (PR preview publishes, PR-close prune jobs, and `main` production deploys) would otherwise race on non-fast-forward pushes or overwrite each other's changes, all publishes must serialize cleanly:

- **Serialized FIFO workflow concurrency:** `.github/workflows/deploy-pages.yml` MUST declare workflow-level concurrency:
  ```yaml
  concurrency:
    group: "pages-deploy"
    cancel-in-progress: false
  ```
  Setting `cancel-in-progress: false` guarantees that every queued PR preview publish, PR-close prune, and `main` deploy runs to completion sequentially in FIFO order against the latest `gh-pages` tip rather than aborting an in-flight publish or losing a prune event.
- **Least-privilege permissions:** Top-level workflow permissions default to `permissions: { contents: read }`, elevating to `permissions: { contents: write }` **only on the `gh-pages` publish job** (see [dependency-strategy.md](dependency-strategy.md)).
- **Deterministic site-tree preservation:** The `gh-pages` branch itself is the canonical source of truth for the existing site tree. During each serialized run, the publish job mutates only the target `pr-<PR#>/` directory (writing `pr-<PR#>/` on `pull_request` open/synchronize/reopen or running `git rm -rf pr-<PR#>/` on `closed`) or updates only the root files excluding `pr-*/` (on `push` to `main`).

## Android + iOS test-build pipeline (credential-skip, build-only)

The native shells (Capacitor) are a later milestone (see [frontend.md](frontend.md)
and [portability.md](portability.md)), but the **CI pipeline for building the
Android + iOS apps** is specified now so it is designed in-plan alongside the
PWA build. **Build-only** — it does **not** upload to any store (App Store /
Play Store); it only produces the signed build artifacts.

### Behavior: skip-when-credentials-absent

- The Android and iOS build jobs are **gated at job level by a repository
  variable** (`vars.NATIVE_BUILDS_ENABLED == 'true'`). **When the variable is
  unset or not `'true'` (e.g. before signing credentials have been provisioned),
  the native jobs are SKIPPED (not failed).** This is the **skip-not-fail**
  behavior: the pipeline must not be red when native builds are not yet enabled.
- **The Web / PWA build is always-run.** It is **not** variable- or
  credential-gated and always runs. The native builds are **optional /
  variable-gated** and coexist with the always-run Web build in the same CI
  pipeline.

### Credential gates (job-level repo variable + step-level secret env)

> **Why a repository variable (`vars.*`) and never `secrets.*` in `if:`:**
> GitHub Actions forbids referencing the `secrets` context inside `if:`
> expressions, and job-level `if:` does not have access to the `env` context.
> Gating at job level with `vars.NATIVE_BUILDS_ENABLED == 'true'` is valid
> GitHub Actions syntax and cleanly skips the entire runner allocation when
> native builds are disabled.

| Platform | Job-level gate (`jobs.<id>.if`) | Signing secrets (mapped to step `env:` inside the job) |
| -------- | ------------------------------- | ------------------------------------------------------ |
| **Android** | `if: ${{ vars.NATIVE_BUILDS_ENABLED == 'true' }}` | `ANDROID_KEYSTORE_B64` (base64-encoded Android signing keystore; JDK provisioned via full-SHA pinned `actions/setup-java`) |
| **iOS** | `if: ${{ vars.NATIVE_BUILDS_ENABLED == 'true' }}` | `IOS_CERTIFICATE_B64` and `IOS_PROVISIONING_PROFILE_B64` (base64-encoded iOS signing certificate and provisioning profile; Xcode/keychain configured via runner tooling) |

When `vars.NATIVE_BUILDS_ENABLED` is not `'true'`, both jobs are **skipped**
(green/skipped, not failed). When enabled, signing secrets are mapped into
job/step `env:` and consumed by the build steps — never referenced directly in
an `if:` expression. This matches [build-order.md](build-order.md) identically.

### Build-only scope

- The jobs **build** the signed artifacts (e.g. `cap build android` /
  `cap build ios`, or the equivalent Vite/Capacitor build), then **stop** — they
  do **not** upload to a store, do not run device emulators, and do not publish
  anywhere.
- The produced artifacts are optionally retained as **CI artifacts** for
  inspection, but the pipeline's job is **build-only**.
- This coexists with the **always-run Web / PWA build** in the same CI pipeline:
  the Web build runs regardless of native credentials, and the native builds are
  skipped when `vars.NATIVE_BUILDS_ENABLED` is not `'true'`.

## Explicitly Skipped / Deferred Testing & Verification Techniques

The following techniques were evaluated and deliberately **not** adopted as MVP
CI gates:

- **Mutation testing (e.g. Stryker):** Skipped as a blocking PR CI gate for MVP
  because its runtime and maintenance cost outweigh its value alongside `>= 95%`
  `src/core/` line/branch coverage. May be added later as an optional nightly
  (non-blocking) run scoped to `src/core/engine.ts` and `src/core/validate.ts`.
- **Visual regression testing (screenshot diffs):** Skipped as a CI gate for
  MVP. WebKit-on-Linux rendering differs from iOS Safari/`WKWebView`, producing
  flaky pixel diffs whose triage cost outweighs value; layout invariants are
  enforced deterministically via viewport geometry assertions (`scrollHeight <=
  window.innerHeight`, `scrollWidth <= window.innerWidth`, `>= 44×44 CSS px`
  touch targets).
- **Vitest browser mode:** Skipped for MVP. `src/core/` is pure TypeScript,
  `src/storage/` is tested against `fake-indexeddb` in Node, and real-browser
  DOM/rendering behavior is already verified end-to-end by Playwright across
  Chromium and WebKit against `vite preview`.
- **Subresource Integrity (SRI):** Skipped. Every runtime asset is same-origin
  and self-hosted with Vite content-hashed filenames under `default-src 'self'`
  CSP; SRI only protects third-party-hosted subresources, which are banned by
  the zero-prod-dep and zero-external-URL rules (see
  [dependency-strategy.md](dependency-strategy.md)).

## Headless / CLI Execution Rule (No Hanging Dev Servers)

Agents run in a non-interactive CLI environment (`opencode`). When `software-engineer`, `senior-software-engineer`, `staff-software-engineer`, or `qa` runs tests or performs a "live test":
- **NEVER** run an interactive watch command (`vitest` without `run`) or a foreground dev server (`pnpm run dev` / `vite`) that blocks the terminal indefinitely.
- For a **pure-backend slice** of a story (a backend-only story, i.e. before the UI shell exists): run `pnpm run build` and execute an automated integration test or one-shot script (`node` / `vitest run`) importing the public API (`createBudgetApi`) from the built bundle to verify end-to-end behavior.
- For **UI / PWA stories**: use `npx playwright test` (configured with `webServer` in `playwright.config.ts` to auto-start and auto-stop the preview server), or start the preview server in the background, run headless browser/HTTP checks with a timeout, and kill the server PID before finishing the command.
