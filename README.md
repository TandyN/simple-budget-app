# Human Description
My First Slopped Project. I wanted a basic budget app that runs purely locally because everyone decided a subscription was required to use their budget app.

# Simple Budget

A free, private, manual budget app. No subscription, no bank logins, no server.

- Tell it your **monthly income** and **recurring expenses** once.
- Log **expenses** and **deposits** by hand, with tags.
- Whatever is left at the end of the month **carries over** into the next.
- Explore spending **by tag** on the Insights page.
- **Export / import** a backup file any time — your history is yours.

Built as a **Native iOS App (`ios/`)** (installed via TestFlight / App Store) with a live web preview, designed first for the **iPhone Duo** folded and unfolded.

## Data Safety, Auto-Backups & How Your Data Is Stored

Simple Budget is 100% local — there is no cloud account, no analytics, and no remote server. Because this repository is open source, you can verify every line of storage code yourself:

- **Native iOS App (`ios/`, TestFlight & App Store):**
  - Your budget database is stored as an atomic native iOS file inside your phone's `Application Support` directory (with an automatic backup copy) via [`BudgetViewController.swift`](ios/SimpleBudget/BudgetViewController.swift).
  - **Clearing Safari cache or history in iOS Settings has ZERO effect on the native iOS app.** Native iOS `Application Support` storage is 100% isolated from Safari.
  - **Automatic iOS / iCloud Device Backups:** iOS automatically includes `Application Support` in your iPhone's system/iCloud device backups with zero taps or popups.
  - **Only 2 things can clear the Native iOS App's local data:**
    1. Deleting the **Simple Budget** native app from your iPhone.
    2. Factory-resetting or replacing your phone without restoring from an iOS device backup or an exported JSON backup file.
- **Silent Background Auto-Backup (Zero Taps, No Popups):** Every time you add or edit an item, the app silently saves redundant backup copies (`Application Support` on native iOS, plus `IndexedDB`, Origin Private File System, and `localStorage`), and automatically freezes a `pre-update` snapshot before any new app version runs.
- **Manual Export Backup:** Under **Settings → Data**, you can manually tap **Export backup** whenever you want to save a human-readable JSON backup file to your phone or computer. That page displays when you last exported a backup, and the app will **never** interrupt you with automatic backup popups.
- **Web / Browser Preview (`https://tandyn.github.io/simple-budget-app/`):** If you use the browser/PWA version instead of the native iOS app, note that browser storage (`IndexedDB`) *can* be cleared if you delete a Home Screen web clip or wipe `tandyn.github.io` / *"Clear History and Website Data"* in iOS Safari Settings. For permanent daily use on iPhone, use the **Native iOS App** and/or **Export backup**.

## License

Licensed under the [MIT License](LICENSE) (`Copyright (c) 2026 Tandy Nguyen`). You are free to inspect, use, or build upon this code as long as you retain the copyright notice and credit **Tandy Nguyen** in all copies or substantial portions of the software.

## Status

Foundation in progress (T01 complete: toolchain, test harness & CI). See the [build plan](docs/plan/README.md).

## Docs

- [Build plan](docs/plan/README.md) — ordered tasks, each one agent-sized
- [Workflow & releases](docs/workflow.md) — PR review, automated SemVer, live GitHub Pages deploy, offline QA & rollback
- [Changelog](CHANGELOG.md) — version history
- [Architecture](docs/architecture.md) — how it works and why
- [Testing](docs/testing.md) — how tests are written (human-readable first)
- [Design](docs/design.md) — look & feel, folded/unfolded layouts
- [Developer setup](docs/developer-setup.md) — run it locally on Linux, view it on your phone
- [Install on iPhone](docs/install-on-iphone.md) — free hosting + Add to Home Screen
- [AGENTS.md](AGENTS.md) — onboarding for AI coding agents
