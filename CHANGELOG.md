# Changelog

All notable changes to Simple Budget are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (`0.y.z` during initial development until `1.0.0` at T14).

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
