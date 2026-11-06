# T10 — Native iOS App, Offline Shell & Automated Deployment 🎯 MVP

**Depends on:** T09 — **Milestone:** MVP — after this the owner installs the app and starts using it.

## Goal

The app ships both as a **Native iOS App (`ios/`)** (compiled and uploaded to TestFlight / App Store Connect via GitHub Actions `macos-15`) where storage lives in native iOS `Application Support` (immune to Safari cache clearing), and as an offline-ready web preview on GitHub Pages.

## Read first

`docs/install-on-iphone.md`, `docs/architecture.md` §1 & §6, `ios/project.yml`, `scripts/build-ios.sh`.

## Scope

**In:** Native iOS storage persistence verification (`window.webkit.messageHandlers.nativeStorage` integration test with mock handler in Playwright), Service worker update toast (`SKIP_WAITING` prompt on `public/sw.js`), `src/pwa/`
(native iOS / standalone detection, Safari install guide card when opened in a mobile browser tab, `navigator.storage.persist()`), Settings → Data storage status ("Protected in Native iOS App Storage" vs browser storage status),
owner-facing TestFlight & viewport verification checklist. (Base `ios/` Swift target, `scripts/build-ios.sh`, offline SW, manifest, icons, and GitHub Pages deployment pipeline are already scaffolded!)
**Out:** push notifications, background sync (not needed for a local app).

## Steps

1. Icons: a minimal monochrome mark (e.g. a rounded square with a single stroke/bar motif) as SVG source → PNG 180 (apple-touch-icon),
   192, 512, and maskable 512 in `public/`. Generate with a script so they're reproducible. Light and dark friendly.
2. Manifest: `name: "Simple Budget"`, `short_name: "Budget"`, `display: "standalone"`, `start_url` and `scope` = base path,
   `background_color`/`theme_color` from tokens, `orientation: "any"` (the Duo unfolds).
3. Service worker precaches the app shell; no runtime caching of anything external (there is nothing external).
   Disabled during journeys except in the dedicated offline/update tests.
4. Update flow: when a new SW is waiting → toast "Update available · Reload". Never auto-reload.
5. `src/pwa/standalone.ts`: detect `display-mode: standalone` / `navigator.standalone`. In a Safari tab, show a dismissable
   install guide card (with the warning that Safari-tab data is separate and can be cleared).
6. Call `navigator.storage.persist()` after setup; show "Storage: protected / best effort" in Settings → Data with an explanation.
7. Hosting:
   - `vite.config` `base` from env (`/simple-budget/` for GitHub Pages, `/` for local and Cloudflare).
   - `deploy.yml`: on push to `main` → run the full CI gate → build → `actions/upload-pages-artifact` → `actions/deploy-pages`.
     Deploy job `needs` the test job. Document the Cloudflare Pages alternative (build command, output dir, env) in `docs/install-on-iphone.md`.
8. Owner checklist (put it in the Completion notes and tell the user): push repo, enable Pages (Source: GitHub Actions),
   open URL in Safari, Add to Home Screen, run setup in the installed app, open `?debug=layout` and report numbers →
   agent updates `config/devices.ts` if they differ.

## Behaviors to prove

- `the app keeps working offline after the first visit` (Playwright `context.setOffline(true)` + reload)
- `a new version shows "Update available" and only reloads when you tap it`
- `the manifest describes an installable standalone app with home screen icons`
- `in a Safari tab the app explains how to add it to the Home Screen`
- `the installed app does not show the install guide`
- `Settings shows whether storage is protected`
- `the production build works under the /simple-budget/ path`

## Acceptance criteria

- [ ] Lighthouse PWA/installability checks pass (or the equivalent manual checklist if Lighthouse no longer audits PWAs).
- [ ] Deploy workflow cannot publish if any test fails (job dependency verified).
- [ ] Owner has installed the app on the iPhone Duo and confirmed folded/unfolded layouts (ask the user; record the answer).
- [ ] `pnpm verify` passes.

## Docs to update

`docs/install-on-iphone.md` (final steps, URLs, Cloudflare alternative), `docs/developer-setup.md` (preview/offline testing),
`docs/design.md` (device numbers if corrected), `AGENTS.md` (`src/pwa/`, `.github/` rows), `README.md` status → "MVP usable".

## Completion notes

_Filled in by the agent when done._
