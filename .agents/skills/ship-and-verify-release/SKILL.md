---
name: ship-and-verify-release
description: >-
  Use this skill after local verification passes to push a feature branch, open a Pull Request on
  TandyN/simple-budget-app, run an independent PR review, bump the SemVer version and CHANGELOG.md,
  merge to main, deploy to GitHub Pages, and run live WebKit + offline QA against the deployed site.
---

# Ship and Verify Release

Every completed task or update ships like a real business release: PR → Review → SemVer Bump → Merge → Deploy → Live & Offline QA.

## 1. Verify Repository & Local Gate

1. Check `git remote get-url origin` points to `TandyN/simple-budget-app`.
2. Ensure you are on a feature branch (e.g. `feat/T02-domain-core`), never committing feature work directly on `main`.
3. Run `pnpm verify` (`bash scripts/verify.sh`) and confirm all checks pass.

## 2. Push Branch & Open Pull Request

```bash
git push -u origin HEAD
gh pr create --repo TandyN/simple-budget-app --fill
```

## 3. Independent Code Review

Invoke a `reviewer` subagent (or follow `.agents/skills/review-pr/SKILL.md`) to review the PR diff and post the
review checklist comment on the PR via `gh pr comment`. Fix any findings before proceeding.

## 4. Bump SemVer & Changelog

Run the automated SemVer and changelog generator (`scripts/release-version.mjs`):

```bash
pnpm run release:bump
pnpm run format
bash scripts/verify.sh
```

Commit the version bump using the `agent-commit` skill:

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): bump version to v$(jq -r .version package.json) (agent-generated)"
git push
```

## 5. Merge PR to `main`

```bash
gh pr merge --repo TandyN/simple-budget-app --merge --delete-branch
git checkout main
git pull origin main
```

## 6. Deploy to GitHub Pages & Publish GitHub Release

```bash
pnpm run release:deploy
```

This builds `dist/` with `dist/version.json` (generated at build time, planned in build output) and the offline Service Worker, pushes `dist/` to `gh-pages`, ensures
GitHub Pages is enabled, tags `v<version>`, and creates the GitHub Release from `CHANGELOG.md`.

## 7. Run Live Post-Deploy & Offline QA

```bash
pnpm run verify:live
```

`scripts/verify-live.mjs` polls `https://tandyn.github.io/simple-budget-app/version.json` until the new version is
live, then opens the live URL in Playwright WebKit at both `iphone-duo-folded` and `iphone-duo-unfolded` viewports,
verifies the rendered version, switches WebKit to **offline mode**, reloads the page, and proves the live PWA works
100% offline.

If live QA fails, immediately run `.agents/skills/rollback-release/SKILL.md` to restore the previous version.
