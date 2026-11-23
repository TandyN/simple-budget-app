# Release rollback & roll-forward runbook

Executable incident-recovery procedures for the shipped PWA
(`.github/workflows/release.yml` + `.github/workflows/deploy-pages.yml`).
Design-of-record: [project-plan/testing.md → Release, Versioning &
Rollback / Roll-Forward Pipeline](../../project-plan/testing.md#release-versioning--rollback--roll-forward-pipeline).

## 1. Purpose & scope

- **Roll back** = restore a *previous same-schema* release (code at an
  unchanged `DB_VERSION`) to the `gh-pages` production root.
- **Roll forward** = ship a *new* release to recover (required once the
  on-disk schema or a broken `sw.js` makes the old version uninstallable for
  users).
- **Never roll back** the IndexedDB schema: W3C IndexedDB throws
  `VersionError` when opening a database at a lower version than the
  on-disk version (see
  [project-plan/storage.md → IndexedDB Schema Rollback Safety](../../project-plan/storage.md#indexeddb-schema-rollback-safety-versionerror--expand-and-contract)).
- **`Clear-Site-Data` is always forbidden**: GitHub Pages cannot set custom
  response headers, and forcing a clear would wipe users' local-first
  IndexedDB financial data with no remote copy to restore from.

## 2. Decision gate (do this first)

Before choosing a procedure, compare the deployed release's `DB_VERSION`
with the target release's:

```bash
# Target (the tag you would roll back to) vs. deployed (current main):
git show vX.Y.Z:src/storage/indexeddb.ts | grep -n "DB_VERSION ="
git show main:src/storage/indexeddb.ts | grep -n "DB_VERSION ="
```

- **Equal** (all MVP releases ship `DB_VERSION = 1`) → **Procedure A**
  (same-schema rollback) or **B** (if `sw.js` itself is broken).
- **Different** (target is lower) → rollback is **impossible** →
  **Procedure C** (forward-only hotfix at `DB_VERSION = N + 1`).

## 3. Procedure A — same-schema tag rollback (`workflow_dispatch`)

Precondition: decision gate shows equal `DB_VERSION`.

1. **Trigger the re-deploy:** Actions → *Deploy GitHub Pages* →
   *Run workflow* → `ref: vX.Y.Z` (last known-good tag). The
   `workflow_dispatch` ref is an **untrusted input**: the workflow rejects
   anything that is not a strict `vX.Y.Z` tag, a tag missing on origin, or a
   tag whose commit is not an ancestor of `main`
   (`deploy-pages.yml` → *Validate re-deploy tag ref*).
2. **Expect** (build log + `gh-pages`):
   - build log line `Building with VITE_BASE_PATH=/simple-budget-app/`;
   - `gh-pages` commit `ci(pages): re-deploy production root from tag vX.Y.Z (<sha7>)`;
   - the diff touches **root paths only**; every open `pr-*/` preview
     directory is preserved (enforced by the same-path assertions the
     `push` path uses).
3. **Service Worker cache swap (automatic, no user action):**
   - the rolled-back `dist/sw.js` embeds a different hex `BUILD_HASH` and
     `PRECACHE_URLS` (custom Vite plugin, `scripts/vite-sw-plugin.ts`) and is
     registered with `{ updateViaCache: "none" }` (`src/platform/sw.ts:294`),
     so the browser revalidates `sw.js` directly on navigation;
   - the byte-different worker updates, populates `sbapp-<goodhash>`, and
     prunes the stale `sbapp-<badhash>` via the predicate
     `key.startsWith("sbapp-") && !key.startsWith("sbapp-pr-")`;
   - **IndexedDB data is never touched** by any of this.
4. **Housekeeping (optional):** `git revert <bad-commit>` on `main` to
   re-sync `main` with what is deployed.

## 4. Procedure B — Emergency No-Op / Kill-Switch `sw.js` roll-forward

Use **only** when a faulty `sw.js` breaks fetch handling or blocks normal
update flows (a broken worker cannot be rolled back out from under users who
already activated it — roll **forward** with a known-good minimal worker).

1. Ship a minimal kill-switch `sw.js` to the exact URL
   `BASE_URL + "sw.js"` (via a normal `main` push → `deploy-pages.yml`):
   - `install` → `self.skipWaiting()` immediately (W3C Service Workers §4.1.4);
   - `activate` → delete all `sbapp-*` caches **excluding `sbapp-pr-*`**,
     then `await self.registration.unregister()` (W3C Service Workers §3.2.9)
     and reload controlled window clients
     (`clients.matchAll({ type: "window" })`).
2. **Never `Clear-Site-Data`** (see §1).
3. After recovery: re-run **Procedure A** with the last known-good tag to
   restore the normal SW, and fix + re-release the root cause on `main`.

## 5. Procedure C — post-schema-bump recovery (roll-forward only)

Once `DB_VERSION` has increased, rollback is impossible for anyone who
opened the database at the higher version:

1. Hotfix branch → **bump `DB_VERSION = N + 1`** (strictly forward-only,
   `src/storage/indexeddb.ts`);
2. non-destructive **expand-and-contract** `onupgradeneeded` migration;
3. ship; **never** call `indexedDB.deleteDatabase()` in response to
   `VersionError` — the shipped behavior is the typed, non-destructive
   `VersionMismatchError` → "Update required" banner
   (`src/storage/indexeddb.ts`), which is exactly what the
   `src/storage/indexeddb.test.ts` suite asserts (a `deleteDatabase()` spy
   must never fire).

## 6. Verification matrix (every row is executable)

| # | Checklist item | Executable verification | Pass criterion |
| - | -------------- | ----------------------- | -------------- |
| 1 | SW invariants: `updateViaCache: "none"`, `sbapp-`/`sbapp-pr-` cache isolation, `pr-*` bypass, `SKIP_WAITING`-only activation | `pnpm run build && pnpm run verify:gates` (Gate 5) | `[PASS] Gate 5: Phase 4D dist/sw.js manifest, scope isolation, pr-* bypass & SKIP_WAITING` |
| 2 | Non-destructive `VersionError` handling (typed `VersionMismatchError`, `deleteDatabase()` never called) | `pnpm test` (incl. `src/storage/indexeddb.test.ts` → "rejects with a typed VersionMismatchError and NEVER calls deleteDatabase") | all tests pass; coverage gates green |
| 3 | Live SW behavior: `updateViaCache === "none"`, offline reload preserves IndexedDB, `sbapp-pr-*` caches preserved across SW update | `pnpm exec playwright test e2e/pwa-offline.spec.ts` | suite green (Chromium projects; WebKit SW lifecycle tests skip by design) |
| 4 | Re-deploy guard rejects untrusted refs (non-SemVer, missing tag, tag not on main) | `pnpm test` (incl. `scripts/deploy-pages-workflow.test.mjs` → "validates the untrusted dispatch ref") | guard script exits non-zero with `::error` for all invalid refs |
| 5 | Re-deploy mutates root only, preserves `pr-*/` | `pnpm test` (incl. `scripts/deploy-pages-workflow.test.mjs` → "re-deploys the production root on workflow_dispatch") | `gh-pages` tree equals root + untouched `pr-*/` dirs |
| 6 | Full E2E regression after a recovery deploy | `pnpm run build && pnpm run verify:gates && pnpm run test:e2e` | 0 failed across Chromium + WebKit × 3 viewports |

## 7. References

- [project-plan/testing.md → Release, Versioning & Rollback / Roll-Forward Pipeline](../../project-plan/testing.md#release-versioning--rollback--roll-forward-pipeline)
- [project-plan/storage.md → IndexedDB Schema Rollback Safety (VersionError & expand-and-contract)](../../project-plan/storage.md#indexeddb-schema-rollback-safety-versionerror--expand-and-contract)
- [budget-app/frontend.md → Trusted Types Service Worker registration & update banner](frontend.md#9-trusted-types-service-worker-registration--update-banner-srcplatformswts-srcuiupdatebannerts)
- W3C Service Workers spec: `updateViaCache` (§3.2.7), `skipWaiting()` (§4.1.4), `unregister()` (§3.2.9)
- W3C IndexedDB spec: `VersionError` definition
- [Spike #334 findings](https://github.com/TandyN/simple-budget-app/issues/334) (implementation plan for the pipeline this runbook operates)
