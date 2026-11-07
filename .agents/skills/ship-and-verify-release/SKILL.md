---
name: ship-and-verify-release
description: >-
  Use this skill after local verification passes on a feature branch: open a PR to main, wait for GitHub Actions
  ci.yml (tests + isolated /pr-N/ preview QA + iOS Simulator artifact) and independent review, ensure the branch is
  up-to-date with main, merge with a descriptive Conventional Commit merge subject, and watch the automated
  release.yml workflow publish the SemVer release, production PWA, and iOS TestFlight build.
---

# Ship and Verify Release

Simple Budget uses **Trunk-Based Development** with two separate GitHub Actions workflows:

- **`.github/workflows/ci.yml` (on Pull Requests):** Verifies the branch is up-to-date with `main`, runs all unit + E2E tests, deploys an isolated preview to `https://tandyn.github.io/simple-budget-app/pr-<N>/`, runs live WebKit + offline QA on that preview, and uploads the `SimpleBudget-iOS-Simulator` `.app` artifact.
- **`.github/workflows/release.yml` (on Merge to `main`):** Automatically bumps SemVer + `CHANGELOG.md` from Conventional Commits, deploys the production PWA to `https://tandyn.github.io/simple-budget-app/`, verifies it live, pushes the `vX.Y.Z` tag + GitHub Release notes, and runs `ios-testflight`.

## 1. Verify Repository, Incremental Commits & Local Gate (Before Opening PR)

1. Check `git remote get-url origin` points to `TandyN/simple-budget-app`.
2. Ensure your feature branch is up to date with `origin/main` (`git fetch origin main && git rebase origin/main`) and has **multiple small, story-telling Conventional Commits** (`git log origin/main..HEAD --oneline`).
3. Run `pnpm verify` (`bash scripts/verify.sh`) and confirm all checks pass.

## 2. Push Branch & Open Pull Request

```bash
git push -u origin HEAD
gh pr create --repo TandyN/simple-budget-app \
  --title "feat(<scope>): <feature summary> [Txx] (agent-generated)" \
  --body "..."
```

## 3. Dispatch the Independent Reviewer & QA Agent

**The implementer conversation does NOT review or merge the PR.** Instead, spawn a **fresh `general-purpose` subagent** in **background mode** using the `task` tool. This agent is the Staff Engineer Reviewer — it has its own context, makes its own judgment, and is the one who merges.

The `task` call looks like this (adjust the PR number, scope, and feature summary):

```
task(
  name: "reviewer-T<XX>",
  agent_type: "general-purpose",
  mode: "background",
  prompt: `
You are the **Staff Engineer Reviewer** for TandyN/simple-budget-app.
This is a fresh, independent review — you did not write the code.

PR to review:   gh pr view <PR> --repo TandyN/simple-budget-app
Preview URL:    https://tandyn.github.io/simple-budget-app/pr-<PR>/
Feature:        <one-line summary of what this PR adds>

Work in this order:

1. WAIT FOR CI — watch all checks:
   gh pr checks <PR> --watch --repo TandyN/simple-budget-app
   If any check fails, diagnose with:
     gh run list --branch <branch> -L 1 --json databaseId -q '.[0].databaseId'
     gh run view <run-id> --repo TandyN/simple-budget-app --log-failed
   Fix the root cause on the branch, run bash scripts/verify.sh locally,
   commit with (agent-generated), push, and re-watch until green.
   Never proceed to review with a failing check.

2. REVIEW THE DIFF — run:
   gh pr diff <PR>
   Check every item in .agents/skills/review-pr/SKILL.md §2.
   Pay special attention to:
   - Human Description in README.md (above # Simple Budget) is 100% untouched
   - All agent commits end with (agent-generated)
   - package.json "dependencies" contains only react and react-dom
   - Money is integer Cents; dates are YYYY-MM-DD strings; src/domain/ is pure
   - Every new/changed test is human-readable per docs/testing.md

3. HANDS-ON QA — open the preview in a browser (or Playwright):
   https://tandyn.github.io/simple-budget-app/pr-<PR>/
   Exercise the changed feature in BOTH layouts:
   - iphone-duo-folded  (466 × 678)
   - iphone-duo-unfolded (626 × 890)
   Verify: correct numbers, nothing clipped or overlapping, no broken styles.

4. POST THE REVIEW — post a structured comment on the PR:
   gh pr comment <PR> --repo TandyN/simple-budget-app --body "
   ## Staff Engineer Review (agent-generated)
   - [x or x] Human Description untouched
   - [x or x] Commits marked (agent-generated)
   - [x or x] Zero extra runtime dependencies
   - [x or x] Golden rules & readable tests verified
   - [x or x] Documentation 100% accurate
   - [x or x] GitHub Actions CI green
   - [x or x] Hands-on QA: folded ✓  unfolded ✓

   **Feature verified:** <what you saw working>
   **Verdict:** APPROVED  (or CHANGES REQUESTED: <specific file/line issues>)
   "

5. MERGE (only if verdict is APPROVED):
   gh pr merge <PR> --repo TandyN/simple-budget-app --merge --delete-branch \
     --subject "feat(<scope>): <feature summary> (#<PR>) [Txx] (agent-generated)"

6. WATCH THE RELEASE — the merge triggers release.yml on main:
   sleep 5
   RID=$(gh run list --repo TandyN/simple-budget-app --workflow release.yml -L 1 \
         --json databaseId -q '.[0].databaseId')
   gh run watch "$RID" --repo TandyN/simple-budget-app --exit-status
   git checkout main && git pull --ff-only origin main

Report back: the verdict, the release version, and any issues found and fixed.
`
)
```

The implementer continues to the next plan task while the reviewer works in the background.
Wait for the background agent to complete before reporting results to the user.

## 4. Wait for GitHub Actions PR Verification & Preview QA (`.github/workflows/ci.yml`)

Wait for `.github/workflows/ci.yml` (both the Linux `verify` job — which includes isolated `/pr-<N>/` deployment + live WebKit/offline QA — and the macOS `ios-simulator` Xcode build job) to finish on the PR:

```bash
gh pr checks <pr-number> --watch --repo TandyN/simple-budget-app
```

- **If another PR merged to `main` while your PR was open:**
  1. Wait for that PR's `.github/workflows/release.yml` run on `main` to finish (`gh run list --workflow=release.yml --repo TandyN/simple-budget-app -L 1`).
  2. Rebase your branch onto the updated `origin/main` (`git fetch origin main && git rebase origin/main && git push --force-with-lease`) and re-run `gh pr checks <pr-number> --watch --repo TandyN/simple-budget-app`.
- **If any CI check fails:**
  1. Immediately inspect the failed run logs:
     ```bash
     gh run list --repo TandyN/simple-budget-app --branch <branch-name> -L 3
     gh run view <run-id> --repo TandyN/simple-budget-app --log-failed
     ```
  2. Diagnose and fix the root cause on the branch, run `bash scripts/verify.sh` locally, commit with `(agent-generated)`, push, and re-run `gh pr checks <pr-number> --watch --repo TandyN/simple-budget-app` until every check is green.
  3. **Never merge a PR with a failing or cancelled GitHub Actions check.**

## 5. The Reviewer Merges — the Implementer Never Merges

Merging is the **reviewer subagent's** action (see §3, step 5). The conversation that wrote the code does **not** call `gh pr merge` — that is the boundary that keeps the review independent. If the reviewer reports `CHANGES REQUESTED`, fix the named issues, re-run `bash scripts/verify.sh`, push, and re-dispatch the reviewer with the updated PR.

## 6. Watch the Automated Production Release Workflow (`.github/workflows/release.yml`)

Merging to `main` automatically triggers `.github/workflows/release.yml` on GitHub Actions (which bumps SemVer, generates release notes in `CHANGELOG.md`, deploys to `https://tandyn.github.io/simple-budget-app/`, runs live WebKit + offline QA, pushes `vX.Y.Z` + GitHub Release notes, and triggers `ios-testflight`).

Wait for the `.github/workflows/release.yml` workflow run to complete and sync your local `main` branch:

```bash
sleep 5
release_run_id="$(gh run list --repo TandyN/simple-budget-app --workflow=release.yml -L 1 --json databaseId -q '.[0].databaseId')"
gh run watch "$release_run_id" --repo TandyN/simple-budget-app --exit-status
git checkout main
git pull --ff-only origin main
git fetch --tags origin
```

If `.github/workflows/release.yml` fails during post-deploy QA, inspect `gh run view "$release_run_id" --repo TandyN/simple-budget-app --log-failed` and use `.agents/skills/rollback-release/SKILL.md` if needed.
