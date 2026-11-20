# Frontend / PWA

**Decision (story #115):** the frontend is a **first-class, designed area of the
plan** — not a separate app build and not "out of scope." It is a **zero-prod-dep
shell** (Web-platform APIs + the backend library only) that renders **all ten
requirements**, delivered **PWA-first** (GitHub Pages) now and **iOS (primary,
iPhone) + Android** later via the existing portability model.

This is the **design-of-record for the UI surface**. It is a *plan* doc — it
describes **what the frontend must render and how it uses the backend** — not an
implementation spec with code. It deliberately **inherits** two hard constraints
defined elsewhere and **links** them rather than re-stating their rationale:

- **Zero production dependencies** — `package.json` `dependencies` is empty. See
  [dependency-strategy.md](dependency-strategy.md).
- **Portability boundary + public API** — the frontend is one of three UI shells
  (PWA / iOS / Android) that all import and call the *same* backend library. See
  [portability.md](portability.md).

Everything the frontend *computes or stores* lives in the backend library
([data-model.md](data-model.md), [activity-model.md](activity-model.md),
[recurring-engine.md](recurring-engine.md), [storage.md](storage.md)). The
frontend's job is to **collect input, render derived values, and call the
`BudgetApi` surface** ([portability.md → the public API](portability.md#the-public-api-what-the-front-end-calls)).

## How this maps to the requirements

| # | Requirement | Frontend answer | Section |
|---|-------------|-----------------|---------|
| 1 | Zero production dependencies | zero-prod-dep shell; `dependencies: {}` | [Zero production dependencies](#zero-production-dependencies-req-1) |
| 2 | Deployable on PWA / iOS / Android | PWA first-class; iOS (primary) + Android via portability model | [Platforms](#platforms-req-2) |
| 3 | Local-only storage / backup | manual JSON export/import; no server | [Export / backup](#export--backup-req-3) |
| 4 | Fast 5-year tag analysis / insights | tag-based search + rollup rendered from the backend surface | [Search / insights](#search--insights-reqs-4--9) |
| 5 | Recurring income/expense (default 1st, configurable) | "set recurring" form; day configurable | [Recurring income/expense](#recurring-income--expense-req-5) |
| 6 | Add expenses and deposits | entry form (manual income / expense / deposit) | [Add an expense / deposit / income](#add-an-expense--deposit--income-req-6) |
| 7 | UTC-stored, local-timezone display | render `dateTime` (stored UTC) in the user's local TZ | [Time display](#time--timezone-display-req-7) |
| 8 | Modify any transaction, tags, backdate | edit form for every field; add/remove tags | [Edit / backdate / tags](#edit--backdate--tags-req-8) |
| 9 | Search / filter by period + tag | search UI over period + tag + type | [Search / insights](#search--insights-reqs-4--9) |
| 10 | Store cents as integer | UI renders integer `amountCents` as decimal only at the display boundary | [Money](#money-integer-cents--req-10) |

## Platforms (req 2)

The frontend is **portable by construction**: it is the *UI shell* side of the
boundary in [portability.md](portability.md), which is the source of truth for the
three targets and the shared `BudgetApi` contract. This doc does **not** duplicate
that model — it only states what the frontend is for each target:

- **PWA (now, primary shipping target)** — the same bundle hosted on **GitHub
  Pages** (HTTPS, a secure context). This is the first thing that ships.
- **iOS (later, primary native target — iPhone)** — the PWA bundle wrapped in a
  **Capacitor** shell running in **WKWebView / WebKit**.
- **Android (later)** — the *same* bundle wrapped in a **Capacitor** shell
  running in the **Android System WebView (Chromium)**.

**One codebase, three webview targets, no fork.** Because all three targets
implement the same Web platform APIs (IndexedDB, WebCrypto, `Date`/`Intl`,
`crypto.randomUUID`), the frontend is written once against those built-ins and the
shared `BudgetApi`, and the only difference between targets is the native shell.
See [portability.md → the boundary](portability.md#the-boundary),
[portability.md → android-specific considerations](portability.md#android-specific-considerations),
and [dependency-strategy.md](dependency-strategy.md) for why this is possible with
zero production dependencies.

### Base path (configurable, explicit build decision)

The frontend is a **PWA hosted under a sub-path** (a project site), so its asset
URLs are rewritten against a **base path** at build time — not a hardcoded
constant. This is an **explicit, configurable build decision**:

- **Mechanism:** the base path is the **Vite `base`** option, set from the
  **`VITE_BASE_PATH`** env var at build time (read in `vite.config.ts`). Vite
  rewrites JS `import` URLs, CSS `url()`, and the HTML asset references to
  respect it. At runtime, the app reads **`import.meta.env.BASE_URL`** (a
  build-time static replacement) for any dynamic asset URL or service-worker
  scope.
- **Production:** `VITE_BASE_PATH=/simple-budget-app/` → the app is served at
  `https://tandyn.github.io/simple-budget-app/`.
- **PR preview:** `VITE_BASE_PATH=/simple-budget-app/pr-<PR#>/` (PR number from
  `github.event.pull_request.number` on `pull_request` targeting `main`) → the
  preview is served at
  `https://tandyn.github.io/simple-budget-app/pr-<PR#>/`, a sub-path of the
  same production site. The per-PR preview deploy flow (plain `git` publishing
  to `pr-<PR#>/` on the `gh-pages` branch via `GITHUB_TOKEN`, production root
  untouched, `git rm -rf pr-<PR#>/` on close) lives in
  [testing.md → CI deploy & preview](testing.md#ci-deploy--preview-github-pages).
- **Asset-path correctness (holds for both paths):** because the base is threaded
  through at build, every consumer resolves under **either** `/simple-budget-app/`
  **or** `/simple-budget-app/pr-<PR#>/`:
  - **JS** `import` URLs — rewritten by Vite to the base.
  - **CSS** `url()` references — rewritten by Vite to the base.
  - **Manifest** — `public/manifest.webmanifest` uses manifest-relative
    `"start_url": "./"`, `"scope": "./"`, and relative icon `src` paths, which
    resolve against the manifest file's own URL under any deployed base path
    (`/simple-budget-app/` or `/simple-budget-app/pr-<PR#>/`) without requiring
    Vite `BASE_URL` substitution.
  - **Service-worker scope** — `sw.js` is emitted at build time by a custom
    in-repo Vite plugin (not stored as a static file in `public/`) and registered
    in web/PWA contexts only (never in Capacitor native shells) via a minimal
    feature-detected Trusted Types `createScriptURL`-only policy (`sw-register`,
    allowing only `import.meta.env.BASE_URL + "sw.js"`, falling back to the plain
    string where `window.trustedTypes` is absent):
    `navigator.serviceWorker.register(swScriptUrl, { scope: import.meta.env.BASE_URL, updateViaCache: "none" })`,
    so the SW control scope matches the deployed path, bypasses GitHub Pages'
    default 10-minute `Cache-Control` header for immediate update/rollback
    detection, and remains compliant with `require-trusted-types-for 'script'`.
    The production SW explicitly bypasses `pr-*` sub-paths (see
    [Service Worker Design](#service-worker-design-pwa-offline-scoping--update-lifecycle)).
  - **Storage, cache & channel namespacing** — IndexedDB database names
    (`simple-budget-app` vs `simple-budget-app-pr-<N>`), CacheStorage names
    (`sbapp-<buildhash>` vs `sbapp-pr-<N>-<buildhash>`), and `BroadcastChannel`
    names are derived from `import.meta.env.BASE_URL` so PR previews never share
    or upgrade the production database or cache (see
    [Shared-Origin Isolation on GitHub Pages](#4-shared-origin-isolation-on-github-pages-oq-1-adopted-default)).
  - **Index HTML** — `<script src>` / `<link href>` rewritten by Vite to the base.

### Service Worker Design (PWA Offline, Scoping & Update Lifecycle)

Offline caching on the PWA target is delivered by a minimal, zero-dependency
service worker generated at build time:

1. **Emitted by a custom in-repo Vite plugin (no `public/` static SW, no
   `vite-plugin-pwa` / Workbox):**
   - A static file in `public/` is copied verbatim by Vite without substituting
     `import.meta.env.BASE_URL` or generating a precache manifest of content-hashed
     chunks.
   - Instead, a custom in-repo Vite plugin (~40 lines in `vite.config.ts` or
     `scripts/`) emits `dist/sw.js` during `vite build` with the resolved
     `VITE_BASE_PATH`, a deterministic `<buildhash>`, and the complete precache
     asset manifest (`index.html`, hashed JS/CSS chunks, icons, manifest).
   - **Do NOT use `vite-plugin-pwa` or Workbox:** Workbox bundles third-party
     runtime code into production, violating the zero-production-dependency
     invariant (`dependencies: {}`).
2. **Production SW bypasses `pr-*` paths:**
   - Because the production SW scope (`/simple-budget-app/`) is a URL prefix of
     every PR preview (`/simple-budget-app/pr-<N>/`), a naive navigation fallback
     would intercept preview requests and serve the cached production
     `index.html`.
   - The production SW MUST explicitly **bypass / exclude `pr-*` paths**: on
     every `fetch` event, if running at the production root and
     `new URL(event.request.url).pathname.startsWith(BASE_URL + "pr-")`, return
     immediately without calling `event.respondWith(...)` so preview navigations
     and assets are not intercepted.
3. **Cache versioning, cleanup, user-accepted `skipWaiting`, and fetch strategy:**
   - **Versioned cache name:** `sbapp-<buildhash>` for production and
     `sbapp-pr-<N>-<buildhash>` for PR previews (derived from the base path +
     build hash so preview and production caches never collide).
   - **Delete old caches on `activate`:** On `activate`, delete obsolete caches
     using an explicit non-overlapping predicate so production never deletes
     sibling PR preview caches (which also begin with `sbapp-`):
     - Production deletes keys matching
       `key.startsWith("sbapp-") && !key.startsWith("sbapp-pr-") && key !== ACTIVE_CACHE`.
     - PR preview `<N>` deletes keys matching
       `key.startsWith("sbapp-pr-<N>-") && key !== ACTIVE_CACHE`.
   - **User-accepted `skipWaiting`:** Do **not** call `self.skipWaiting()`
     silently during `install` — swapping the controller mid-edit risks
     inconsistent UI or schema state. When a new SW enters the `waiting` state,
     the UI displays an accessible **"Update available"** banner; only after the
     user accepts does the page post `{ type: "SKIP_WAITING" }` to the waiting
     worker, which then calls `self.skipWaiting()` and triggers a clean reload
     on `controllerchange`.
   - **Fetch strategy:** **Network-first for navigations**
     (`event.request.mode === "navigate"`) with cached app-shell fallback when
     offline; cache-first for content-hashed static assets.
4. **Do not register in Capacitor native shells:**
   - Registration is gated at runtime so the SW is **only** registered in
     web/PWA browser contexts (e.g.
     `"serviceWorker" in navigator && !("Capacitor" in window)`), **never** in
     iOS or Android Capacitor native shells where bundled assets are already
     local and WKWebView SW support is limited/unavailable.
5. **SW CSP limitation & same-origin guard (compensating control):**
   - A document-level `<meta http-equiv="Content-Security-Policy">` tag does
     **not** govern `ServiceWorkerGlobalScope`; applying CSP to a service worker
     script requires HTTP response headers, which GitHub Pages cannot set.
   - Therefore, the strict same-origin guard on every `fetch` event inside
     `sw.js` (`new URL(event.request.url).origin === self.location.origin`,
     rejecting any cross-origin request immediately) is the **compensating
     control** enforcing zero egress inside the worker scope.
6. **SW update detection (`updateViaCache: "none"`), tag-rollback swap & Emergency No-Op / Kill-Switch SW Roll-Forward:**
   - **Mandatory `{ updateViaCache: "none" }` on registration:** Registration
     MUST pass `{ scope: import.meta.env.BASE_URL, updateViaCache: "none" }` to
     `navigator.serviceWorker.register(...)`. GitHub Pages serves static assets
     with a default 10-minute `Cache-Control: max-age=600` header; setting
     `updateViaCache: "none"` forces the browser to bypass the HTTP cache when
     checking `sw.js` for updates so production releases and rollbacks are
     detected immediately on the next navigation.
   - **Automatic byte-different `sw.js` swap on same-schema tag rollback:**
     Because the custom Vite plugin embeds `<buildhash>` (and the precache
     manifest) directly inside `dist/sw.js`, re-deploying a last known-good
     SemVer tag (`vX.Y.Z`) to `gh-pages` via `workflow_dispatch` (see
     [testing.md → Release, Versioning & Rollback / Roll-Forward Pipeline](testing.md#release-versioning--rollback--roll-forward-pipeline))
     produces a `sw.js` that is byte-different from the faulty release. With
     `updateViaCache: "none"`, browsers immediately detect the rolled-back
     `sw.js` as a new worker; once activated, it populates `sbapp-<goodhash>`
     and prunes the faulty `sbapp-<badhash>` cache while leaving sibling
     `sbapp-pr-*` preview caches untouched.
   - **Emergency No-Op / Kill-Switch SW Roll-Forward (broken-SW recovery):** If a
     defective `sw.js` ever ships that breaks `fetch` handling or blocks normal
     update flows, **roll forward** a minimal **Emergency No-Op / Kill-Switch**
     `sw.js` at the exact same URL (`import.meta.env.BASE_URL + "sw.js"`):
     - In `install`: call `self.skipWaiting()` immediately so the kill-switch
       takes control without waiting for user banner interaction.
     - In `activate`: delete all production `sbapp-*` caches **excluding**
       `sbapp-pr-*` (`key.startsWith("sbapp-") && !key.startsWith("sbapp-pr-")`),
       unregister itself (`await self.registration.unregister()`), and reload
       controlled window clients (`clients.matchAll({ type: "window" })`) so
       browsers return cleanly to network-served assets.
   - **`Clear-Site-Data` is explicitly forbidden:** Never attempt broken-SW
     recovery via the `Clear-Site-Data` HTTP header — GitHub Pages does not
     support custom response headers, and `Clear-Site-Data: "storage"` would
     permanently wipe users' local-first IndexedDB financial data.

## Zero production dependencies (req 1)

**The frontend is a zero-prod-dep shell.** `package.json` `dependencies` **MUST
stay empty** — there is **no React/Vue/Svelte/any framework runtime dependency in
production**. The UI is satisfiable with `dependencies: {}` because every concern
the frontend needs is covered by a **built-in Web-platform API** that exists in
**all three targets**, plus the **backend library** (which is itself
zero-prod-dep):

| Frontend concern | Built-in API (all 3 targets) |
|------------------|------------------------------|
| Rendering / DOM | the platform DOM (`document`, `Element`, native `<dialog>`) — no framework required |
| State & multi-tab sync | plain TypeScript state + event handlers + **`BroadcastChannel`** (no state library) |
| Date / time formatting (req 7) | **`Intl.DateTimeFormat`** / **`Intl.NumberFormat`** |
| Money formatting (req 10) | **`Intl.NumberFormat`** (decimal-unit display of integer `amountCents`) |
| Persistence | **IndexedDB** (via the backend `StorageAdapter` — the UI never touches it directly) |
| Local backup (req 3) | **File System Access API** / download + file-input for JSON export/import (`budget.exportBackup()` / `budget.importBackup(json)`) |
| Offline / installable (**PWA target only**) | standard **PWA** primitives (service worker + manifest) — see note below |
| IDs, crypto (if ever surfaced) | **`crypto.randomUUID()`**, **WebCrypto** |

> **Offline / installable is a PWA (built-in-browser) capability, scoped to the
> PWA target (GitHub Pages — desktop + Android Chrome).** The service worker +
> manifest deliver offline caching and "add to home screen" in the **built-in
> browser**. On the **iOS (Capacitor / WKWebView) target the service worker is
> limited / not available** (WKWebView does not fully support the SW lifecycle),
> so offline caching and install-to-home-screen are **not PWA features there** —
> the iOS shell relies on the Capacitor wrapper (and, where needed, native
> offline affordances) rather than the SW. Do not treat the offline/installable
> row as an iOS-Capacitor guarantee; it applies to the PWA and the Android
> (Chromium) built-in browser.

The **only** runtime code in the bundle is the frontend's own TypeScript and the
shared backend library — **no third-party production package.** Build/test/lint
tooling (Vite, Vitest, Biome, tsc, Playwright) lives in `devDependencies` and is
**not** a production dependency (see
[dependency-strategy.md → dev dependencies](dependency-strategy.md#dev-dependencies-the-allowed-set)).

**The build output is a static web bundle; the identical artifact is served on all three targets.** `vite build` emits `dist/` (an `index.html`, hashed JS/CSS chunks, and any public assets) with no server-side rendering and no Node runtime. The **identical `dist/`** is served by GitHub Pages (production + per-PR preview), by the iOS Capacitor shell in **WKWebView (iOS Safari — the primary native target)**, and by the Android Capacitor shell in **Chromium (Android Chrome)**. There is **no per-platform bundle and no per-platform build flag**: the root web package keeps `dependencies: {}` with zero `@capacitor/*` imports in `src/`, while native packaging and plugins live in the isolated `native/` workspace package and are reached from the web bundle solely via runtime `window.Capacitor` feature detection in `PlatformServices` (plus the SW registration guard above and `StorageAdapter` for the durable native store); see [portability.md → what this buys](portability.md#what-this-buys) and [portability.md → Package boundary & `PlatformServices` seam](portability.md#package-boundary--platformservices-seam).

> **Guardrail (inherited):** a PR that introduces a production dependency —
> including a frontend framework runtime dep — requires an explicit justification
> and senior-software-engineer sign-off (see
> [dependency-strategy.md → guardrails](dependency-strategy.md#guardrails-enforce-in-ci--review)).

This is why the "no React/Vue in production" reading of the user's "shouldn't need
any additional packages in production" ask is coherent: the UI is plain TS/HTML
rendering against the `BudgetApi` surface, and `dependencies` stays empty.

## Responsive viewport — iPhone-Duo foldable dual-state (req 2)

**The primary viewport target for the entire app is the iPhone-Duo** — a new
**foldable** phone with two states. This is the **baseline** the responsive
architecture is built around, and it **supersedes** the earlier "iPhone class"
(SE → 16 Pro Max) verification set (that set is no longer the primary target — see
[testing.md](testing.md) for the Playwright viewport config). The model has
**exactly two states**, not a mobile → tablet → desktop ladder:

- **Folded (slab) — the baseline 1-page experience.** Slab-like, ~6" single
  panel. **Every** tab (Settings, Insights, Budget) is handleable in **one page**
  with **no scrolling beyond the panel**: add a deposit/expense/income, view
  Available Funds, check recent transaction history, and switch tabs all fit on
  the single panel. This state is **complete and usable — not a degraded version**
  of the app.
- **Unfolded (dual-panel) — the enhanced 1-page view.** ~12" two-panel spread.
  Everything still fits on one screen, **and** the layout **adapts to take
  advantage of the extra space**: side-by-side panes, larger data density, and a
  **split-pane for Budget vs. transaction history**. It is **enhanced, not a
  different app** — the same tabs, the same data, more room.

**Breakpoint model:** **folded → unfolded**, NOT "mobile → tablet → desktop".
Slab phones (iPhone SE / 12 / 14 / 15 / 16 Pro Max, and equivalent Android slabs)
map to the **folded** breakpoint — the folded state **IS** the mobile baseline, so
"most phones" (slab) get exactly the folded experience.

**Layout strategy — state-aware, not just wider.** The unfolded state is a
**fundamentally different layout** that uses the dual-panel space (side-by-side
views, larger data density, split-pane), not the folded layout with more columns
or a stretched fold. The fold↔unfold **transition is smooth and intuitive** — an
adaptation, not a jarring reflow.

**Design principle (load-bearing):** **folded is complete and usable** (never a
degraded/mobile-only cut); **unfolded is enhanced** (never a different app); the
**fold↔unfold transition is smooth**; the layout is **state-aware** (unfolded takes
advantage of the dual-panel space, it does not merely stretch the folded layout).

**No hard-pixel viewports — the architecture is logical-unit + safe-area based.**
The layout is a fluid flexbox / grid that adapts to **any** width; verification is
against the two iPhone-Duo states (below), never against a fixed pixel width:

- **CSS logical units:** `rem` for font sizes and spacing (root-em tied to the
  user's root font size).
- **Viewport-relative heights:** `svh` / `100svh` for full-height layouts
  (avoids the mobile-Safari URL-bar chrome issue that breaks `100vh`); use
  `dvh` / `100dvh` as the fallback for browsers without `svh`.
- **Safe-area insets (notch / Dynamic Island / home indicator / status bar):**
  `env(safe-area-inset-top)` / `-bottom` / `-left` / `-right` in `padding` /
  `margin` / `position`, so content is never obscured by the notch, the Dynamic
  Island, the home indicator, or the Android status bar (MDN "env() CSS
  function").

**Verification targets (Playwright E2E + `qa` live-test):**

| State | Representative viewport (CSS px) | Notes |
|-------|----------------------------------|-------|
| **iPhone-Duo folded (primary)** | ~375 × ~667 @ DPR 3 | slab-like single panel; the **mobile baseline**; one page, no scroll |
| **iPhone-Duo unfolded (primary)** | ~829 × ~1194 @ DPR 3 | dual-panel spread; **enhanced** one-screen view (side-by-side / split-pane) |
| **Typical slab phone (secondary)** | ~390 × ~844 @ DPR 3 | ≈ the folded state; a representative slab (e.g. iPhone 15 class) |

The **folded and unfolded states are the primary targets**; the folded state
*is* the mobile baseline, and **typical slab phones (≈ folded)** are the
secondary target — so the "most phones" requirement is satisfied by the folded
state, and the architecture extends to the unfolded state without per-device code.

## Add an expense / deposit / income (req 6)

An **entry form** that creates a manual `Activity` via `budget.addActivity(...)`:

- **Type:** `income` | `expense` | `deposit` — `deposit` is a **first-class**
  manual type (see
  [portability.md → resolved MVP default B](portability.md#resolved-mvp-defaults)).
  Recurring rules are `income | expense` only; `deposit` is entered here as a
  manual transaction.
- **Amount:** a decimal-unit input (`$1,234.56`) that the boundary converts to the
  canonical integer `amountCents` (see [Money](#money-integer-cents--req-10)).
- **Date/time:** optional; defaults to "now" (see [Time display](#time--timezone-display-req-7)).
- **Tags / category:** free-form tag input (see [Edit / backdate / tags](#edit--backdate--tags-req-8)).
- **Currency:** ISO-4217, default USD.
- **Provenance:** `source: "manual"` is set by the API; the form never edits it.

On submit the form calls `budget.addActivity(NewActivity)` and the returned
`Activity` is what the UI displays.

## Recurring income / expense (req 5)

A **"set recurring" form** that creates/edits a `RecurringRule` via
`budget.addRule(...)` / `budget.editRule(...)`:

- **Type:** `income` | `expense` (never `deposit`).
- **Amount:** decimal-unit input → integer `amountCents`.
- **Schedule:** MVP is **monthly, day 1** (`cadence: "monthly", dayOfMonth: 1`).
  The **day is configurable** in the form; bi-weekly / weekly / custom cadences are
  **reserved** in the `Schedule` shape but **out of MVP scope** (see
  [data-model.md → the two core entities](data-model.md#the-two-core-entities)).
- **Active / pause:** a toggle (`active: boolean`); pausing never deletes posted
  history.

The form renders the rule's **origin**, not its postings: editing a rule changes
only *future* periods, and already-posted activities remain independent, editable
records. How the engine auto-posts due periods is the backend's concern — see
[recurring-engine.md](recurring-engine.md). The frontend triggers posting by
calling `budget.runRecurringEngine()` (idempotent) on app start / focus.

## Edit / backdate / tags (req 8)

**Every `Activity` is editable** — manual *and* recurring-posted — through one
identical edit form. The form exposes exactly the user-editable fields and nothing
else (the `RulePatch`/`ActivityPatch` types enforce this, so the UI *cannot* set
provenance):

| Field | Editable | Notes |
|-------|----------|-------|
| `type` | yes | e.g. reclassify an auto-posted expense as `deposit` |
| `amountCents` | yes | decimal-unit input → integer cents |
| `dateTime` | yes | **backdate** or forward-date (see [Time display](#time--timezone-display-req-7)) |
| `tags` | yes | **add / remove any** free-form tags / categories |
| `memo` | yes | free text |
| `source`, `sourceRuleId`, `period`, `importBatchId`, `externalTxnId`, `sourceAccountId`, `createdAt`, `updatedAt`, `deletedAt`, `deviceId` | **no** | provenance, import/sync seams, + system fields, not user-set |

- **Tags / categories** are free-form strings on every activity (no schema in the
  MVP); a shared tag list / autocomplete is a future enhancement. See
  [activity-model.md → tagging](activity-model.md#tagging).
- **Backdating** is a normal edit: setting `dateTime` to an earlier date is fully
  supported, and Available Funds re-derives automatically.
- Saving is a single `budget.editActivity(id, ActivityPatch)` upsert. See
  [activity-model.md → editing any activity](activity-model.md#editing-any-activity).

## Search / insights (reqs 4 & 9)

The frontend renders the **backend's insights/search surface** — it does not
compute or store any aggregate. It calls `budget.searchActivities(filter)` to
filter and `budget.summarizeByTag(activities)` to roll up, both pure and derived
from the activity log (integer cents, plain data). The contract lives in
[activity-model.md → insights / search](activity-model.md#insights--search) and the
`BudgetApi` in [portability.md → the public API](portability.md#the-public-api-what-the-front-end-calls).

The UI offers **search / filter** over the **period + tag + type** predicates
(intersecting; omit a predicate to leave it unbounded):

- **Period (req 9):** a date-range picker mapped to `since` / `until` (ISO-8601
  bounds on the stored UTC `dateTime`) — e.g. "all of 2026", "Q3 2026", a rolling
  5-year window.
- **Tag (reqs 4, 9):** a tag selector (the user's own tags) mapped to `tag`.
- **Type (req 4):** `income` | `expense` | `deposit` (e.g. "where did my **spend**
  go by tag").

**Insight** = `await budget.summarizeByTag(await budget.searchActivities({ since, until, tag, type }))`,
rendered as a per-tag breakdown of **money in** vs. **money out** over the chosen
period (e.g. *housing expense in Q3 2026*). Because both operations are pure and
derived from the log, a **5-year history** is just a wider range — the frontend
scales with it without any stored aggregate or analytics engine.

## Time / timezone display (req 7)

**Storage is UTC; display is local.** This is the display-layer half of the rule
that the backend stores ISO-8601 UTC (`Activity.dateTime`, the engine's
`dueDateTime`).

- The frontend **never** mutates the stored UTC instant.
- It **renders** `dateTime` in the **user's local timezone** using
  `Intl.DateTimeFormat` (and `Intl.NumberFormat` for money), which respects the
  runtime's locale/timezone.
- The **backdate / date picker** produces a UTC instant for the user's chosen local
  date/time and passes it through to the API; the round-trip keeps storage UTC and
  display local.
- Recurring postings show the **due date** (e.g. the 1st) in the local timezone,
  matching the "the transaction happened on the 1st" semantics.

> The backend anchors each recurring due date at fixed **noon UTC (`12:00:00Z`, OQ-2)**
> on the clamped `dayOfMonth`, which renders on the intended local calendar day for
> UTC−12 through UTC+11 (UTC+12..+14 is the accepted MVP residual). Recurring period
> rollups use `Activity.period` rather than `dateTime`, while the frontend renders
> whatever UTC instant the log holds in the user's local timezone. See
> [recurring-engine.md → notes](recurring-engine.md#notes-and-resolved-defaults).

## Money (integer cents — req 10)

The frontend works in **decimal units at the boundary** and **integer cents in the
backend**:

- **Input:** the amount field accepts a human decimal unit (`$40.00`) and is
  converted to the canonical **integer `amountCents`** (minor units) at the
  boundary before calling the API.
- **Output:** integer `amountCents` is rendered as a decimal via
  `Intl.NumberFormat` (currency) at the display boundary.
- **Never** does the UI perform money arithmetic or store a decimal. Available
  Funds, tag rollups, and the engine all operate on integer `amountCents` in the
  backend — see [data-model.md → derived values](data-model.md#derived-values-never-stored)
  and [activity-model.md → available funds](activity-model.md#available-funds--derived-from-the-activity-log).

## Export / backup (req 3)

The frontend offers **manual JSON export / import** — a local backup with **no
server**, wired directly to the `BudgetApi` backup methods:

- **Export (`budget.exportBackup()` + `PlatformServices`):** calls
  `await budget.exportBackup()` to produce a versioned `BudgetBackup` envelope
  (`{ schemaVersion: 1, exportedAt, rules, activities }`, see
  [data-model.md → Versioned `BudgetBackup` Schema & Hardened Import Validation](data-model.md#versioned-budgetbackup-schema--hardened-import-validation))
  and records `lastBackupAt` in `"meta"`. Because iOS `WKWebView` does not honour
  `<a download>`, the UI delegates file delivery through the runtime
  `PlatformServices` seam (`saveBackup` / `shareBackup`, see
  [portability.md → Package boundary & `PlatformServices` seam](portability.md#package-boundary--platformservices-seam)):
  in web/PWA browsers it uses `<a download>` (or the **File System Access API** /
  `navigator.share`) so the user can save locally (e.g. to Files / iCloud Drive /
  Google Drive) or copy off-device; in Phase 6 Capacitor native shells it
  delegates to the native bridge exposed on `window.Capacitor.Plugins` without
  importing `@capacitor/*` in `src/`.
- **Import (`budget.importBackup(json)`) & pre-import safety flow:** before
  reading or calling `budget.importBackup(json)`, the Settings UI MUST enforce
  the pre-import safety flow (see
  [storage.md → Atomic Backup Restoration (`replaceAll`)](storage.md#atomic-backup-restoration-replaceall)):
  1. Check `file.size <= 10 * 1024 * 1024` (10 MB) **before** reading the file
     into memory.
  2. Present an explicit confirmation dialog warning that importing replaces all
     existing local rules and activities.
  3. Automatically trigger a **pre-import safety snapshot** (`budget.exportBackup()`
     via `PlatformServices.saveBackup`) before executing `replaceAll`.
  Once confirmed, the UI reads the `.json` file as text and passes the raw string
  to `await budget.importBackup(json)`. The backend validates the untrusted
  payload via `validateBackupPayload(rawJson)` in `src/core/validate.ts`
  (enforcing the 10 MB size ceiling, `__proto__` / `constructor` / `prototype`
  prototype-pollution rejection, and full schema / safe-integer-cent / ISO-UTC /
  single-currency invariants; see
  [data-model.md](data-model.md#hardened-import-validation-validatebackuppayloadrawjson-string-budgetbackup))
  and restores all records atomically in a single IndexedDB `readwrite`
  transaction via `storage.replaceAll({ rules, activities })` (rolling back
  automatically on any error so existing data is never clobbered).
- **Durability status (`persisted()`) & `lastBackupAt` N-day backup nag:**
  Settings queries `await navigator.storage?.persisted?.()` to display the live
  storage persistence status alongside the `lastBackupAt` timestamp and shows a
  non-blocking N-day backup reminder (default `N = 30` days, or once user data
  exists with no backup) prompting a one-tap JSON backup export (see
  [storage.md → Storage Durability & WebKit Eviction Mitigation](storage.md#storage-durability--webkit-eviction-mitigation)).
- **No account, no network, no server** — backup is the user's file, consistent
  with the local-only, zero-egress storage model. See
  [storage.md → security properties](storage.md#security-properties).

This satisfies "download it as a PWA / keep my data" with **manual** backup;
automatic cloud sync (iCloud Drive / a server) is **out of MVP scope**.

## Security & Privacy Guardrails

Because the frontend is a zero-framework vanilla TypeScript application handling
personal financial records across the PWA, iOS `WKWebView`, and Android
`Chromium` WebView, four hard security and privacy guardrails are enforced from
commit #1:

### 1. Strict Content Security Policy (`index.html`)

Every build (`index.html` → `dist/index.html`) MUST include the following strict
Content Security Policy and Referrer Policy `<meta>` tags in `<head>`:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'self'; manifest-src 'self'; require-trusted-types-for 'script'; trusted-types sw-register">
<meta name="referrer" content="no-referrer">
```

- **Trusted Types (`require-trusted-types-for 'script'; trusted-types sw-register`) —
  defense-in-depth:** `require-trusted-types-for 'script'` is valid inside
  `<meta>` CSP and acts as browser-enforced defense-in-depth on top of our DOM
  XSS ban (below) (supported in Chromium, with Safari/Firefox support landing
  2025–2026). Because `ServiceWorkerContainer.register(scriptURL)` is a
  `TrustedScriptURL` injection sink under Trusted Types, the CSP allowlists
  exactly one minimal policy (`trusted-types sw-register`):
  - The `sw-register` policy defines **only** `createScriptURL` (no `createHTML`
    and no `createScript` methods), and accepts **only** the exact URL
    `import.meta.env.BASE_URL + "sw.js"` (throwing on any other input).
  - Registration feature-detects `window.trustedTypes?.createPolicy` and falls
    back to the plain string URL in browsers where Trusted Types is unavailable:
    ```ts
    const expectedSwUrl = `${import.meta.env.BASE_URL}sw.js`;
    const swPolicy = window.trustedTypes?.createPolicy("sw-register", {
      createScriptURL(url) {
        if (url !== expectedSwUrl) throw new TypeError("Disallowed SW URL");
        return url;
      },
    });
    const swScriptUrl = swPolicy ? swPolicy.createScriptURL(expectedSwUrl) : expectedSwUrl;
    navigator.serviceWorker.register(swScriptUrl as string, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: "none",
    });
    ```
  - Because `sw-register` exposes no `createHTML` or `createScript` methods and
    no other policy is permitted, every HTML/script sink (`innerHTML`,
    `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`) remains blocked
    at the browser engine level.
- **Referrer Policy (`no-referrer`):** `<meta name="referrer" content="no-referrer">`
  prevents leaking deployment paths (including `pr-<N>/` preview URLs) or origin
  information in `Referer` headers on any navigation.
- **Why `frame-ancestors` is omitted from `<meta>` + clickjacking frame-buster
  (accepted residual risk):** Per W3C Content Security Policy Level 3 §6.2
  (`meta` element delivery), browsers ignore `frame-ancestors` inside
  `<meta http-equiv="Content-Security-Policy">` and emit a console warning; and
  GitHub Pages does not support custom HTTP response headers (`X-Frame-Options`
  or HTTP `frame-ancestors 'none'`). Omitting `frame-ancestors` from `<meta>`
  keeps `<meta>` standards-compliant and preserves our zero-console-warning
  Playwright E2E gate (see [testing.md](testing.md)). As a compensating
  clickjacking mitigation, `src/main.ts` includes a minimal 3-line
  **`top !== self` frame-buster** at bootstrap:
  ```ts
  if (window.top !== window.self) {
    document.documentElement.replaceChildren();
    throw new Error("Framing is not permitted");
  }
  ```
  **Accepted residual risk:** a malicious framing page using `<iframe sandbox>`
  without `allow-top-navigation` can prevent top-level breakout, though refusing
  to mount or render budget data neutralizes UI redressing. Hosting on a custom
  reverse proxy that sends HTTP `Content-Security-Policy: frame-ancestors 'none'`
  or using the native Capacitor shells eliminates this residual risk completely.
- **Document & Service Worker zero-egress enforcement:** `connect-src 'none'` and
  `form-action 'none'` block all document-context network egress (`fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, and form
  submissions) at the browser engine level. Because `<meta>` CSP does not govern
  `ServiceWorkerGlobalScope` (and GitHub Pages cannot set HTTP headers on
  `sw.js`), the plugin-emitted service worker enforces a strict same-origin guard
  on every `fetch` event
  (`new URL(event.request.url).origin === self.location.origin`, rejecting any
  cross-origin request immediately) as the compensating control (see
  [Service Worker Design](#service-worker-design-pwa-offline-scoping--update-lifecycle)).
- **Why Subresource Integrity (SRI) is not needed:** Every runtime asset is
  same-origin and self-hosted with Vite content-hashed filenames under
  `default-src 'self'` CSP; SRI only protects third-party-hosted subresources,
  which are banned by the zero-prod-dep and zero-external-URL rules (see
  [testing.md → Explicitly Skipped](testing.md#explicitly-skipped--deferred-testing--verification-techniques)).

### 2. DOM XSS Ban (Safe DOM APIs Only)

Because there is no virtual-DOM framework auto-escaping templates at runtime,
unsafe HTML-parsing DOM sinks and dynamic code evaluation are **strictly
prohibited** anywhere in `src/`:

- **Banned APIs:** `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `document.write`, `document.writeln`, `eval`, and `new Function`.
- **Mandatory safe DOM APIs:** Every view and component MUST construct and update
  DOM nodes exclusively via `document.createElement(...)`,
  `node.textContent = ...`, `element.setAttribute(...)`, and
  `element.replaceChildren(...)`. All user-controlled strings (`RecurringRule.name`,
  `Activity.tags`, `Activity.memo`, `currency`, and any fields originating from imported JSON
  backups) are assigned via `textContent` so arbitrary HTML/script payloads (e.g.
  `<img src=x onerror=alert(1)>`) are rendered strictly as inert literal text.

### 3. Zero Remote Fonts, CDNs, or Icon Requests

To guarantee zero network egress (`connect-src 'none'`), 100% offline capability,
and App Store / Play Store "Data Not Collected" privacy compliance (no IP/UA
leakage to third-party font or asset servers; see
[portability.md](portability.md)):

- **System UI typography:** All text uses the native platform system UI font stack
  (`font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
  and tabular numerals (`font-variant-numeric: tabular-nums`) so currency columns
  and cent amounts align cleanly without downloading web fonts.
- **Self-hosted / inline visuals only:** All icons and graphics use inline SVGs
  created via `document.createElementNS("http://www.w3.org/2000/svg", ...)` or
  local static assets bundled inside `public/` / `dist/`. Zero external
  stylesheets, scripts, fonts, or images (`https://...`) are ever referenced.

### 4. Shared-Origin Isolation on GitHub Pages (OQ-1 Adopted Default)

On GitHub Pages project sites, production (`https://tandyn.github.io/simple-budget-app/`),
every PR preview (`https://tandyn.github.io/simple-budget-app/pr-<N>/`), and any
other GitHub Pages repository published under `tandyn.github.io` share the **same
browser origin** (`https://tandyn.github.io`). IndexedDB, CacheStorage, and
`BroadcastChannel` are scoped **per origin, not per path** — neither CSP nor a
service worker can isolate same-origin storage. Without namespacing, a PR preview
that bumps `DB_VERSION` would upgrade the production IndexedDB database in the
developer's browser, or overwrite production records.

- **Adopted default (OQ-1) — base-path namespacing:** Derive IndexedDB database
  names (`simple-budget-app` for `/simple-budget-app/` vs
  `simple-budget-app-pr-<N>` for `/simple-budget-app/pr-<N>/`), CacheStorage
  names (`sbapp-<buildhash>` vs `sbapp-pr-<N>-<buildhash>`), and
  `BroadcastChannel` names (`simple-budget-sync` vs
  `simple-budget-sync-pr-<N>`) from `import.meta.env.BASE_URL` so PR previews
  never share or mutate production storage or caches (see
  [storage.md → IndexedDB Schema Versioning, Indexes & Migration Strategy](storage.md#indexeddb-schema-versioning-indexes--migration-strategy)).
- **Documented residual risk:** Base-path namespacing eliminates accidental
  cross-contamination between production and `pr-<N>/` previews, but does **not**
  prevent an XSS-compromised sibling GitHub Pages repository hosted under
  `https://tandyn.github.io` from reading same-origin IndexedDB.
- **Recommended-optional upgrade (custom domain):** Hosting the production PWA
  on a **dedicated custom domain** provides true browser origin isolation; this
  is **recommended-optional, not required** for MVP. Native iOS and Android
  Capacitor store builds are unaffected because each native app runs inside its
  own isolated WebView origin and OS sandbox.

## Accessibility (WCAG 2.2 AA) & Multi-Tab State Synchronization

### 1. Semantic HTML & WCAG 2.2 AA Accessibility

The UI is built on native semantic HTML elements and WAI-ARIA landmarks so
keyboard navigation, iOS VoiceOver, Android TalkBack, and desktop screen readers
work out of the box across both folded and unfolded viewports:

- **Native `<dialog>` modals:** Edit forms and confirmation prompts use the
  built-in `<dialog>` element (`dialog.showModal()` / `dialog.close()`),
  providing native focus trapping, backdrop Inert handling, and `Escape`-key
  dismissal without third-party modal libraries.
- **ARIA tab navigation:** The 3-tab navigation bar (`Budget`, `Insights`,
  `Settings`) uses `<nav role="tablist">` containing
  `<button role="tab" aria-selected="true|false" aria-controls="panel-...">`
  buttons paired with `<section role="tabpanel" id="panel-..." aria-labelledby="tab-...">`
  landmarks.
- **Polite live-region updates:** The **Available Funds** hero banner carries
  `aria-live="polite"` and `aria-atomic="true"` so assistive technologies
  announce updated balances automatically after adding, editing, or deleting an
  activity or running the recurring engine.
- **Accessible forms & error messaging:** Every form control (`amount`, `type`,
  `dateTime`, `tags`, `memo`, `dayOfMonth`, backup file input) has a programmatic
  `<label for="...">` association. Validation errors set
  `aria-invalid="true"` and link the inline error message via
  `aria-describedby="..."`.
- **Contrast & touch targets:** Color tokens maintain `>= 4.5:1` contrast ratio
  for normal text (`>= 3:1` for large text and UI components), and all interactive
  controls (tabs, buttons, checkboxes, edit/delete actions) enforce a minimum
  **`44×44 CSS px`** hit target (`min-height: 2.75rem; min-width: 2.75rem`).

### 2. Multi-Tab State Synchronization (`BroadcastChannel`)

When a user has the PWA open in multiple browser tabs or windows on the same
origin, mutations in one tab must immediately reflect in sibling tabs without
requiring a manual page reload:

- **Channel name:** derived from `import.meta.env.BASE_URL` —
  `"simple-budget-sync"` on production (`/simple-budget-app/`) and
  `"simple-budget-sync-pr-<N>"` on PR previews (`/simple-budget-app/pr-<N>/`) —
  opened via `new BroadcastChannel(channelName)` (feature-detected via
  `typeof BroadcastChannel !== "undefined"` so environments without it degrade
  gracefully) so preview tabs never trigger refreshes in production tabs.
- **Publish on commit:** Whenever a local state-mutating `BudgetApi` call commits
  (`addRule`, `editRule`, `setRuleActive`, `deleteRule`, `addActivity`,
  `editActivity`, `deleteActivity`, `runRecurringEngine`, or `importBackup`),
  the active tab posts `{ type: "budget-mutated", timestamp: Date.now() }` on
  the base-path-scoped channel.
- **Subscribe & re-render:** Sibling tabs listening on the base-path-scoped
  channel respond to `"budget-mutated"` messages by re-querying `BudgetApi` (`listRules`,
  `listActivities`, `getAvailableFunds`, and active `searchActivities` /
  `summarizeByTag` views) and updating the DOM via safe `replaceChildren` /
  `textContent` patches—eliminating stale cross-tab state.

## What the frontend is NOT

To keep the boundary sharp (see [portability.md → the boundary](portability.md#the-boundary)):

- **Not** a place where business logic lives — the recurring engine, Available
  Funds, validation, and search/rollup are all in the backend library.
- **Not** a place where data is stored — persistence is the backend's
  `StorageAdapter` (IndexedDB); the UI only reads derived values and collects
  input.
- **Not** a production-framework dependency — `dependencies` stays empty (req 1).
- **Not** a per-platform fork — PWA, iOS, and Android share the same frontend
  bundle; only the Capacitor shell differs (req 2).
