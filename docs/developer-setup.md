# Developer setup (Linux)

Pinned versions in `mise.toml`: **Node 22.14.0** and **pnpm 10.6.1**.

## 1. One-time install (CachyOS / Arch)

```bash
# Install mise (user-space, no sudo needed) or via pacman (`sudo pacman -S mise`)
curl https://mise.run | sh
#   fish (CachyOS default):  echo '~/.local/bin/mise activate fish | source' >> ~/.config/fish/config.fish
#   bash:                    echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
# then in the repo:
mise install            # installs Node 22.14.0 + pnpm 10.6.1
pnpm install

# Install Playwright browsers (Ubuntu 24.04 target for WebKit + Chromium)
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 pnpm exec playwright install chromium webkit
python3 scripts/setup-webkit-arch.py
```

How WebKit runs on Arch/CachyOS: `scripts/run-e2e.sh` checks whether Playwright's WebKit binary can launch
natively. If any Ubuntu 24.04 runtime shared libraries (`libicu74`, `libxml2.so.2`, `libvpx9`, `libavif16`, etc.)
are missing on the rolling-release host, `scripts/setup-webkit-arch.py` unpacks them directly into WebKit's own
`sys/lib/` directory (no root needed), or falls back to the official `mcr.microsoft.com/playwright` container
via Podman/Docker if installed.

## 2. Everyday commands

| Command                 | What it does                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm dev`              | Dev server at http://localhost:5173 with hot reload.                                            |
| `pnpm dev:lan`          | Same, reachable from your phone on Wi-Fi at `http://<your-laptop-ip>:5173`.                     |
| `pnpm build`            | Production build into `dist/`.                                                                  |
| `pnpm preview`          | Serves the production build at http://localhost:4173 (service worker active).                   |
| `pnpm typecheck`        | TypeScript, strict.                                                                             |
| `pnpm lint`             | ESLint.                                                                                         |
| `pnpm format`           | Prettier, writes changes.                                                                       |
| `pnpm format:check`     | Prettier, check only.                                                                           |
| `pnpm test`             | Rule tests (Vitest), once.                                                                      |
| `pnpm test:watch`       | Rule tests in watch mode.                                                                       |
| `pnpm test:e2e`         | Journey tests on every device profile (WebKit + Chromium).                                      |
| `pnpm test:e2e:ui`      | Playwright UI mode (Chromium projects, native) for debugging journeys.                          |
| `pnpm docs:check`       | Runs `scripts/check-docs.sh`.                                                                   |
| `pnpm verify`           | Runs `scripts/verify.sh` — the full gate. Required before every commit.                         |
| `pnpm verify:live`      | Runs `scripts/verify-live.mjs` — verifies the live GitHub Pages site + offline mode in WebKit.  |
| `pnpm release:bump`     | Runs `scripts/release-version.mjs` — bumps SemVer in `package.json` and updates `CHANGELOG.md`. |
| `pnpm release:deploy`   | Runs `scripts/deploy.sh` — deploys `dist/` to GitHub Pages and publishes the GitHub Release.    |
| `pnpm release:rollback` | Runs `scripts/rollback.sh` — rolls back the live site to a specified `v*` release tag.          |
| `pnpm ios:build`        | Runs `scripts/build-ios.sh` — bundles `dist/` into `ios/` and compiles/uploads on macOS CI.     |
| `pnpm prepare`          | Installs git hooks via `lefthook` (runs automatically on `pnpm install`).                       |

## 3. Seeing the app as an iPhone Duo — on Linux

You can't run the iOS Simulator on Linux, so we use three complementary views:

1. **Device wall (fastest feedback).** `pnpm dev`, then open http://localhost:5173/dev/devices.html.
   The app is shown side by side at every profile from `config/devices.ts`: Duo folded, Duo unfolded,
   regular iPhone, Android. Hot reload updates all of them at once.
2. **Browser responsive mode.** In Chrome/Firefox DevTools add custom devices:
   _iPhone Duo folded_ 466×678 @3x and _iPhone Duo unfolded_ 626×890 @3x.
3. **WebKit (Safari's engine).** `pnpm test:e2e` runs every journey in WebKit at both Duo sizes and
   saves screenshots of failures when runs fail. This is the closest thing to iPhone Safari available on Linux.

## 4. Seeing the app on your real phone

| Goal                                             | How                                                                                                                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick layout check while coding                  | `pnpm dev:lan`, allow the port once with `sudo ufw allow 5173/tcp`, open `http://<laptop-ip>:5173` in Safari. (Plain HTTP: no service worker/offline — fine for layout.)                                                                     |
| Full PWA test (install, offline)                 | Push to GitHub; the deploy workflow publishes it (see `docs/install-on-iphone.md`). Optional temporary HTTPS URL: `cloudflared tunnel --url http://localhost:4173` after `pnpm preview` — never keep real data in a temporary URL's install. |
| See the layout numbers on the device             | Add `?debug=layout` to the URL: shows CSS viewport size, pixel ratio, layout mode, safe areas, standalone or not.                                                                                                                            |
| See console errors on the device (no Mac needed) | Add `?debug=console` (dev and preview builds only): opens an in-app console.                                                                                                                                                                 |

## 5. Before committing

Always run `bash scripts/verify.sh` (or `pnpm verify` once T01 exists). Agents follow
`.agents/skills/verify-before-commit/SKILL.md`, which also requires seeing the feature work.
