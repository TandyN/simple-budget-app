#!/usr/bin/env bash
# deploy.sh — Deploys the verified production bundle to the `gh-pages` branch of
# TandyN/simple-budget-app and automates official SemVer releases.
#
# Modes:
#   bash scripts/deploy.sh                   — Deploys `dist/` to the root of `gh-pages` (preserving any `pr-*` folders)
#   bash scripts/deploy.sh --pr <N>          — Deploys `dist/` to `gh-pages/pr-<N>/` for isolated PR preview QA
#   bash scripts/deploy.sh --cleanup-pr <N>  — Removes `pr-<N>/` from `gh-pages` when a PR closes/merges
#   bash scripts/deploy.sh --release         — Full automated release on `main`: bumps SemVer & CHANGELOG.md from
#                                              Conventional Commits, builds & deploys `dist/` to `gh-pages`, runs
#                                              Live WebKit + Offline PWA QA (`verify-live.mjs`), pushes the release
#                                              commit + `vX.Y.Z` tag to `main`, and creates the GitHub Release.

set -euo pipefail

export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:/tmp/mise/bin:$PATH"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

EXPECTED_REPO="TandyN/simple-budget-app"
remote_url="$(git remote get-url origin)"
if [[ "$remote_url" != *"${EXPECTED_REPO}"* ]]; then
  echo "✗ Refusing to deploy: origin ($remote_url) is not ${EXPECTED_REPO}" >&2
  exit 1
fi

MODE="root"
PR_NUMBER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      MODE="release"
      shift
      ;;
    --pr)
      MODE="pr"
      PR_NUMBER="${2:-}"
      if [[ -z "$PR_NUMBER" ]]; then
        echo "✗ --pr requires a pull request number." >&2
        exit 1
      fi
      shift 2
      ;;
    --cleanup-pr)
      MODE="cleanup-pr"
      PR_NUMBER="${2:-}"
      if [[ -z "$PR_NUMBER" ]]; then
        echo "✗ --cleanup-pr requires a pull request number." >&2
        exit 1
      fi
      shift 2
      ;;
    *)
      echo "✗ Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

ensure_git_identity() {
  if [[ -z "$(git config user.name || true)" ]]; then
    git config user.name "github-actions[bot]"
  fi
  if [[ -z "$(git config user.email || true)" ]]; then
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  fi
}

publish_to_gh_pages() {
  local target_subdir="$1"
  local commit_msg="$2"

  for attempt in 1 2 3; do
    local deploy_tmp
    deploy_tmp="$(mktemp -d)"
    if git fetch origin gh-pages >/dev/null 2>&1; then
      git worktree add -f --detach "$deploy_tmp" origin/gh-pages >/dev/null
    else
      git worktree add -f --detach "$deploy_tmp" >/dev/null
      find "$deploy_tmp" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
    fi

    if [[ "$MODE" == "cleanup-pr" ]]; then
      rm -rf "${deploy_tmp}/pr-${PR_NUMBER}"
    elif [[ -n "$target_subdir" ]]; then
      rm -rf "${deploy_tmp}/${target_subdir}"
      mkdir -p "${deploy_tmp}/${target_subdir}"
      cp -r dist/. "${deploy_tmp}/${target_subdir}/"
      touch "${deploy_tmp}/.nojekyll"
    else
      find "$deploy_tmp" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name 'pr-*' ! -name 'assets' -exec rm -rf {} +
      mkdir -p "${deploy_tmp}/assets"
      cp -r dist/. "$deploy_tmp/"
      current_js="$(find dist/assets -maxdepth 1 -name 'index-*.js' | head -n 1)"
      if [[ -n "$current_js" ]]; then
        for legacy_bundle in index-CZi6KRj0.js index-B_c5tggd.js index-CFmOOG01.js; do
          cp "$current_js" "${deploy_tmp}/assets/${legacy_bundle}"
        done
      fi
      touch "${deploy_tmp}/.nojekyll"
    fi

    (
      cd "$deploy_tmp"
      ensure_git_identity
      git add -A
      if git diff --cached --quiet; then
        echo "  ✓ gh-pages is already up to date."
      else
        git commit -q -m "$commit_msg"
      fi
    )

    if git -C "$deploy_tmp" push origin HEAD:refs/heads/gh-pages; then
      git worktree remove -f "$deploy_tmp" >/dev/null 2>&1 || rm -rf "$deploy_tmp"
      return 0
    fi

    git worktree remove -f "$deploy_tmp" >/dev/null 2>&1 || rm -rf "$deploy_tmp"
    echo "  … Retrying gh-pages push (attempt ${attempt}/3)..."
    sleep 2
  done

  echo "✗ Failed to push to gh-pages after 3 attempts." >&2
  return 1
}

if [[ "$MODE" == "cleanup-pr" ]]; then
  echo "▶ Cleaning up PR #${PR_NUMBER} preview from gh-pages..."
  publish_to_gh_pages "" "chore(preview): remove pr-${PR_NUMBER} preview [skip ci] (agent-generated)"
  echo "✓ Cleaned up pr-${PR_NUMBER} preview."
  exit 0
fi

if [[ "$MODE" == "pr" ]]; then
  version="$(jq -r '.version' package.json)"
  commit_sha="$(git rev-parse --short HEAD)"
  echo "▶ Building PR #${PR_NUMBER} preview bundle for v${version} (${commit_sha})..."
  pnpm run build
  echo "▶ Publishing dist/ to gh-pages/pr-${PR_NUMBER}/ on ${EXPECTED_REPO}..."
  publish_to_gh_pages "pr-${PR_NUMBER}" "chore(preview): deploy PR #${PR_NUMBER} (${commit_sha}) to GitHub Pages [skip ci] (agent-generated)"
  echo "✓ Deployed PR #${PR_NUMBER} preview to https://tandyn.github.io/simple-budget-app/pr-${PR_NUMBER}/"
  exit 0
fi

if [[ "$MODE" == "release" ]]; then
  ensure_git_identity
  echo "▶ Generating next SemVer version and release notes from Conventional Commits..."
  node scripts/release-version.mjs
  pnpm run format
  new_version="$(jq -r '.version' package.json)"
  git add package.json CHANGELOG.md
  if ! git diff --cached --quiet; then
    git commit -m "chore(release): v${new_version} [skip ci] (agent-generated)" \
      -m "Automated SemVer release and CHANGELOG.md generated from Conventional Commits. (agent-generated)"
  fi
fi

version="$(jq -r '.version' package.json)"
commit_sha="$(git rev-parse --short HEAD)"
tag="v${version}"

echo "▶ Building production bundle for ${tag} (${commit_sha})..."
pnpm run build

echo "▶ Publishing dist/ to root of gh-pages branch on ${EXPECTED_REPO}..."
publish_to_gh_pages "" "chore(release): deploy ${tag} (${commit_sha}) to GitHub Pages [skip ci] (agent-generated)"

echo "▶ Ensuring GitHub Pages is enabled on ${EXPECTED_REPO} (branch: gh-pages)..."
if ! gh api "repos/${EXPECTED_REPO}/pages" >/dev/null 2>&1; then
  gh api "repos/${EXPECTED_REPO}/pages" -X POST \
    -F "source[branch]=gh-pages" \
    -F "source[path]=/" >/dev/null || true
  echo "  ✓ Enabled GitHub Pages for ${EXPECTED_REPO}"
else
  echo "  ✓ GitHub Pages is already active"
fi

if [[ "$MODE" == "release" ]]; then
  echo "▶ Running post-deploy Live WebKit & Offline PWA QA against https://tandyn.github.io/simple-budget-app/..."
  node scripts/verify-live.mjs --expect-version "$version" --expect-commit "$commit_sha"

  echo "▶ Pushing release commit and tag ${tag} to origin/main..."
  git push origin HEAD:refs/heads/main

  if ! git rev-parse "$tag" >/dev/null 2>&1; then
    git tag -a "$tag" -m "Release ${tag} (agent-generated)"
  fi
  git push origin "$tag"

  if ! gh release view "$tag" --repo "$EXPECTED_REPO" >/dev/null 2>&1; then
    notes="$(awk "/^## \\[${version}\\]/{flag=1; next} /^## \\[/{flag=0} flag" CHANGELOG.md)"
    gh release create "$tag" \
      --repo "$EXPECTED_REPO" \
      --title "$tag" \
      --notes "${notes:-Release ${tag}}"
    echo "  ✓ Created GitHub Release ${tag}"
  fi
fi

echo "✓ Deployed ${tag} (${commit_sha}) to https://tandyn.github.io/simple-budget-app/"
