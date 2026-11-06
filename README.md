# Human Description
My First Slopped Project. I wanted a basic budget app that runs purely locally because everyone decided a subscription was required to use their budget app.

# Simple Budget

A free, private, manual budget app. No subscription, no bank logins, no server.

- Tell it your **monthly income** and **recurring expenses** once.
- Log **expenses** and **deposits** by hand, with tags.
- Whatever is left at the end of the month **carries over** into the next.
- Explore spending **by tag** on the Insights page.
- **Export / import** a backup file any time — your history is yours.

Built as an installable web app (PWA), designed first for the **iPhone Duo** folded and unfolded.

## Data Safety, Auto-Backups & What Can Clear Your Data

Simple Budget is 100% local — there is no cloud account or remote server. Here is how your budget history stays safe on your phone:

- **Silent Background Auto-Backup (Zero Taps, No Popups):** Every time you add or edit an item, the app silently saves a redundant backup copy inside your phone's local storage (`IndexedDB`, Origin Private File System, and `localStorage`), and automatically freezes a `pre-update` snapshot before any new app version runs.
- **Manual Export Backup:** Under **Settings → Data**, you can manually tap **Export backup** whenever you want to save a backup file to your phone or computer. That page displays when you last exported a backup, and the app will **never** interrupt you with automatic backup popups.
- **What Does NOT Affect Your Installed App's Data:**
  - App version updates (`v0.1.0` → `v0.2.0`, etc.)
  - Using the app offline or in Airplane Mode
  - Closing the app, restarting your iPhone, or updating iOS
  - Closing tabs or clearing regular browsing history inside the Safari app (because your Home Screen app runs in its own isolated container separate from Safari tabs)
- **What WILL Clear Your Data (Export Backup First!):**
  1. **Deleting the "Budget" app icon from your iPhone Home Screen** — iOS immediately deletes a Home Screen web app's isolated storage container when its icon is deleted.
  2. **Wiping Website Data in iOS Settings** — going into **iOS Settings → Apps → Safari → Advanced → Website Data** and deleting `tandyn.github.io` (or tapping the system-wide *"Clear History and Website Data"* in iOS Settings on some iOS versions) can wipe local WebKit storage.
  3. **Factory-resetting or replacing your phone** — export a backup file first, then import it on the new phone.

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
