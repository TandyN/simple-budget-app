# T10 — Installable offline PWA & free deployment 🎯 MVP

**Depends on:** T09 — **Milestone:** MVP — after this the owner installs the app and starts using it.

## Goal

The app installs to the iPhone Home Screen, opens full-screen, works with no network, asks before updating, protects
its storage, and deploys automatically (only when every test passes) to a free static host.

## Read first

`docs/install-on-iphone.md`, `docs/architecture.md` §6, vite-plugin-pwa docs, GitHub Pages "deploy with Actions" docs.

## Scope

**In:** vite-plugin-pwa (`registerType: 'prompt'`), manifest + icons, update toast, offline precache, `src/pwa/`
(registration, standalone detection, install guide, `storage.persist()`), Settings → Data storage status,
`.github/workflows/deploy.yml`, Vite `base` for `/simple-budget/`, owner-facing install checklist.
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

