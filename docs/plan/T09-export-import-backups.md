# T09 — Export, import & backups

**Depends on:** T08 — **Milestone:** MVP

## Goal

Your history is portable and safe: export a complete backup file, import it on any install with a preview and
an undo, migrate old backup versions forward, and get reminded to back up.

## Read first

`docs/architecture.md` §6–7, Web Share API Level 2 (files) on iOS Safari, Zod docs.

## Scope

**In:** `src/data/backup/` (serialize, Zod schema v1, migrations registry, validate), use-cases `exportBackup`, `importBackup`
(preview → replace), `undoImport`, CSV export, Settings → Data screen, backup reminder, `lastBackupAt`, a pre-import
safety snapshot (new table → **Dexie v2** with migration test), deterministic fixture generator.
**Out:** merging two histories (not planned), cloud sync (not planned).

## Steps

1. Backup file per `docs/architecture.md` §7; filename `simple-budget-backup-YYYY-MM-DD.json`.
2. Export: if `navigator.canShare({ files })` → `navigator.share` (iOS share sheet → _Save to Files_), else download link.
   Update `settings.lastBackupAt` after a successful share/download.
3. Import: file picker → parse JSON → migrate (`migrations[v]` functions, v1 is identity) → Zod validate including
   referential integrity → preview card ("214 entries from Nov 2026 to Oct 2027, 9 tags, 6 recurring items") →
   _Replace all data_ (confirm) → snapshot current data into `importSnapshots` (keep latest 3) → replace in **one transaction**.
4. _Undo import_ button (visible until the next import or 7 days) restores the snapshot.
5. CSV export: date, name, amount, tags, source — one-way.
6. Reminder banner on the month screen if `lastBackupAt` is null after the first month, or older than 30 days. Dismissable for 7 days.
7. `scripts/generate-backup-fixture.ts` (planned until built) → `e2e/fixtures/backups/one-year-of-history.json` (seeded, deterministic).
8. Driver: `exportBackup()` (returns the downloaded file path/content), `importBackup(filePath)`, `undoImport()`, `wipeAllData()`
   (Settings → Data → Erase everything, with typed confirmation — also a real user feature).

## Behaviors to prove

- `exporting then importing on a fresh install gives back the exact same ledger and current budget`
- `for any budget data, importing its export reproduces it exactly` (property test on serialize/validate)
- `importing shows a preview of what will be replaced before anything changes`
- `a file from another app is rejected and nothing changes`
- `a backup with a broken tag reference is rejected with a clear message and nothing changes`
- `a backup with a fractional cent amount is rejected`
- `undo import brings back the data from before the import`
- `a version 1 backup still imports after the database moved to version 2`
- `the database upgrades from version 1 to version 2 without losing anything`
- `a backup reminder appears when the last backup is more than 30 days old`
- `exporting a backup clears the reminder`
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
