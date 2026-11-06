# T01 — Toolchain, test harness & CI

**Depends on:** — **Milestone:** Foundation

## Goal

A working, empty React + TypeScript app with every quality tool wired up, so every later task only adds
features. `pnpm verify` runs the full gate locally (WebKit in a container on Arch) and in GitHub Actions.

## Read first

`AGENTS.md`, `docs/architecture.md` §1–3, `docs/testing.md`, `docs/developer-setup.md`, `docs/design.md` (device profiles).

## Scope

**In:** project scaffold, tooling, device profiles file, Playwright projects, container runner, CI workflow,
a smoke journey, git hooks, docs.
**Out:** any real feature, styling beyond a placeholder, PWA/service worker (T10), deployment (T10).

## Steps

1. Add `mise.toml` pinning the current **Node LTS** and **pnpm** (latest stable of each; record the exact versions).
   Add `"packageManager"` and `"engines"` to `package.json`.
2. Scaffold Vite + React 19 + TypeScript in the repo root (don't create a nested folder). Remove template demo content.
3. `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
   `verbatimModuleSyntax`. Path alias `@/` → `src/`.
4. ESLint flat config: typescript-eslint (strict + stylistic, type-aware), react-hooks, jsx-a11y,
   and a rule (e.g. `no-restricted-imports`) forbidding `src/domain/**` from importing React, Dexie, or other layers.
5. Prettier (+ `prettier-plugin-tailwindcss` can come in T04). `.prettierignore` for generated folders.
6. Vitest config (node environment by default) with coverage (v8). Coverage threshold **100% lines/branches for
   `src/domain/**`\*\* (enforced from T02 onward — configure now, it trivially passes with no files).
7. Create `config/devices.ts` exactly per `docs/design.md` (iphone-duo-folded, iphone-duo-unfolded, iphone-17,
   pixel-android) exporting typed profiles: `name`, `viewport`, `deviceScaleFactor`, `isMobile`, `hasTouch`,
   `userAgent` (use Playwright's iPhone UA for Apple profiles), `browser`.
8. Playwright config:
   - Projects generated from `config/devices.ts`: WebKit for Apple profiles, Chromium for `pixel-android`,
     plus a Chromium copy of the Duo profiles for fast local debugging (`chromium-iphone-duo-*`).
   - `timezoneId: 'America/Los_Angeles'`, `locale: 'en-US'`.
   - `webServer`: `pnpm build && pnpm preview --port 4173 --strictPort` (tests run against the production build).
   - `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`.
9. `e2e/support/budget-app.ts`: export `test`/`expect` extended with a `budgetApp` fixture. For now it only has
   `openOn(date)` (uses `page.clock.setFixedTime`/`install` then `goto('/')`) and `reopenApp()`.
10. `scripts/run-e2e.sh` used by `pnpm test:e2e`:
    - If WebKit can launch natively (or `E2E_NATIVE=1`), run Playwright directly.
    - Otherwise run inside `mcr.microsoft.com/playwright:v<same version as @playwright/test>-noble` with podman
      (fallback docker), repo mounted, `--ipc=host`, using a container-local `node_modules` volume so host and
      container installs never clash. Pass through Playwright CLI args.
    - In CI (`CI=true`), run directly (CI installs browsers with `--with-deps`).
11. Scripts in `package.json` — exactly the table in `docs/developer-setup.md` §2 (`dev`, `dev:lan`, `build`, `preview`,
    `typecheck`, `lint`, `format`, `format:check`, `test`, `test:watch`, `test:e2e`, `test:e2e:ui`, `docs:check`, `verify`).
    `verify` = `bash scripts/verify.sh`.
12. Git hooks with **lefthook**: pre-commit runs `format:check`, `lint`, `typecheck`, `test` on staged scope (fast).
    The full gate remains the agent's responsibility via `verify-before-commit`.
13. GitHub Actions `.github/workflows/ci.yml`: on push + PR → checkout, mise/pnpm setup with cache, `pnpm install --frozen-lockfile`,
    `docs:check`, `format:check`, `lint`, `typecheck`, `test`, `playwright install --with-deps`, `test:e2e`, `build`.
    Upload `playwright-report/` on failure.
14. Placeholder `App` renders an `<h1>Simple Budget</h1>` and a `<main>` landmark.
15. Update `.gitignore` if new generated folders appear. Update docs (see below), replacing every "(planned)" that now exists.

## Behaviors to prove

- `the app opens and shows its name` — journey, runs on every device profile.
- `the device profiles include the iPhone Duo folded and unfolded screens` — rule test on `config/devices.ts`.

## Acceptance criteria

- [x] `mise install && pnpm install` works from a clean clone on the owner's CachyOS machine (document anything extra).
- [x] `pnpm verify` passes locally, including WebKit journeys.
- [x] `pnpm test:e2e --project=chromium-iphone-duo-folded` runs natively without a container.
- [x] Lint fails if a file in `src/domain/` imports React or Dexie (prove once, then revert the probe).
- [x] CI workflow is valid YAML and mirrors the local gate (it will run once the repo is pushed).
- [x] `docs/developer-setup.md` §2 lists every script exactly; `bash scripts/check-docs.sh` passes.
- [x] `AGENTS.md` repository map includes all new top-level files/folders, "Commands" section updated.

## Docs to update

`docs/developer-setup.md` (versions, remove the "planned" notes, container details), `AGENTS.md` (map, commands),
`docs/testing.md` (how to run a single journey / project), `README.md` status.

## Completion notes

- Pinned Node `22.14.0` and pnpm `10.6.1` in `mise.toml` and `package.json`.
- Scaffolded React 19 + TypeScript (strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`) + Vite 6 + Vitest 3 (with 100% coverage threshold configured for `src/domain/**`) + ESLint 9 flat config (strict-type-checked, stylistic-type-checked, jsx-a11y, react-hooks, and `no-restricted-imports` keeping `src/domain/` pure) + Prettier + lefthook + GitHub Actions CI.
- Created `config/devices.ts` with `iphone-duo-folded` (`466×678 @3x`), `iphone-duo-unfolded` (`626×890 @3x`), `iphone-17`, and `pixel-android`, plus rule tests in `config/devices.test.ts`.
- Created `e2e/support/budget-app.ts` (`openOn`, `reopenApp`, `appHeading`, `mainRegion`) and `e2e/journeys/app-opens.spec.ts`.
- Added `scripts/setup-webkit-arch.py` and wired `scripts/run-e2e.sh` so Playwright's Ubuntu 24.04 WebKit binary runs natively on CachyOS/Arch Linux by unpacking the required Ubuntu 24.04 shared libraries directly into WebKit's `sys/lib` folder (with automatic Podman/Docker fallback).
