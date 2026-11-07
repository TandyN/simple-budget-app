---
name: verify-before-commit
description: >-
  Use this skill before committing in Simple Budget. For intermediate commits on a feature branch, run the fast
  local gate (docs, format, lint, types, unit tests). Before the final commit / opening a PR, run the full
  verification gate (scripts/verify.sh including E2E journeys on all device profiles) and a hands-on check in both
  iPhone Duo layouts.
---

# Verify before commit

> `bash scripts/verify.sh` and E2E suites can run for several minutes. Follow `never-stop-mid-task`:
> name the command first, set a generous `timeout` on the `bash` tool call, **and never end the turn on a
> description of the next verification step** — call the tool in the same turn.

Every commit must be verified, and before opening a Pull Request you must both pass `bash scripts/verify.sh` **and** watch the feature work.

## 1. Intermediate Commits vs. Final Pre-PR Gate

- **Intermediate commits while building a feature (encouraged!):**
  Commit each logical step as you finish it (see `agent-commit`). Before each intermediate commit, run the fast local checks:
  ```bash
  pnpm docs:check && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
  ```
- **Final commit before pushing / opening a Pull Request:**
  Run the full verification gate:

  ```bash
  bash scripts/verify.sh
  ```

  It stops at the first failure. Fix the cause and re-run from the top — a fix for one step can break an earlier one.

- Never weaken, skip or delete a test to get green. If a test is genuinely wrong, fix it **and** say so in the commit message.
- Never `git commit --no-verify`.
- If WebKit can't run, stop and tell the user; don't commit with WebKit skipped.

## 2. See the feature work (before opening a PR; skip only for docs-only or non-UI changes)

1. Build and serve: `pnpm build` then `pnpm preview` (run it as a background/daemon task).
2. Exercise the exact feature you changed, as a user would, at **both** `iphone-duo-folded` and
   `iphone-duo-unfolded` sizes. Easiest: a throwaway Playwright script in your scratch directory that walks the
   flow and saves screenshots (e.g. `npx playwright screenshot` or a small script using `config/devices.ts`).
3. **Open and look at the screenshots.** Check: correct numbers, nothing clipped or overlapping, the hinge gutter
   is clear in unfolded mode, dark mode isn't broken if you touched styles.
4. If you changed money math, write the expected numbers down **before** looking, then compare.
5. Stop the preview server.

## 3. Check the diff

```bash
git status
git diff --staged
```

- Only files related to this logical step. No `dist/`, `test-results/`, `playwright-report/`, scratch files, or secrets.
- Docs updated (`keep-docs-accurate` skill). `bash scripts/check-docs.sh` passed.

## 4. Commit (using the `agent-commit` skill)

Conventional Commits with the plan task id and mandatory `(agent-generated)` suffix on both subject and body:

```text
feat(ledger): subtract manual expenses from the current budget [T06] (agent-generated)

- Expense sheet with amount, name, date
- Journeys: expense subtracts, deposit adds, delete + undo
Verified: scripts/verify.sh green; screenshots checked at Duo folded + unfolded. (agent-generated)
```

## 5. Report

Tell the user which checks ran, that they passed, and where the screenshots are.
