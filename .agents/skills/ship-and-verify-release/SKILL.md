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

## 3. Independent Code Review (`review-pr`)

Invoke the `reviewer` subagent (or follow `.agents/skills/review-pr/SKILL.md`) to review `gh pr diff` and post the structured review checklist on the PR via `gh pr comment`. Fix any findings before proceeding.

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

## 5. Merge PR to `main` with a Descriptive Feature Merge Subject

Keep the incremental commit history intact (`--merge`) while renaming the merge commit subject to clearly name the shipped feature and PR number:

```bash
gh pr merge <pr-number> --repo TandyN/simple-budget-app --merge --delete-branch \
  --subject "feat(<scope>): <feature summary> (#<pr-number>) [Txx] (agent-generated)"
```

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
