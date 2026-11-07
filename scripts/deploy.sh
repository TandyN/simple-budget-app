#!/usr/bin/env bash
# deploy.sh — Deploys the verified production bundle to the `gh-pages` branch of
# TandyN/simple-budget-app.
#
# Modes:
#   bash scripts/deploy.sh            — Builds `dist/` and deploys to `gh-pages` (post-merge deploy for Live QA)
#   bash scripts/deploy.sh --release  — Cuts the official release: bumps SemVer & CHANGELOG.md from Conventional
#                                       Commits, commits/pushes to `main`, deploys the stamped build to `gh-pages`,
#                                       tags `vX.Y.Z`, and publishes the GitHub Release notes.

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

RELEASE_MODE=false
for arg in "$@"; do
  if [[ "$arg" == "--release" ]]; then
    RELEASE_MODE=true
  fi
done

if [[ "$RELEASE_MODE" == "true" ]]; then
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "main" ]]; then
    echo "✗ Official releases (--release) must be cut from main (currently on ${current_branch})." >&2
    exit 1
  fi

  current_version="$(jq -r '.version' package.json)"
  if git rev-parse "v${current_version}" >/dev/null 2>&1; then
    echo "▶ Generating next SemVer version and release notes from Conventional Commits..."
    node scripts/release-version.mjs
    pnpm run format
    new_version="$(jq -r '.version' package.json)"
    git add package.json CHANGELOG.md
    git commit -m "chore(release): v${new_version} (agent-generated)" \
      -m "Automated SemVer release and CHANGELOG.md generated from Conventional Commits. (agent-generated)"
    git push origin main
  fi
fi

version="$(jq -r '.version' package.json)"
commit_sha="$(git rev-parse --short HEAD)"
tag="v${version}"

echo "▶ Building production bundle for ${tag} (${commit_sha})..."
pnpm run build
touch dist/.nojekyll

echo "▶ Publishing dist/ to gh-pages branch on ${EXPECTED_REPO}..."
deploy_tmp="$(mktemp -d)"
trap 'rm -rf "$deploy_tmp"' EXIT

cp -r dist/. "$deploy_tmp/"
(
  cd "$deploy_tmp"
  git init -q -b gh-pages
  git config user.name "$(git -C "$repo_root" config user.name)"
  git config user.email "$(git -C "$repo_root" config user.email)"
  git add -A
  git commit -q -m "chore(release): deploy ${tag} (${commit_sha}) to GitHub Pages (agent-generated)"
  git remote add origin "https://github.com/${EXPECTED_REPO}.git"
  git push -f origin gh-pages
)

echo "▶ Ensuring GitHub Pages is enabled on ${EXPECTED_REPO} (branch: gh-pages)..."
if ! gh api "repos/${EXPECTED_REPO}/pages" >/dev/null 2>&1; then
  gh api "repos/${EXPECTED_REPO}/pages" -X POST \
    -F "source[branch]=gh-pages" \
    -F "source[path]=/" >/dev/null
  echo "  ✓ Enabled GitHub Pages for ${EXPECTED_REPO}"
else
  echo "  ✓ GitHub Pages is already active"
fi

if [[ "$RELEASE_MODE" == "true" ]]; then
  if ! git rev-parse "$tag" >/dev/null 2>&1; then
    echo "▶ Tagging and pushing ${tag}..."
    git tag -a "$tag" -m "Release ${tag} (agent-generated)"
    git push origin "$tag"
  fi

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
