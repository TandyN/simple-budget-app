#!/usr/bin/env bash
# rollback.sh — Rolls back the live GitHub Pages deployment to a known-good
# release tag (e.g. `pnpm release:rollback v0.1.0`) and verifies the live site.

set -euo pipefail

export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:/tmp/mise/bin:$PATH"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

target_tag="${1:-}"
if [[ -z "$target_tag" ]]; then
  echo "Usage: pnpm release:rollback <tag>   (e.g. pnpm release:rollback v0.1.0)" >&2
  echo "Available release tags:" >&2
  git tag -l "v*" --sort=-v:refname >&2
  exit 1
fi

git fetch --tags origin
if ! git rev-parse "$target_tag" >/dev/null 2>&1; then
  echo "✗ Unknown release tag: ${target_tag}" >&2
  exit 1
fi

worktree_dir="$(mktemp -d)"
trap 'git worktree remove --force "$worktree_dir" >/dev/null 2>&1 || rm -rf "$worktree_dir"' EXIT

echo "▶ Checking out ${target_tag} in isolated worktree..."
git worktree add --detach "$worktree_dir" "$target_tag"

(
  cd "$worktree_dir"
  pnpm install --frozen-lockfile
  bash scripts/deploy.sh
)

target_version="${target_tag#v}"
echo "▶ Verifying live rollback to v${target_version}..."
node scripts/verify-live.mjs --expect-version "$target_version"
echo "✓ Rollback to ${target_tag} complete and verified live."

