# Changelog

All notable changes to Simple Budget are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (`0.y.z` during initial development until `1.0.0` at T14).

## [0.9.1] - 2026-11-07

### Documentation

- **skills:** codify the trunk-based workflow with an independent reviewer subagent (`72f8a62`)

## [0.9.0] - 2026-11-07

### Features

- **activity:** replace Newer/Older text buttons with arrow icons (`5f91fc6`)
- **shell:** make the header a stable three-tab Budget/Insights/Settings nav (`05fcece`)
- **components:** add Budget, LeftArrow and RightArrow icons (`759d551`)

### Bug Fixes

- **layout:** pin the header and status bar with a fixed app frame (`d71b6ca`)

### Tests & Quality

- **ui:** point the driver and tests at the new nav and pager, update docs (`dfea5cf`)

### Tooling & Maintenance

- **activity:** wrap the MonthScreen import list within the print width (`aa92e59`)
- **docs:** let prettier pad the design and testing tables (`73b2716`)

## [0.8.0] - 2026-11-07

### Features

- **ui:** compact one-screen layout, unified paginated activity list, sticky header, +/- actions (`e7b5f6b`)
- **time:** store every transaction as a UTC timestamp with a v2 migration (`757e861`)

### Bug Fixes

- **ui:** adjust hero typography in two-pane to avoid quick action overlap (`de308d9`)

### Tests & Quality

- **ui:** cover compact layout, pagination, time override and fold/unfold; update docs (`dfc6fff`)

## [0.7.0] - 2026-11-07

### Features

- **entries:** add EntrySheet, interactive ledger rows, undo toast and plan guard [T06] (`aeda95c`)
- **entries:** add manual entry use-cases and repository helpers [T06] (`74dc07c`)

### Tests & Quality

- **entries:** add E2E journeys for manual expenses, deposits, edits and undo [T06] (`8a2fcff`)

### Documentation

- **entries:** update testing and plan docs for manual expenses and deposits [T06] (`b095bd5`)

## [0.6.0] - 2026-11-07

### Features

- **ledger:** add MonthScreen and route guard between setup and ledger [T05] (`1b4acca`)
- **setup:** add app settings hook and 4-step first-run setup flow [T05] (`266c635`)

### Tests & Quality

- **setup:** add E2E journeys for first-run setup and month ledger [T05] (`c888404`)

### Documentation

- **setup:** update testing and plan docs for first-run setup and ledger [T05] (`80292cc`)

## [0.5.0] - 2026-11-07

### Features

- **shell:** add responsive AppShell, hinge-aware TwoPane, hash router and debug overlays [T04] (`94052c2`)
- **ui:** add design tokens, global styles and base UI components [T04] (`0b66705`)

### Tests & Quality

- **shell:** add Playwright E2E journeys and axe audit for responsive app shell [T04] (`e9c8db6`)

### Documentation

- **ui:** update design, developer-setup, testing docs and complete T04 plan notes [T04] (`619a276`)

## [0.4.0] - 2026-11-07

### Features

- **app:** implement completeSetup, openMonthsThrough, getMonthView and useMonthView [T03] (`583573c`)
- **app:** add Clock and IdGenerator providers without secure context requirement [T03] (`e56d404`)
- **db:** add native IndexedDB schema v1, transactional wrapper and repositories [T03] (`411b665`)

### Documentation

- **db:** update architecture.md, README.md and complete T03 plan notes [T03] (`c97f1f7`)

## [0.3.1] - 2026-11-07

### Bug Fixes

- **deploy:** preserve previous hashed asset bundles and test version upgrades (`e4ed638`)
- **pwa:** bypass stale HTTP cache on service worker install and navigation (`92b3482`)

### Documentation

- **readme:** document trunk-based development and automated release workflow (`3feb5ee`)

## [0.3.0] - 2026-11-07

### Features

- **deploy:** support isolated /pr-<N>/ preview deploys and full automated release mode (`f01264a`)
- **release:** separate post-merge deploy from official SemVer release notes (`2adb0dc`)

### Documentation

- **workflow:** document trunk-based PR previews and automated release.yml pipeline (`3313b12`)
- **skills:** enforce incremental commits, named PR merge subjects, and post-QA releases (`30b51da`)
- update human description (`e8befac`)

### Tooling & Maintenance

- **ci:** format release.yml and release-version.mjs with Prettier (`a2db52d`)
- **workflows:** split ci.yml PR verification from release.yml production deployment (`eeed8e4`)
- **workflow:** run verify only on PRs and ios-testflight only on release tags (`61f571f`)

## [0.2.0] - 2026-11-07

### Features

- **domain:** implement pure money, calendar, ledger, and plan-change rules [T02] (`a031d85`)
- **ios:** add native Swift iOS app target, TestFlight pipeline, and MIT license [T01] (`dea46f3`)

### Documentation

- **readme:** remove Safari cache and popup references for native app focus (`bd8c580`)
- **backup:** use Export backup label consistently across docs and plan [T09] (`cd13296`)
- **backup:** clarify silent local auto-backup, manual iCloud save, and what clears storage [T09] (`c68d165`)
- **plan:** add automatic local mirror and iCloud auto-backup to T09 [T09] (`9b81b02`)

### Tooling & Maintenance

- **ci:** enable github actions workflow (`a1d1244`)
- **ci:** move ci.yml to .github/workflows/ci.yml [T01] (`84aaf58`)

## [0.1.0] - 2026-11-06

### Features

- **toolchain:** Set up React 19, TypeScript, Vitest, Playwright (WebKit + Chromium), ESLint, Prettier, and CI (`[T01]`).
- **pwa:** Add zero-dependency offline Service Worker, Web App Manifest, icons, release version metadata (`/version.json`), and live GitHub Pages deployment pipeline.

### Documentation

- Initialize repository architecture, design system specs, testing guide, agent skills, and T01–T14 build plan.
