# Developer setup (Linux)

> Status: the toolchain is created in task T01. Until then only `bash scripts/verify.sh` works
> (it runs the docs check). T01 fills in the exact versions and keeps this page accurate.

## 1. One-time install (CachyOS / Arch)

```bash
# Node + pnpm, pinned per-project by mise.toml
sudo pacman -S mise
#   fish (CachyOS default):  echo 'mise activate fish | source' >> ~/.config/fish/config.fish
#   bash:                    echo 'eval "$(mise activate bash)"' >> ~/.bashrc
# open a new terminal, then in the repo:
mise install            # installs the pinned Node LTS + pnpm
pnpm install

# Container engine for WebKit end-to-end tests (Playwright's WebKit build doesn't support Arch natively)
sudo pacman -S podman

# Chromium for local Playwright runs (works natively on Arch)
pnpm exec playwright install chromium
```

Why a container for WebKit? Playwright officially supports WebKit on Ubuntu/Debian only. On rolling
distros it needs old ICU/libxml2 builds and breaks on updates. Running Playwright's official image
(`mcr.microsoft.com/playwright`, same version as our `@playwright/test`) gives the exact engine CI uses.

## 2. Everyday commands (planned — created in T01; T01 replaces this note)

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server at http://localhost:5173 with hot reload. |
| `pnpm dev:lan` | Same, reachable from your phone on Wi-Fi at `http://<your-laptop-ip>:5173`. |
| `pnpm build` | Production build into `dist/` (planned). |
| `pnpm preview` | Serves the production build at http://localhost:4173 (service worker active). |
| `pnpm typecheck` | TypeScript, strict. |
| `pnpm lint` | ESLint. |
| `pnpm format` | Prettier, writes changes. |
| `pnpm format:check` | Prettier, check only. |
| `pnpm test` | Rule tests (Vitest), once. |
| `pnpm test:watch` | Rule tests in watch mode. |
| `pnpm test:e2e` | Journey tests on every device profile (WebKit runs inside the Podman container). |
| `pnpm test:e2e:ui` | Playwright UI mode (Chromium projects, native) for debugging journeys. |
| `pnpm docs:check` | Runs `scripts/check-docs.sh`. |
| `pnpm verify` | Runs `scripts/verify.sh` — the full gate. Required before every commit. |

## 3. Seeing the app as an iPhone Duo — on Linux

You can't run the iOS Simulator on Linux, so we use three complementary views:

1. **Device wall (fastest feedback).** `pnpm dev`, then open http://localhost:5173/dev/devices.html.
   The app is shown side by side at every profile from `config/devices.ts` (planned): Duo folded, Duo unfolded,
   regular iPhone, Android. Hot reload updates all of them at once.
2. **Browser responsive mode.** In Chrome/Firefox DevTools add custom devices:
   *iPhone Duo folded* 466×678 @3x and *iPhone Duo unfolded* 626×890 @3x.
3. **WebKit (Safari's engine).** `pnpm test:e2e` runs every journey in WebKit at both Duo sizes and
   saves screenshots of failures in `test-results/` (planned). This is the closest thing to iPhone Safari available on Linux.

## 4. Seeing the app on your real phone

| Goal | How |
| --- | --- |
| Quick layout check while coding | `pnpm dev:lan`, allow the port once with `sudo ufw allow 5173/tcp`, open `http://<laptop-ip>:5173` in Safari. (Plain HTTP: no service worker/offline — fine for layout.) |
| Full PWA test (install, offline) | Push to GitHub; the deploy workflow publishes it (see `docs/install-on-iphone.md`). Optional temporary HTTPS URL: `cloudflared tunnel --url http://localhost:4173` after `pnpm preview` — never keep real data in a temporary URL's install. |
| See the layout numbers on the device | Add `?debug=layout` to the URL: shows CSS viewport size, pixel ratio, layout mode, safe areas, standalone or not. |
| See console errors on the device (no Mac needed) | Add `?debug=console` (dev and preview builds only): opens an in-app console. |

## 5. Before committing

Always run `bash scripts/verify.sh` (or `pnpm verify` once T01 exists). Agents follow
`.agents/skills/verify-before-commit/SKILL.md`, which also requires seeing the feature work.

