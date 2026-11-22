# Budget App — Testing, Toolchain & CI

Tracks what is real in code for the toolchain, security/privacy gates, Playwright E2E harness, CI & `gh-pages` deploy workflows, and repository-level hardening. Design-of-record: [project-plan/testing.md](../../project-plan/testing.md) and [project-plan/dependency-strategy.md](../../project-plan/dependency-strategy.md).

## Phase 1 Toolchain Conventions

- **Node.js (`.nvmrc` + `engines`):** `.nvmrc` pins `26` (Node.js 26 Active LTS "Lithium"); `package.json` sets `"engines": { "node": ">=26.13.0 <27" }`. CI uses `actions/setup-node` with `node-version-file: ".nvmrc"`.
- **pnpm 12 (`packageManager` + `pnpm-workspace.yaml`):** `package.json` sets `"packageManager": "pnpm@12.21.0"` (provisioned via `pnpm/action-setup` in CI without assuming `corepack`; locally pnpm auto-switches via `pmOnFail: download`). `pnpm-workspace.yaml` enforces:
  - `saveExact: true` (exact versions in `package.json`; `.npmrc` keeps `save-exact=true` for npm fallback, ignored by pnpm 12),
  - `minimumReleaseAge: 4320` (72-hour / 3-day supply-chain release cooldown),
  - `allowBuilds: {}` (replaces pnpm 10's removed `onlyBuiltDependencies`; pnpm 12 rejects unknown keys).
- **Split TypeScript configs (`tsconfig.json` / `tsconfig.node.json`):**
  - `tsconfig.json` enforces all mandatory strict flags (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `isolatedModules`, `verbatimModuleSyntax`, `skipLibCheck: false`), scopes `"include": ["src"]`, and sets `"types": ["vite/client"]` so browser/core code never sees Node globals.
  - `tsconfig.node.json` extends `tsconfig.json`, sets `"types": ["node"]` (isolating `@types/node` to Node configs), and covers `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, and `e2e`.
  - `pnpm run typecheck` runs both: `tsc --noEmit && tsc -p tsconfig.node.json --noEmit`.
- **Biome v2 (`biome.json`):** Uses `@biomejs/biome` v2 schema with `files.includes` and `!!` force-ignore patterns (`dist`, `coverage`, `.opencode`, `node_modules`, `playwright-report`, `test-results`, `**/*.md`) plus `vcs.useIgnoreFile: true` (Biome v2 removed `files.ignore`).
- **Vite, Vitest & Playwright:**
  - `vite.config.ts` reads `process.env.VITE_BASE_PATH ?? "/simple-budget-app/"` (with `build.emptyOutDir: false` so the SPA build preserves `dist/budgetApi.es.js` emitted by `vite.lib.config.ts`).
  - `vitest.config.ts` runs in `environment: "node"` by default (colocated DOM/platform unit tests in `src/main.test.ts`, `src/ui/`, and `src/platform/` opt into `happy-dom` per file via `// @vitest-environment happy-dom`) with `@vitest/coverage-v8`, `test.include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"]`, `coverage.include: ["src/**/*.ts"]`, and `"src/core/**/*.ts": { lines: 95, branches: 95 }` (actively enforcing `>= 95%` line/branch coverage on `src/core/`).
  - `playwright.config.ts` defines 6 projects (Chromium × WebKit across `375×667` folded, `829×1194` unfolded, and `390×844` slab) against `vite preview --host 127.0.0.1 --port 4173 --strictPort` (`baseURL: "http://127.0.0.1:4173/simple-budget-app/"`), invoked via `pnpm run test:e2e`.
- **Post-build security & privacy gates (`scripts/verify-build-gates.mjs`):** Wired as `pnpm run verify:gates` to verify (1) empty `dependencies`/`optionalDependencies`, exact `devDependencies`, and zero `@capacitor/*` imports in `src/`; (2) strict CSP + Trusted Types + `referrer=no-referrer` and no `frame-ancestors` in `dist/index.html` (comments stripped by a linear scanner, not a regex; leftover nested/overlapping comment markers and the HTML5 comment-end forms `<!-->`, `<!--->`, `--!>` fail closed; tests in `scripts/verify-build-gates.test.mjs`); (3) zero external `http(s)://` URLs in `dist/` outside W3C XML namespaces; and (4) zero banned DOM XSS / eval sinks in non-test `src/` files.

## Playwright E2E Harness (`e2e/`)

- **Shared fixtures & assertions (`e2e/fixtures/index.ts`, #277):**
  - Auto-enabled `zeroEgressAndConsoleGate` fixture attaches `context.on("request")` before navigation (permitting only the local preview origin and `data:` / `blob:` schemes via `isAllowedRequestUrl`) and attaches `pageerror` / `console` (`error` / `warning`) listeners across every page in the context, asserting zero disallowed requests and zero console/page errors at teardown.
  - `assertZeroAxeViolations(page, contextLabel?)`: runs `@axe-core/playwright` (`AxeBuilder`) with `WCAG_22_AA_TAGS` (`["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]`).
  - `assertZeroViewportOverflow(page, contextLabel?)`: asserts `scrollHeight <= window.innerHeight`, `scrollWidth <= window.innerWidth`, and the folded (`< 700px` → `column`) vs. unfolded (`>= 700px` → `row` + `200px` `nav[role="tablist"]` rail) layout invariant.
  - `assertTouchTargetGeometry(page, selector?)`: asserts every matching visible interactive control is `>= 44×44 CSS px` (`MIN_TOUCH_TARGET_PX = 44`).
- **Phase 4A smoke suite (`e2e/smoke.spec.ts`, #277):** runs across all 6 Chromium + WebKit viewport projects verifying strict CSP / Trusted Types / `no-referrer` boot with zero external egress and zero console/page errors, WCAG 2.2 AA axe + zero-overflow + touch-target checks across all 3 tabs (including wrapping `ArrowRight`/`ArrowLeft` roving `tabindex` navigation), and the same checks on an open `dialog.confirm-dialog` modal (including focus restoration to the invoking tab on dismissal).
- **Phase 4B Budget tab E2E suite (`e2e/budget.spec.ts`, #307):** co-shipped Playwright E2E suite running across all 6 Chromium + WebKit viewport projects against real IndexedDB in the `dist/` bundle (`vite preview`) covering cold start (`$0.00` `aria-live="polite"` Available Funds + zero external egress), Recurring Rules CRUD + auto-post on due day + reload persistence/idempotency + pause/resume + delete preserving prior history, manual `deposit`/`income`/`expense` integer-cent math + reload persistence, native `<dialog>` Edit/Backdate/Tag and Delete confirmation (Cancel/Confirm + non-repost of deleted recurring activities), DOM XSS inert-text immunity (`<img onerror>` / `<script>` in rule name, memo, and tags), and WCAG 2.2 AA axe + zero-overflow + `>= 44×44 CSS px` touch-target gates across populated views and open modals.

## CI & Supply-Chain Workflows

- **`.github/workflows/ci.yml`:**
  - Top-level least-privilege `permissions: { contents: read }`; triggers on `pull_request` and `push` to `main` (avoids duplicate runs on task-branch pushes).
  - Every `uses:` action is pinned to its verified full 40-character commit SHA with `# vX.Y.Z` comment (`actions/checkout`, `pnpm/action-setup` without `version:`, `actions/setup-node` after `pnpm/action-setup`, `actions/dependency-review-action`, `github/codeql-action/init`, `github/codeql-action/analyze`).
  - **`ci` job** (required status check context name: `ci`): `pnpm install --frozen-lockfile` → `actions/dependency-review-action` (`pull_request` only, `fail-on-severity: high`) → `pnpm audit --audit-level=high` → `pnpm run lint` → `pnpm run typecheck` → `pnpm test` → `pnpm run build` → `pnpm run verify:gates` → Playwright E2E step (`pnpm exec playwright install --with-deps chromium webkit` + `pnpm run test:e2e`, gated on `e2e/**/*.spec.ts` existing and active as of Phase 4A).
  - **`codeql` job:** Job-level `permissions: { contents: read, security-events: write }`, running `github/codeql-action/init` (`languages: javascript-typescript`) and `github/codeql-action/analyze`.
- **`.github/workflows/deploy-pages.yml` (#278, OQ-5 confirmed):**
  - Mode-(a) same-site sub-path PR-preview and production GitHub Pages deploy workflow publishing via plain `git` to the `gh-pages` branch using `GITHUB_TOKEN` (Pages source = "Deploy from a branch" → `gh-pages`; zero third-party Pages actions).
  - Top-level least-privilege `permissions: { contents: read }` with `permissions: { contents: write }` scoped strictly to the `publish` job (which skips fork PRs via `github.event.pull_request.head.repo.full_name == github.repository`); serialized FIFO workflow `concurrency: { group: "pages-deploy", cancel-in-progress: false }` with a 3-attempt retry/rebase-on-push loop (`git fetch` + `git rebase refs/remotes/origin/gh-pages` with deterministic re-application fallback) and staged-path isolation assertions.
  - On `pull_request` targeting `main` (`opened`, `synchronize`, `reopened`): builds with `VITE_BASE_PATH=/simple-budget-app/pr-<PR#>/`, runs `pnpm run verify:gates`, and writes only `pr-<PR#>/` on `gh-pages` (leaving the production root and sibling `pr-*/` directories untouched).
  - On `pull_request` targeting `main` (`closed`): runs `git rm -rf --ignore-unmatch pr-<PR#>/` on `gh-pages` (skipping pnpm/Node/build setup) to prune the preview sub-path while leaving production root and sibling `pr-*/` directories untouched.
  - On `push` to `main`: builds with `VITE_BASE_PATH=/simple-budget-app/`, runs `pnpm run verify:gates`, and updates root files on `gh-pages` (`find ... ! -name '.git' ! -name 'pr-*'`) while preserving all active `pr-*/` preview directories.
  - Verified by `scripts/deploy-pages-workflow.test.mjs` (static YAML security/SHA-pin/permission assertions + end-to-end execution of the workflow's `run:` script against a local bare `origin` git fixture covering orphan init, additive PR preview deploy, root deploy preserving `pr-*/`, PR close prune, shallow `--depth=1` clones, and non-fast-forward rebase retry recovery).
- **`.github/dependabot.yml`:** `version: 2`, weekly updates for both `npm` (`/`) and `github-actions` (`/`) with 3-day `cooldown` (`default-days: 3`, aligned with `minimumReleaseAge: 4320`) and PR grouping (`dev-dependencies` minor/patch for `npm`, `github-actions` for workflows).

## Post-Merge Repository Hardening Commands

Execute these `gh api` commands immediately after Story #216's Feature PR merges `.github/workflows/ci.yml` to `main` (`staff-software-engineer` owner; verified in Spike #224):

1. **Enable Dependabot alerts & Dependency Graph:**
   ```bash
   gh api -X PUT repos/TandyN/simple-budget-app/vulnerability-alerts
   ```
   *(Optional: `gh api -X PUT repos/TandyN/simple-budget-app/automated-security-fixes` enables Dependabot security update PRs.)*

2. **Require full-length commit SHA pinning for GitHub Actions:**
   ```bash
   gh api -X PUT repos/TandyN/simple-budget-app/actions/permissions \
     -F enabled=true -f allowed_actions=all -F sha_pinning_required=true
   ```

3. **Enable `main` branch protection requiring the `ci` status check (per [project-plan/testing.md](../../project-plan/testing.md#conventions)):**
   ```bash
   gh api -X PUT "repos/TandyN/simple-budget-app/branches/main/protection" --input - <<'EOF'
   {
     "required_status_checks": { "strict": false, "checks": [ { "context": "ci" } ] },
     "enforce_admins": true,
     "required_pull_request_reviews": null,
     "restrictions": null
   }
   EOF
   ```
   Do **not** enable GitHub's "Require approvals" PR review rule (`required_pull_request_reviews: null`), because all agent roles authenticate under the same GitHub account and GitHub forbids self-approval; multi-role review gates are enforced by the orchestrator's signed-comment checks. Never pass `--admin` to `gh pr merge`.
