---
name: ship-and-verify-release
description: >-
  Use this skill after local verification passes on a feature branch: open a PR for verification (GitHub Actions CI +
  independent code review), merge to main with a descriptive Conventional Commit merge subject, deploy to GitHub Pages,
  run live WebKit + offline PWA QA, and finally cut the official SemVer release and release notes from Conventional Commits.
---

# Ship and Verify Release

Simple Budget separates **PR verification** from **deployment, live QA, and official release cutting** so CI never runs redundantly:

1. **Pull Request = Verification Only** (local `pnpm verify` + GitHub Actions `verify` & `ios-simulator` + independent `review-pr`).
2. **Merge to `main` = Deploy Web Preview & Run Live QA** (`pnpm run release:deploy` → `pnpm run verify:live`).
3. **Post-QA = Official SemVer Release & Release Notes** (`pnpm run release:deploy -- --release` → `pnpm run verify:live`).

## 1. Verify Repository & Local Gate (Before Opening PR)

1. Check `git remote get-url origin` points to `TandyN/simple-budget-app`.
2. Ensure your feature branch has **multiple small, story-telling Conventional Commits** (`git log origin/main..HEAD --oneline`), never a single monolithic commit for an entire task.
3. Run `pnpm verify` (`bash scripts/verify.sh`) and confirm all checks pass.

## 2. Push Branch & Open Pull Request (No Version Bump or Deploy Yet)

```bash
git push -u origin HEAD
gh pr create --repo TandyN/simple-budget-app \
  --title "feat(<scope>): <feature summary> [Txx] (agent-generated)" \
  --body "..."
```

## 3. Independent Code Review (`review-pr`)

Invoke the `reviewer` subagent (or follow `.agents/skills/review-pr/SKILL.md`) to review `gh pr diff` and post the structured review checklist on the PR via `gh pr comment`. Fix any findings before proceeding.

## 4. Wait for GitHub Actions CI & Troubleshoot Any Failures

Wait for the GitHub Actions CI workflow (`.github/workflows/ci.yml` — both the Linux `verify` job and the macOS `ios-simulator` Xcode build job) to finish on the PR:

```bash
gh pr checks <pr-number> --watch --repo TandyN/simple-budget-app
```

- **If any CI check fails:**
  1. Immediately inspect the failed run logs:
     ```bash
     gh run list --repo TandyN/simple-budget-app --branch <branch-name> -L 3
     gh run view <run-id> --repo TandyN/simple-budget-app --log-failed
     ```
  2. Diagnose and fix the root cause on the branch, run `bash scripts/verify.sh` locally, commit with `(agent-generated)`, push, and re-run `gh pr checks <pr-number> --watch --repo TandyN/simple-budget-app` until every check is green.
  3. **Never merge a PR with a failing or cancelled GitHub Actions check.**

## 5. Merge PR to `main` with a Descriptive Feature Merge Subject

Keep the incremental commit history intact (`--merge`) while renaming the merge commit subject to clearly name the shipped feature and PR number:

```bash
gh pr merge <pr-number> --repo TandyN/simple-budget-app --merge --delete-branch \
  --subject "feat(<scope>): <feature summary> (#<pr-number>) [Txx] (agent-generated)"
git checkout main
git pull --ff-only origin main
```

_(Note: Pushing to `main` does NOT re-run the PR `verify` / `ios-simulator` CI jobs.)_

## 6. Deploy Merged `main` to GitHub Pages & Run Live + Offline QA

Deploy the newly merged code to `https://tandyn.github.io/simple-budget-app/` (without cutting a release tag yet) and run live WebKit + offline PWA verification against the deployed site:

```bash
pnpm run release:deploy
pnpm run verify:live
```

`scripts/verify-live.mjs` waits until `https://tandyn.github.io/simple-budget-app/version.json` serves the new `main` commit SHA, verifies the live app in WebKit at both `iphone-duo-folded` and `iphone-duo-unfolded` viewports, and reloads the live PWA 100% offline.

- If Live QA fails, immediately run `.agents/skills/rollback-release/SKILL.md` to restore the previous release tag.

## 7. Cut the Official SemVer Release & Release Notes

Once Live QA passes on the deployed app, publish the official release:

```bash
pnpm run release:deploy -- --release
pnpm run verify:live
```

What `bash scripts/deploy.sh --release` does automatically:

1. Runs `scripts/release-version.mjs` to inspect all non-merge Conventional Commits since the last `v*` tag, bump `package.json` SemVer (`0.y.z` pre-1.0), and generate categorized release notes (`Features`, `Bug Fixes`, `Refactoring & Performance`, `Tests & Quality`, `Documentation`, `Tooling & Maintenance`) in `CHANGELOG.md`.
2. Formats `CHANGELOG.md`, commits `chore(release): vX.Y.Z (agent-generated)` to `main`, and pushes `origin main`.
3. Rebuilds `dist/` with the new `vX.Y.Z` version and updates `gh-pages`.
4. Tags `vX.Y.Z`, pushes the tag (which triggers the `ios-testflight` job on GitHub Actions if Apple credentials are configured), and creates the official GitHub Release (`gh release create vX.Y.Z`) with the generated release notes.
