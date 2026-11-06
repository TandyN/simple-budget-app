---
name: verify-before-commit
description: >-
  Use this skill before EVERY git commit in Simple Budget. It runs the full verification gate (docs, format, lint,
  types, unit tests, build, end-to-end journeys on all device profiles) and requires a hands-on check that the changed
  feature actually works in both iPhone Duo layouts. Never commit without completing it.
---

# Verify before commit

A commit means: "all tests pass **and** I watched this feature work." Both halves are required.

## 1. Run the gate

```bash
bash scripts/verify.sh
```

(Equivalent to `pnpm verify` once T01 exists.) It stops at the first failure. Fix the cause and re-run
from the top — a fix for one step can break an earlier one.

- Never weaken, skip or delete a test to get green. If a test is genuinely wrong, fix it **and** say so in the commit message.
- Never `git commit --no-verify`.
- If WebKit can't run (no container engine), stop and tell the user; don't commit with WebKit skipped.

## 2. See the feature work (skip only for docs-only or tooling-only changes)

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

- Only files related to this change. No `dist/`, `test-results/`, `playwright-report/`, scratch files, or secrets.
- Docs updated in the same commit (`keep-docs-accurate` skill). `bash scripts/check-docs.sh` already passed in step 1.

## 4. Commit

Conventional Commits with the plan task id:

```text
feat(ledger): subtract manual expenses from the current budget [T06]

- Expense sheet with amount, name, date
- Journeys: expense subtracts, deposit adds, delete + undo
Verified: scripts/verify.sh green; screenshots checked at Duo folded + unfolded.
```

## 5. Report

Tell the user which checks ran, that they passed, and where the screenshots are.
