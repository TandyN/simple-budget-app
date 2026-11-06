#!/usr/bin/env bash
# deploy.sh — Builds the verified production bundle, deploys it to the `gh-pages`
# branch of TandyN/simple-budget-app, ensures GitHub Pages is enabled, and creates
# the corresponding git tag & GitHub Release if not yet published.

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

if ! git rev-parse "$tag" >/dev/null 2>&1; then
  echo "▶ Tagging and publishing GitHub Release ${tag}..."
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

echo "✓ Deployed ${tag} (${commit_sha}) to https://tandyn.github.io/simple-budget-app/"

