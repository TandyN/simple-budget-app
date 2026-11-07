# Human Description
My First Slopped Project. I wanted a basic budget app that runs purely locally because everyone decided a subscription was required to use their budget app.

This is also a project for me to observe how AI agents interact with the github repo.

# Simple Budget

A free, private, manual budget app. No subscription, no bank logins, no server.

- Tell it your **monthly income** and **recurring expenses** once.
- Log **expenses** and **deposits** by hand, with tags.
- Whatever is left at the end of the month **carries over** into the next.
- Explore spending **by tag** on the Insights page.
- **Export / import** a backup file any time — your history is yours.

Built as a **Native iOS App (`ios/`)** (with easy portability to Android), designed first for the **iPhone Duo** folded and unfolded.

## How Your Data Is Stored & Backed Up

Simple Budget is 100% local — there is no cloud account, no analytics, and no remote server. Because this repository is open source, you can verify every line of storage code yourself:

- **Native Device Storage (`ios/`):** Your budget database is saved atomically inside the app's native iOS `Application Support` directory (with an automatic backup copy) via [`BudgetViewController.swift`](ios/SimpleBudget/BudgetViewController.swift), and is automatically included in your iPhone's system/iCloud device backups.
- **Automatic Background Snapshots:** Every time you add or edit an item, the app automatically maintains a redundant local backup mirror and freezes a `pre-update` snapshot before any new app version runs.
- **Export / Import Backup:** Under **Settings → Data**, you can tap **Export backup** anytime to save a human-readable JSON backup file (and see when you last exported), or **Import backup** to restore your full history on a new device.

## Development & Release Workflow

Simple Budget uses **Trunk-Based Development (`feature/* → main`)** with isolated per-PR previews and zero-touch production releases (see [`docs/workflow.md`](docs/workflow.md) for full details):

1. **Story-Telling Feature Branches (`3–6 commits per task`):** Each feature or fix is built on a short-lived branch (`feat/Txx-...` or `fix/...`) as a sequence of focused [Conventional Commits](https://www.conventionalcommits.org/) (`feat(scope): ... [Txx] (agent-generated)`) so the commit history and generated release notes tell a clear story of every step.
2. **Pull Request Verification & Isolated Previews (`.github/workflows/ci.yml`):** Opening a PR to `main` runs the full verification gate (`scripts/verify.sh`), enforces that the branch includes the latest `origin/main`, deploys an isolated live preview to `https://tandyn.github.io/simple-budget-app/pr-<N>/` (verified with WebKit + offline PWA QA), and compiles a downloadable `SimpleBudget-iOS-Simulator` `.app` artifact on macOS Xcode. Closing or merging the PR automatically cleans up `/pr-<N>/`.
3. **Automated Production Release (`.github/workflows/release.yml`):** Merging a reviewed PR into `main` automatically calculates the next SemVer version (`0.y.z` pre-1.0 → `1.0.0`), generates categorized release notes in [`CHANGELOG.md`](CHANGELOG.md), deploys the production PWA to `https://tandyn.github.io/simple-budget-app/`, runs post-deploy live WebKit + offline QA (`scripts/verify-live.mjs`), publishes the `vX.Y.Z` GitHub Release, and uploads the native iOS build to TestFlight.

## License

Licensed under the [MIT License](LICENSE) (`Copyright (c) 2026 Tandy Nguyen`). You are free to inspect, use, or build upon this code as long as you retain the copyright notice and credit **Tandy Nguyen** in all copies or substantial portions of the software.

## Status

Foundation, first-run setup, month ledger, and manual expenses & deposits complete (T01–T06). See the [build plan](docs/plan/README.md).

## Docs

- [Build plan](docs/plan/README.md) — ordered tasks, each one agent-sized
- [Workflow & releases](docs/workflow.md) — PR review, automated SemVer, release deploy, QA & rollback
- [Changelog](CHANGELOG.md) — version history
- [Architecture](docs/architecture.md) — how it works and why
- [Testing](docs/testing.md) — how tests are written (human-readable first)
- [Design](docs/design.md) — look & feel, folded/unfolded layouts
- [Developer setup](docs/developer-setup.md) — run it locally on Linux, view it on your phone
- [Install on iPhone](docs/install-on-iphone.md) — automated TestFlight / App Store deployment + dev preview
- [AGENTS.md](AGENTS.md) — onboarding for AI coding agents
