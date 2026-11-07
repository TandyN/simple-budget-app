# Changelog

All notable changes to Simple Budget are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (`0.y.z` during initial development until `1.0.0` at T14).

## [0.2.0] - 2026-11-07

### Features

- feat(domain): implement pure money, calendar, ledger, and plan-change rules [T02] (agent-generated) (`a031d85`)
- feat(ios): add native Swift iOS app target, TestFlight pipeline, and MIT license [T01] (agent-generated) (`dea46f3`)

### Other Changes

- chore(ci): enable github actions workflow (`a1d1244`)
- Merge pull request #6 from TandyN/docs/clean-readme-native-app (`15dcaad`)
- docs(readme): remove Safari cache and popup references for native app focus (agent-generated) (`bd8c580`)
- Merge pull request #5 from TandyN/feat/native-ios-app-and-license (`d498ac0`)
- chore(ci): move ci.yml to .github/workflows/ci.yml [T01] (agent-generated) (`84aaf58`)
- Merge pull request #4 from TandyN/docs/export-backup-label (`c06c5a8`)
- docs(backup): use Export backup label consistently across docs and plan [T09] (agent-generated) (`cd13296`)
- Merge pull request #3 from TandyN/docs/silent-auto-backup-and-readme (`b47e725`)
- docs(backup): clarify silent local auto-backup, manual iCloud save, and what clears storage [T09] (agent-generated) (`c68d165`)
- Merge pull request #2 from TandyN/docs/t09-auto-backup-icloud (`534ba01`)
- docs(plan): add automatic local mirror and iCloud auto-backup to T09 [T09] (agent-generated) (`9b81b02`)

## [0.1.0] - 2026-11-06

### Features

- **toolchain:** Set up React 19, TypeScript, Vitest, Playwright (WebKit + Chromium), ESLint, Prettier, and CI (`[T01]`).
- **pwa:** Add zero-dependency offline Service Worker, Web App Manifest, icons, release version metadata (`/version.json`), and live GitHub Pages deployment pipeline.

### Documentation

- Initialize repository architecture, design system specs, testing guide, agent skills, and T01–T14 build plan.
