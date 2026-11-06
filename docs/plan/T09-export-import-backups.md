# T09 — Export, import & backups

**Depends on:** T08 — **Milestone:** MVP

## Goal

Your history is portable and safe: silent background local auto-backups protect every edit and app update with zero taps or popups, while the Settings → Data screen provides a manual **Export backup** button (showing when you last exported) and an **Import backup** flow with preview and undo.

## Read first

`docs/architecture.md` §6–7, Web Share API Level 2 (files) on iOS Safari.

## Scope

**In:** `src/data/backup/` (serialize, pure TypeScript schema v1 validator with zero external runtime packages, migrations registry, validate), silent background local auto-backup mirror (`IndexedDB` + Origin Private File System `navigator.storage.getDirectory()` + `localStorage`), silent automatic pre-update snapshot before any app version or schema upgrade, use-cases `exportBackup`, `importBackup`
(preview → replace), `undoImport`, `restoreFromAutoBackup`, CSV export, Settings → Data screen with manual **Export backup** button and `lastBackupAt` status timestamp ("Last exported: ..."), a pre-import
safety snapshot (new store → **IndexedDB v2** with migration test), deterministic fixture generator.
**Out:** automatic popup/reminder banners (never nag the user with popups to save), merging two histories (not planned), cloud server sync (not planned).

## Steps

1. Backup file per `docs/architecture.md` §7; filename `simple-budget-backup-YYYY-MM-DD.json`.
2. **Silent Background Local Auto-Backup & Pre-Update Snapshot (zero taps, zero popups, every write):**
   - On every data write, silently write a complete backup JSON mirror into both the browser's Origin Private File System (`navigator.storage.getDirectory()`, file `simple-budget-auto-backup.json`) and `localStorage` (`simple-budget:auto-backup:latest`).
   - On startup, before applying any new app version (`__APP_VERSION__` change) or IndexedDB schema upgrade, silently freeze the current state into `simple-budget:auto-backup:pre-update`.
   - If `IndexedDB` ever opens empty while a mirror snapshot exists in OPFS or `localStorage`, silently auto-recover the database from the mirror (and also expose a manual _Restore from automatic local backup_ button in Settings → Data).
3. **Manual Export Backup (Settings → Data only, no popups):**
   - In Settings → Data, show a manual **Export backup** button alongside the `lastBackupAt` status (`Last exported: Nov 6, 2026` or `Never exported`).
   - When tapped: if `navigator.canShare({ files })` → `navigator.share` (iOS share sheet → _Save to Files_), else download link. Update `settings.lastBackupAt` after a successful share/download.
   - Never show automatic popup modals or reminder banners on the main ledger screen.
4. Import: file picker → parse JSON → migrate (`migrations[v]` functions, v1 is identity) → pure TypeScript validate including
   referential integrity → preview card ("214 entries from Nov 2026 to Oct 2027, 9 tags, 6 recurring items") →
   _Replace all data_ (confirm) → snapshot current data into `importSnapshots` (keep latest 3) → replace in **one transaction**.
5. _Undo import_ button (visible until the next import or 7 days) restores the snapshot.
6. CSV export: date, name, amount, tags, source — one-way.
7. `scripts/generate-backup-fixture.ts` (planned until built) → `e2e/fixtures/backups/one-year-of-history.json` (seeded, deterministic).
8. Driver: `exportBackup()` (returns the downloaded file path/content), `importBackup(filePath)`, `undoImport()`, `restoreFromAutoBackup()`, `wipeAllData()`
   (Settings → Data → Erase everything, with typed confirmation — also a real user feature).

## Behaviors to prove

- `exporting then importing on a fresh install gives back the exact same ledger and current budget`
- `for any budget data, importing its export reproduces it exactly` (property test on serialize/validate)
- `every budget change silently updates the local backup mirror and auto-recovers if IndexedDB is cleared`
- `updating the app version silently freezes a pre-update backup snapshot without any popup`
- `importing shows a preview of what will be replaced before anything changes`
- `a file from another app is rejected and nothing changes`
- `a backup with a broken tag reference is rejected with a clear message and nothing changes`
- `a backup with a fractional cent amount is rejected`
- `undo import brings back the data from before the import`
- `a version 1 backup still imports after the database moved to version 2`
- `the database upgrades from version 1 to version 2 without losing anything`
- `exporting a backup in Settings updates the last exported timestamp on the Data screen`
- `erasing everything requires typing ERASE and returns the app to first-run setup`

## Acceptance criteria

- [ ] Import never leaves partial data (transaction test with an injected failure).
- [ ] Export → import round trip proven both at rule level (property) and journey level (WebKit, both Duo sizes).
- [ ] Backup format and Dexie v2 documented; v1 schema kept for migration tests.
- [ ] `pnpm verify` passes.

## Docs to update

`docs/architecture.md` §4 (v2 table), §6–7, `docs/install-on-iphone.md` (backup steps, if UI labels differ), `docs/testing.md` (driver, fixtures).

## Completion notes

_Filled in by the agent when done._
