#!/usr/bin/env bash
# run-e2e.sh — runs Playwright journeys natively when possible, or inside the
# official Playwright Ubuntu container on rolling-release Linux distros (e.g. Arch/CachyOS)
# where WebKit's Ubuntu-targeted shared libraries are not present on the host.

set -euo pipefail

export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:/tmp/mise/bin:$PATH"
if [[ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" && -d /tmp/pw-browsers ]]; then
  export PLAYWRIGHT_BROWSERS_PATH="/tmp/pw-browsers"
fi
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="${PLAYWRIGHT_HOST_PLATFORM_OVERRIDE:-ubuntu24.04-x64}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Check if all passed --project arguments are Chromium-only projects
only_chromium=0
if (( $# > 0 )); then
  only_chromium=1
  for arg in "$@"; do
    if [[ "$arg" == --project=* ]]; then
      proj="${arg#--project=}"
      if [[ "$proj" != chromium-* && "$proj" != "pixel-android" ]]; then
        only_chromium=0
      fi
    elif [[ "$arg" == "--project" ]]; then
      # Next argument specifies project; be conservative and check WebKit
      only_chromium=0
    fi
  done
fi

can_launch_webkit_natively() {
  node -e "import('@playwright/test').then(async ({ webkit }) => { const b = await webkit.launch(); await b.close(); })" >/dev/null 2>&1
}

if [[ "${CI:-}" == "true" || "${E2E_NATIVE:-}" == "1" ]] || (( only_chromium == 1 )) || can_launch_webkit_natively; then
  exec pnpm exec playwright test "$@"
fi

if command -v python3 >/dev/null 2>&1 && [[ -f scripts/setup-webkit-arch.py ]]; then
  echo "▶ Populating Ubuntu 24.04 shared libraries for Playwright WebKit..."
  if python3 scripts/setup-webkit-arch.py && can_launch_webkit_natively; then
    exec pnpm exec playwright test "$@"
  fi
fi

container_engine=""
if command -v podman >/dev/null 2>&1; then
  container_engine="podman"
elif command -v docker >/dev/null 2>&1; then
  container_engine="docker"
else
  echo "✗ WebKit cannot launch natively on this host and neither 'podman' nor 'docker' is installed." >&2
  echo "  Install podman with: sudo pacman -S podman" >&2
  exit 1
fi

pw_version="$(node -p "JSON.parse(fs.readFileSync('package.json', 'utf8')).devDependencies['@playwright/test']")"
image="mcr.microsoft.com/playwright:v${pw_version}-noble"

echo "▶ Running Playwright journeys in ${container_engine} (${image})..."
exec "$container_engine" run --rm --ipc=host \
  -v "${repo_root}:/app:Z" \
  -v "simple-budget-e2e-node-modules:/app/node_modules" \
  -w /app \
  "$image" \
  bash -lc 'corepack enable && pnpm install --frozen-lockfile && pnpm exec playwright test "$@"' -- "$@"
