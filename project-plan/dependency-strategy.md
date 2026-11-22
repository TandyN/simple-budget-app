# Dependency strategy

**Decision (Story #21 / spike #22):** the root web bundle (backend and frontend) has **zero production
dependencies** and a small set of **well-maintained, industry-standard dev
dependencies**. This is a hard constraint, not a preference.

## The two rules

1. **Zero production dependencies in the web bundle package (the hard constraint).**
   The root **web bundle package** (`package.json`) MUST keep `dependencies`
   **completely empty (`{}`)** and MUST **never import `@capacitor/*`**. At
   runtime the web bundle (`dist/`) uses only **Web-platform APIs** that are
   present in all three targets (PWA in a modern browser, iOS WebKit WebView,
   Android Chromium WebView), reaching optional native capabilities solely via
   the runtime `PlatformServices` feature-detection seam (`window.Capacitor`;
   see [portability.md → Package boundary & `PlatformServices` seam](portability.md#package-boundary--platformservices-seam)).
   No runtime npm package is ever bundled into `dist/`. This rule is never
   relaxed for the web bundle.
   - **Isolated `native/` workspace package (Phase 6 store packaging):** When
     Capacitor native shells are introduced in Phase 6, they live in their own
     isolated **`native/` workspace package** (`native/package.json` +
     `native/capacitor.config.ts`). `@capacitor/*` and approved native plugins
     (e.g., durable native storage, native file save/share, biometric lock) are
     permitted **only** inside `native/package.json`, and remain subject to
     exact pinning (`save-exact=true`), `pnpm install --frozen-lockfile`,
     `pnpm audit --audit-level=high`, and the well-maintained criterion.
2. **Curated dev dependencies under the well-maintained criterion (the
   governing rule for every dev dependency).** The *only* packages we allow are
   the dev tools that make the codebase correct, clean, and testable — and each
   one must pass the **well-maintained criterion** (below). No random /
   unmaintained / niche packages. This criterion applies to **every** dev
   dependency we install — local tooling *and* the **CI actions** the pipeline
   runs (see [Dev dependencies (the allowed set)](#dev-dependencies-the-allowed-set)
   and [CI actions (the allowed set)](#ci-actions-the-allowed-set)).

> **Zero-prod-dep vs dev-only vs `native/` shell — the crisp distinction.** The
> root web package's `dependencies` is **empty**: the web bundle (`dist/`) loads
> **no npm package** and never imports `@capacitor/*`. `devDependencies` holds a
> small, curated toolchain (build / test / lint / type-check) that is **only
> ever run at build, test, or lint time** and is **never imported or executed
> at runtime**. Native wrapper packages (`@capacitor/*`) live strictly in the
> separate `native/` workspace package (`native/package.json`, Phase 6) so the
> web bundle stays zero-prod-dep and identical across PWA, iOS, and Android.
> CI mirrors this: it asserts root `package.json` `dependencies` is `{}` and
> `src/` has zero `@capacitor/*` imports.

## The well-maintained criterion (the governing rule for any dev dependency)

Before any dev dependency — a **local package** *or* a **CI action** — is added
to the repo, it must satisfy **all three** of the following, and the justification
must be recorded in the PR (signed by the proposing role):

1. **Active & current.** The project's repository is **active** (not archived,
   not stale) and receives **regular releases** (a recent, ongoing release cadence
   as of the plan date), i.e. it is the *current* best-practice tool in its
   category rather than a superseded or frozen one.
2. **First-party or tool-maintainer.** It is maintained by the **tool's own
   maintainer(s)** or the **upstream project owner** (first-party) — not a
   random fork, community copy, or niche shim that outlived its usefulness.
   (For CI actions this means the action is published by the upstream project /
   a first-party GitHub App, not a third-party reimplementation.)
3. **Industry-standard in its category.** It is the recognized default /
   best-practice choice in its category for a TypeScript + web build/test
   pipeline, with a large, active community.

A dev dependency that fails any of the three is **rejected** — "just convenient"
is not enough. This is the rule that guards rule 2 above, and it is applied to
each named entry in the two tables below.

Why: a zero-prod-dep runtime means the app ships **no third-party runtime code**
— fewer supply-chain and licensing risks, a smaller bundle, and no dependency
drift that could diverge the three webview targets. The shared-library model
([portability.md](portability.md)) only works if there is nothing platform- or
runtime-specific to install.

## Zero production dependencies

Every concern the backend needs is covered by a built-in Web API that exists in
**all three targets**. This is the load-bearing fact that makes "zero prod deps"
possible:

| Concern | Built-in API (all 3 targets) | Package it *replaces* (not used) |
| ------- | ---------------------------- | --------------------------------- |
| Storage | **IndexedDB** (WebKit + Chromium) | `idb`, `dexie`, `localforage` |
| Crypto (optional encryption) | **WebCrypto** `crypto.subtle` | `crypto-js`, `node:crypto` |
| ID generation | **`crypto.randomUUID()`** | `uuid` |
| HTTP (if ever) | **`fetch`** | `axios`, `node-fetch` |
| Date / formatting | **`Date`** + **`Intl`** | `date-fns`, `dayjs`, `moment` |
| Scheduling / recurring | **pure TS logic** | `croner`, `rrule` |
| State management | **pure TS logic** | `redux`, `zustand`, `xstate` |
| Validation | **TS types** + runtime checks | `zod`, `yup`, `joi` |

**Result:** `package.json` `dependencies` is empty. Nothing is imported at
runtime that a browser / WebView does not already provide.

> Secure-context note: `crypto.randomUUID()` and `crypto.subtle` require a secure
> context, which all three targets satisfy (GitHub Pages is HTTPS; Capacitor
> serves from `capacitor://localhost` / `http(s)://localhost`). Verify during
> implementation — see
> [storage.md → Secure-context requirement](storage.md#security-properties) and
> [portability.md → Android-specific considerations](portability.md#android-specific-considerations).

## Dev dependencies (the allowed set)

Each entry is chosen because it passes the **[well-maintained
criterion](#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency)**
(Active & current · First-party / tool-maintainer · Industry-standard). None is
a runtime / framework dependency — all are used **only** at build / test / lint
time and live in **`devDependencies`**.

> **pnpm is the package manager, not a devDependency.** pnpm **installs** the
> packages in the table; it is itself **provisioned, not installed** — via the
> `packageManager` field in `package.json` and `pnpm/action-setup` in CI (see
> [CI actions (the allowed set)](#ci-actions-the-allowed-set)). Do **not** assume
> local `corepack` is available (newer Node.js releases no longer bundle
> `corepack`). Require a modern pnpm version (10+) that uses npm's **bulk
> advisory audit endpoint** (npm retired legacy audit endpoints, causing older
> pnpm versions to fail `pnpm audit` with HTTP 410). pnpm therefore **does not**
> appear in `devDependencies`. (npm is the zero-config fallback.)

| Area | Tool (dev dep) | Well-maintained criterion — how it satisfies it (as of plan date) |
| ---- | -------------- | ------------------------------------------------------------------ |
| Package manager | **pnpm** *(provisioned, not a `devDependency`)* | **Active & current:** actively maintained, frequent releases (10+, using npm's bulk audit endpoint). **First-party / tool-maintainer:** maintained by the pnpm project. **Industry-standard:** de-facto standard for the TS/Node ecosystem; strict/flat `node_modules`, fast, disk-efficient. Provisioned via `packageManager` + `pnpm/action-setup` in CI (no `corepack` assumption) and does **not** live in `devDependencies`. (npm is the zero-config fallback.) |
| Build / bundler | **Vite** | **Active & current:** very active repo, regular releases. **First-party / tool-maintainer:** maintained by the Vite core team. **Industry-standard:** the current best-practice web build tool; standard Vite app-mode (`vite build`) emits the static SPA bundle (`dist/index.html` + hashed JS/CSS chunks); pairs with Vitest. |
| Testing | **Vitest** | **Active & current:** actively maintained, regular releases. **First-party / tool-maintainer:** maintained by the Vite core team (first-party to Vite). **Industry-standard:** the current best-practice TS test framework — fast, ESM/TS-native, zero babel config, Vite-compatible, large community. |
| Coverage provider | **`@vitest/coverage-v8`** | **Active & current:** actively maintained in the Vitest monorepo, regular releases. **First-party / tool-maintainer:** maintained by the Vitest / Vite core team (first-party to Vitest). **Industry-standard:** the official V8 coverage provider required by `vitest run --coverage` to enforce the `>= 95%` `src/core/` coverage gate. |
| E2E / browser testing | **Playwright (`@playwright/test`)** | **Active & current:** very active repo, regular releases. **First-party / tool-maintainer:** maintained by Microsoft (the browser-automation vendor). **Industry-standard:** the current standard for fast, reliable headless browser E2E across Chromium and WebKit. |
| Accessibility testing | **`@axe-core/playwright`** | **Active & current:** actively maintained, regular releases. **First-party / tool-maintainer:** maintained by Deque Systems (the `axe-core` maintainers) and officially recommended in Playwright's accessibility testing docs. **Industry-standard:** the standard automated WCAG 2.2 AA accessibility scanner for Playwright E2E tests. |
| IndexedDB test polyfill | **`fake-indexeddb`** | **Active & current:** maintained with releases; **First-party / tool-maintainer:** maintained by its dedicated author (a stable, single-maintainer project, not a fork); **Industry-standard:** the de-facto in-memory IndexedDB implementation so `src/storage/indexeddb.ts` can be unit-tested in Vitest (Node). *(Category: test-support, not a runtime framework.)* |
| DOM test environment | **`happy-dom`** | **Active & current:** actively maintained with frequent releases. **First-party / tool-maintainer:** maintained by its upstream author (`capricorn86/happy-dom`) and built in as a first-class Vitest test environment (`// @vitest-environment happy-dom`). **Industry-standard:** the standard fast, lightweight DOM implementation for Vitest unit testing of colocated browser/DOM modules (`src/ui/`, `src/platform/`) in Node without launching a full browser. *(Category: test-support, not a runtime framework; zero bytes in `dist/`.)* |
| Lint + format | **Biome** | **Active & current:** actively maintained, regular releases. **First-party / tool-maintainer:** maintained by the Biome project (Rust-based, first-party). **Industry-standard:** the current best-practice single lint + format tool (sub-ms, no plugin config). (ESLint 9 + Prettier is the fallback if a plugin ecosystem is later needed.) |
| Type check | **tsc** (TypeScript) | **Active & current:** the TypeScript compiler itself — the most actively maintained project in the JS/TS ecosystem, regular releases. **First-party / tool-maintainer:** maintained by Microsoft (the language owner). **Industry-standard:** `tsc --noEmit` runs in CI. |
| Node.js type definitions | **`@types/node`** | **Active & current:** continuously updated in lockstep with Active-LTS Node.js releases. **First-party / tool-maintainer:** maintained by DefinitelyTyped / the Microsoft TypeScript team, and declared as a peer dependency by Vite and Vitest (also referenced by `playwright-core` `.d.ts` files). **Industry-standard:** the sole canonical Node.js type definitions package; strictly `devDependencies` (zero bytes in `dist/`) and isolated to `tsconfig.node.json` so `src/` never sees Node globals. |

**The full `devDependencies` set:** `vite`, `vitest`, `@vitest/coverage-v8`,
`fake-indexeddb`, `happy-dom`, `@playwright/test`, `@axe-core/playwright`, `@biomejs/biome`,
`typescript`, `@types/node`. **No framework runtime deps** — `dependencies` (production) MUST
remain completely empty. **pnpm** is the *package manager* that installs these —
it is **provisioned** (via the `packageManager` field and `pnpm/action-setup` in
CI, with no `corepack` assumption), **not** a `devDependency`; the **CI
actions** below are likewise provisioned, not installed as packages.

**Version currency (decided at bootstrap):** This plan deliberately avoids
hardcoding potentially stale tool version numbers. The Phase 1 bootstrap task
MUST verify and install the current stable major versions of every allowed
`devDependencies` package (Vite, Vitest, `@vitest/coverage-v8`, `fake-indexeddb`,
`happy-dom`, `@playwright/test`, `@axe-core/playwright`, Biome, TypeScript, `@types/node`) along with the
current Active-LTS even Node.js release (from `nodejs.org`) and a modern pnpm
release (10+, supporting npm's bulk audit endpoint), pinned via `pnpm-workspace.yaml`
`saveExact: true` (and `.npmrc` `save-exact=true` for npm fallback). Dependabot (`.github/dependabot.yml`) keeps both `npm`
devDependencies and SHA-pinned GitHub Actions current thereafter.

## CI actions (the allowed set)

The CI actions are **also dev dependencies** — they are installed/invoked by
GitHub Actions at **build / test / deploy time only**, never shipped to a
browser or WebView, and they satisfy the **same well-maintained criterion** as
the local tooling above. They are pinned in the workflow files under
`.github/workflows/` (not `package.json`) to **full 40-character commit SHAs**
with a trailing `# vX.Y.Z` version comment (never mutable tags such as `@v4`),
and each is a **first-party action** of the upstream project or a GitHub
first-party action.

| Area | Action (full-SHA pinned) | Well-maintained criterion — how it satisfies it (as of plan date) |
| ---- | ------------------------ | ------------------------------------------------------------------ |
| Checkout code | **`actions/checkout`** `@<40-char-sha> # vX.Y.Z` | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the canonical way to check out a repo in a workflow. |
| Set up Node.js | **`actions/setup-node`** `@<40-char-sha> # vX.Y.Z` | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the standard way to provision Node (via `node-version-file: '.nvmrc'`) + the pnpm cache on a runner. |
| Set up pnpm | **`pnpm/action-setup`** `@<40-char-sha> # vX.Y.Z` | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** maintained by the **pnpm** project (the tool's own maintainer — first-party to pnpm). **Industry-standard:** the canonical way to provision the exact pnpm version from `packageManager` in CI without relying on `corepack`. |
| Static analysis (SAST) | **`github/codeql-action`** `@<40-char-sha> # vX.Y.Z` | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the canonical CodeQL JS/TS static security analysis action for PRs and `main`. |
| PR dependency review | **`actions/dependency-review-action`** `@<40-char-sha> # vX.Y.Z` | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the standard PR gate that flags newly-introduced vulnerable or risky dependencies before merge. |
| Set up JDK (Android native builds) | **`actions/setup-java`** `@<40-char-sha> # vX.Y.Z` | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the standard way to provision the JDK required by Gradle in optional Capacitor Android build jobs. *(iOS Xcode/keychain setup uses standard runner tooling and shell steps.)* |

**GitHub Pages publishing note (OQ-5):** GitHub Pages deployment (mode (a)
production root + `pr-<PR#>/` previews) is published via **plain `git` to the
`gh-pages` branch using `GITHUB_TOKEN`** (`contents: write` on the publish job
only; Pages source = "Deploy from a branch" → `gh-pages`), rather than the
legacy `actions/upload-pages-artifact` + `actions/deploy-pages` flow (which is
incompatible with `pull_request` branch rules on the `github-pages` environment
and replaces the entire site per run; see
[testing.md → CI deploy & preview](testing.md#ci-deploy--preview-github-pages)).
Third-party Pages publishing actions (`peaceiris/actions-gh-pages`,
`rossjrw/pr-preview-action`, etc.) are rejected under the first-party criterion.

**CI-actions note:** the **well-maintained criterion** is what *justifies* the
actions in this table as the allowed set; the **zero-prod-dep constraint** is
what *limits* them — none of them is ever loaded at runtime by the app. They
only **produce**, **verify**, and **publish** the build. Any additional CI
action added to a workflow must pass the same well-maintained criterion and be
full-SHA pinned before it is allowed.

## What this buys

- **No runtime third-party code** in the bundle that ships to all three targets.
- **No supply-chain / license drift** in production; the only dependencies are
  build-time tools pinned in `devDependencies`.
- **Consistent behavior** across WebKit (iOS) and Chromium (Android), because
  both implement the same Web APIs the code relies on.
- **A clean, current toolchain** (Vite / Vitest / Biome / tsc, driven by the pnpm
  package manager) that any engineer can set up without choosing between competing
  libraries.

## Guardrails (enforce in CI / review)

- **Root web-package `dependencies` must stay empty & zero `@capacitor/*` imports in `src/` (CI-enforced).**
  CI must **assert that root `package.json` `dependencies` is empty (`{}`)** and
  that `src/` contains **zero `@capacitor/*` imports** (a `pnpm`/`node` check in
  the pipeline) in addition to the human gate: a PR that adds a production
  dependency to the web bundle requires an explicit justification and a
  senior-software-engineer sign-off. Native wrapper dependencies (`@capacitor/*`
  and approved native plugins) are allowed **only** inside the isolated
  `native/package.json` workspace package (Phase 6), still exact-pinned and
  audited.
- **Any new dev dependency — local package *or* CI action — must pass the
  [well-maintained criterion](#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency)**
  (Active & current · First-party / tool-maintainer · Industry-standard), and the
  PR must record how it satisfies the criterion. "Just convenient" is not enough.
- Prefer a **built-in Web API** over a package whenever the API is present in all
  three targets (see the table above).
- **Dev-only, never runtime.** Dev dependencies (local and CI actions) are
  build/test/lint-time only; they must never be imported or loaded at runtime.
  This keeps the **zero-prod-dep** hard constraint intact and the two rules
  consistent with each other.
- **Supply-Chain & Lockfile Hardening (mandatory):**
  - **Exact dependency pinning (`pnpm-workspace.yaml` + `.npmrc`) & versions decided at bootstrap:** The
    repository root MUST configure `saveExact: true` in `pnpm-workspace.yaml` (enforced by pnpm 11/12)
    and retain an `.npmrc` file setting `save-exact=true` (for the `npm` zero-config fallback) so
    every `devDependencies` entry in `package.json` uses an exact version string
    (e.g. `"5.4.0"`, never `^` or `~` floating ranges). Exact current tool
    majors are verified and selected at Phase 1 bootstrap rather than hardcoded
    in this plan.
  - **Node.js version pinning (`.nvmrc` + `engines` + `node-version-file`):**
    The repository root MUST include an `.nvmrc` targeting the current
    Active-LTS even Node.js release (exact LTS version verified at bootstrap
    from `nodejs.org`), mirrored in `package.json` `"engines": { "node": "..." }`.
    CI workflows MUST configure `actions/setup-node` with
    `node-version-file: '.nvmrc'` so local and CI runtimes match.
  - **pnpm workspace hardening (`pnpm-workspace.yaml`):** Because pnpm 11/12
    blocks dependency lifecycle/build scripts by default (replacing pnpm 10's
    removed `onlyBuiltDependencies` with `allowBuilds` and rejecting unknown
    keys), the repository MUST configure `pnpm-workspace.yaml` with:
    - `saveExact: true` to enforce exact dependency pinning in pnpm 12 (retaining
      `.npmrc` `save-exact=true` for npm fallback),
    - `allowBuilds: {}` (explicitly allow-listing only strictly required
      build-script packages if any are ever needed), and
    - `minimumReleaseAge: 4320` (72-hour / 3-day release-age cooldown) to
      mitigate newly-published malicious package versions.
    Require a minimum pnpm version (10+, using pnpm 12 in Phase 1) that uses
    npm's **bulk advisory audit endpoint** (legacy audit endpoints were retired
    and return HTTP 410). Provision pnpm via `packageManager` +
    `pnpm/action-setup` in CI — do **not** assume local `corepack`.
  - **Immutable lockfile in CI (`--frozen-lockfile`):** Every CI job MUST install
    dependencies via `pnpm install --frozen-lockfile` so `pnpm-lock.yaml` is the
    single deterministic source of truth and lockfile drift fails immediately.
  - **Full-SHA GitHub Actions pinning & repository setting:** Every `uses:`
    reference in `.github/workflows/*.yml` MUST be pinned to a **full
    40-character commit SHA** with a trailing `# vX.Y.Z` version comment (never
    mutable tags such as `@v4`), and the repository's GitHub Actions settings
    MUST enable **"Require actions to be pinned to a full-length commit SHA"**.
  - **Automated dependency updates (`.github/dependabot.yml`):** Configure
    Dependabot for both `github-actions` (keeping SHA-pinned workflow actions
    current) and `npm` (keeping exact-pinned `devDependencies` current).
  - **Automated vulnerability, SAST & PR dependency review gates:** CI MUST run
    `pnpm audit --audit-level=high` on every PR and `main` push, run
    **CodeQL** (`github/codeql-action`, JS/TS) static analysis, and run
    **`actions/dependency-review-action`** on pull requests to block any newly
    introduced `high`/`critical` CVE or risky dependency in the dev/build
    toolchain. *(OSV-Scanner is optional.)*
  - **Least-privilege GitHub Actions workflow permissions:** Every workflow under
    `.github/workflows/` MUST declare top-level least-privilege
    `permissions: { contents: read }` by default, elevating permissions only at
    the specific job level where required (e.g. `security-events: write` on the
    CodeQL analysis job, or `contents: write` only on the `gh-pages` publish job
    in `deploy-pages.yml` and the release-publish job in `release.yml`; see
    [testing.md](testing.md)).
  - **Skipped — Subresource Integrity (SRI):** Deliberately skipped. Every
    runtime asset is same-origin and self-hosted with Vite content-hashed
    filenames under `default-src 'self'` CSP; SRI only protects
    third-party-hosted subresources, which are banned by the zero-prod-dep and
    zero-external-URL rules.

## Strict TypeScript Compiler Flags (`tsconfig.json`)

To maximize compile-time safety across pure financial calculations (`src/core/`), IndexedDB persistence (`src/storage/`), and DOM rendering (`src/ui/`), `tsconfig.json` MUST enforce the following strict compiler baseline (verified in CI via `tsc --noEmit`):

- **`strict: true`** — enables the full TypeScript strict type-checking family (`strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `useUnknownInCatchVariables`).
- **`noUncheckedIndexedAccess: true`** — types array and record index lookups as `T | undefined`, preventing unchecked out-of-bounds access in period iteration, tag rollups, and backup parsing.
- **`exactOptionalPropertyTypes: true`** — prevents assigning `undefined` to optional properties (such as `Activity.sourceRuleId`, `Activity.period`, `Activity.memo`, or `ActivityPatch` fields) unless explicitly permitted.
- **`noImplicitOverride: true`** — requires explicit `override` keywords on subclass methods.
- **`noImplicitReturns: true`** — guarantees every code path in a function returns a value.
- **`noFallthroughCasesInSwitch: true`** — prevents accidental switch case fallthrough (e.g. across `ActivityType` or schema migration switches).
- **`isolatedModules: true`** — ensures every file can be safely transpiled in isolation by Vite/esbuild.
- **`verbatimModuleSyntax: true`** — enforces explicit `import type` / `export type` declarations so type-only imports are deterministically elided at build time.
- **`target: "ES2022"`** and **`moduleResolution: "bundler"`** — targets modern Web-platform runtimes (PWA, iOS `WKWebView`, Android `Chromium`) and aligns module resolution with Vite.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": false
  },
  "include": ["src"]
}
```

Node tooling configs (`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`) and Playwright `e2e/` tests are type-checked via `tsconfig.node.json` (`"extends": "./tsconfig.json"`, `"types": ["node"]`) so `@types/node` globals are isolated from browser code under `src/`.
