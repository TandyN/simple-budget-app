# Budget App — Testing, Toolchain & CI

Tracks what is real in code for the Phase 1 toolchain, security/privacy gates, CI workflows, and repository-level hardening. Design-of-record: [project-plan/testing.md](../../project-plan/testing.md) and [project-plan/dependency-strategy.md](../../project-plan/dependency-strategy.md).

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
  - `vite.config.ts` reads `process.env.VITE_BASE_PATH ?? "/simple-budget-app/"`.
  - `vitest.config.ts` runs in `environment: "node"` with `@vitest/coverage-v8`, `test.include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"]`, `coverage.include: ["src/**/*.ts"]`, and `"src/core/**/*.ts": { lines: 95, branches: 95 }` (exits `0` in Phase 1 before `src/core/` exists, and auto-enforces `>= 95%` as soon as Phase 2 files land).
  - `playwright.config.ts` defines 6 projects (Chromium × WebKit across `375×667` folded, `829×1194` unfolded, and `390×844` slab) against `vite preview` on `http://127.0.0.1:4173/simple-budget-app/`.
- **Post-build security & privacy gates (`scripts/verify-build-gates.mjs`):** Wired as `pnpm run verify:gates` to verify (1) empty `dependencies`/`optionalDependencies`, exact `devDependencies`, and zero `@capacitor/*` imports in `src/`; (2) strict CSP + Trusted Types + `referrer=no-referrer` and no `frame-ancestors` in `dist/index.html` (comments stripped by a linear scanner, not a regex; leftover nested/overlapping comment markers and the HTML5 comment-end forms `<!-->`, `<!--->`, `--!>` fail closed; tests in `scripts/verify-build-gates.test.mjs`); (3) zero external `http(s)://` URLs in `dist/` outside W3C XML namespaces; and (4) zero banned DOM XSS / eval sinks in non-test `src/` files.

## CI & Supply-Chain Workflows

- **`.github/workflows/ci.yml`:**
  - Top-level least-privilege `permissions: { contents: read }`; triggers on `pull_request` and `push` to `main` (avoids duplicate runs on task-branch pushes).
  - Every `uses:` action is pinned to its verified full 40-character commit SHA with `# vX.Y.Z` comment (`actions/checkout`, `pnpm/action-setup` without `version:`, `actions/setup-node` after `pnpm/action-setup`, `actions/dependency-review-action`, `github/codeql-action/init`, `github/codeql-action/analyze`).
  - **`ci` job** (required status check context name: `ci`): `pnpm install --frozen-lockfile` → `actions/dependency-review-action` (`pull_request` only, `fail-on-severity: high`) → `pnpm audit --audit-level=high` → `pnpm run lint` → `pnpm run typecheck` → `pnpm test` → `pnpm run build` → `pnpm run verify:gates` → Phase 4A-gated Playwright E2E step (runs only when `e2e/**/*.spec.ts` files exist; skips cleanly in Phases 1–3).
  - **`codeql` job:** Job-level `permissions: { contents: read, security-events: write }`, running `github/codeql-action/init` (`languages: javascript-typescript`) and `github/codeql-action/analyze`.
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
