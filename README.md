# Human Description
My First Slopped Project. I wanted a basic budget app that runs purely locally because everyone decided a subscription was required to use their budget app.

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

## License

Licensed under the [MIT License](LICENSE) (`Copyright (c) 2026 Tandy Nguyen`). You are free to inspect, use, or build upon this code as long as you retain the copyright notice and credit **Tandy Nguyen** in all copies or substantial portions of the software.

## Status

Foundation in progress (T01 complete: toolchain, test harness & CI). See the [build plan](docs/plan/README.md).

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
