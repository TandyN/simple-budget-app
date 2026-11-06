---
name: rollback-release
description: >-
  Use this skill when a live deployment on https://tandyn.github.io/simple-budget-app/ fails post-deploy QA
  or when the user asks to roll back to a previous release tag. It redeploys the specified v* tag and verifies
  the live site and offline PWA behavior.
---

# Rollback Release

## 1. Identify Target Release Tag

List available release tags ordered newest first:

```bash
git fetch --tags origin
git tag -l "v*" --sort=-v:refname
```

Pick the last known-good tag (or the tag requested by the user).

## 2. Execute Rollback

Run the automated rollback script (`scripts/rollback.sh`):

```bash
pnpm run release:rollback <tag>
```

What this does:

1. Checks out `<tag>` in an isolated temporary git worktree.
2. Runs `pnpm install --frozen-lockfile` and `bash scripts/deploy.sh` to build and publish `<tag>`'s bundle to `gh-pages`.
3. Runs `node scripts/verify-live.mjs --expect-version <tag-version>` to verify that `https://tandyn.github.io/simple-budget-app/version.json` and the live offline PWA in WebKit match the rolled-back version.

## 3. Report & Revert on `main` if Needed

Report the live rollback status to the user. If the bad commit on `main` should also be reverted in source history,
open a revert branch (`git checkout -b fix/revert-<sha>`) with `git revert <sha>`, commit with `(agent-generated)`,
and ship via `ship-and-verify-release`.
