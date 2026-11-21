# Glossary

The index of the codebase. Every key term gets a one-line definition and a link
to where it is documented. **Start here when you don't know where something
lives.**

Keep each entry to one line + link. If a term needs more than that, it belongs
in its own topic doc, not here.

## Orchestration (the multi-agent system that builds this repo)

- **orchestrator** — the pure relay that is the only role that can spawn
  subagents; `mode: primary` (the active agent, not a spawnable subagent).
  [orchestration.md](orchestration.md)
- **`/orchestrator` command** — the opencode command (`/orchestrator <prompt>`)
  that deterministically activates the orchestrator relay; replaces the retired
  `Orchestrator,` text prefix. [orchestration.md](orchestration.md#activation)
- **subagent roster** — the eight `mode: subagent` roles the orchestrator can
  spawn (product-manager, project-manager, solutions-architect, software-engineer,
  senior-software-engineer, staff-software-engineer, qa, docs-agent).
  [orchestration.md](orchestration.md#subagent-roster)
- **stale agent snapshot** — a partial/stale roster a running opencode server
  shows after agent files change, because agents load once at startup; fixed by
  restarting the server. [orchestration.md](orchestration.md#subagent-roster)
- **config-reload skill** — after a change to startup-loaded config
  (`.opencode/agents`, `.opencode/command`, `.agents/skills`), prompt the user to
  restart opencode; the change is inert until restart.
  [orchestration.md](orchestration.md#subagent-roster)
- **conventional-commits skill** — the role-agnostic commit format
  `<type>(<scope>): <summary> (#<ticket>) (agent-generated)` every agent follows
  when authoring a commit; agent commits carry the `(agent-generated)` marker and a
  ticket reference. [orchestration.md](orchestration.md#role-agnostic-skills)
- **story** — the top-level unit of work (a tracking ticket that may be code,
  research, or requirements — not necessarily a feature); has `Original Prompt` /
  `Summary` / `Task` sections. [orchestration.md](orchestration.md#story)
- **spike ticket** — a research ticket; done by the solutions-architect before
  the tasks it unblocks. [orchestration.md](orchestration.md#ticket-types)
- **task ticket** — an implementation ticket; one job for one software-engineer,
  ends in a PR. [orchestration.md](orchestration.md#ticket-types)
- **feature branch** — one per story; all task PRs merge into it. [orchestration.md](orchestration.md#branches-and-merge-ownership)
- **feature PR** — feature branch → `main`; the only thing that touches
  production. [orchestration.md](orchestration.md#branches-and-merge-ownership)
- **blocker** — a ticket another ticket waits on; a ticket is ready only when
  all its blockers are `Done`. [orchestration.md](orchestration.md#ticket-types)
- **milestone** — the user-maintained open GitHub milestone every story and
  sub-ticket is assigned to at creation; sub-issues do NOT inherit the parent's
  milestone, so it is set explicitly per ticket. [orchestration.md](orchestration.md#milestones)
- **roles** — product-manager, project-manager, solutions-architect,
  software-engineer, senior-software-engineer, staff-software-engineer, qa,
  docs-agent. [orchestration.md](orchestration.md#roles)
- **signed comment** — every agent finding/verdict, signed `(role-agent):`.
  [board.md](board.md#signed-work-products)
- **body attribution** — the `(role-agent):` signature on the *body* of an issue
  or PR an agent creates. [board.md](board.md#signed-work-products)
- **summary/verdict comment** — the signed comment every agent leaves as its last
  action on the artifact it worked on. [board.md](board.md#signed-work-products)
- **ticket title prefix** — `Story:` / `Spike:` / `Task:` / `Bug:` prefix on every
  ticket title. [board.md](board.md#ticket-title-prefix)
- **done-gate** — a sub-issue or blocker is `Done` when its board `Status` is
  `Done` **AND** its GitHub issue is `CLOSED`, OR it is closed with the `wontfix`
  label; a ticket is in the ready set only when all its blockers satisfy it.
  [orchestration.md](orchestration.md#ticket-types)
- **verification gates** — the orchestrator's mandatory check that the expected
  signed summary/verdict comment exists on an artifact before proceeding to the
  next step. [orchestration.md](orchestration.md#verification-gates)

## Board (GitHub Projects workflow)

- **board** — the GitHub Projects board that is the single source of truth for
  ticket state. [board.md](board.md)
- **Status** — Todo / In Progress / Review / Done / Back Log.
  [board.md](board.md)
- **role field** — which agent owns a ticket. [board.md](board.md)
- **Back Log** — a `Status` option for unrelated, non-blocking bugs; independent
  (not a sub-issue), done-equivalent, and deduped-first. [board.md](board.md#back-log)
- **`wontfix`** — a GitHub **label** (not a status) marking a terminal, closed
  "we will not do this" decision; the flow is label + signed reason comment +
  close. Distinct from `Back Log` (open, parked, done-equivalent) and `Done`
  (completed), and excluded from the story's done-gate. [board.md](board.md#wontfix)
- **non-blocking finding** — a reviewer's incidental, non-blocking issue; on
  **both** the APPROVED and REJECTED verdicts it MUST get a stated disposition
  (`→ Back Log` or `→ in-story task`) in the signed verdict so it is never lost.
  [board.md](board.md#back-log)
- **`Bug:` ticket** — a `Bug:`-titled ticket for an in-scope / blocking bug found
  during review, linked as a sub-issue of the story. [board.md](board.md#ticket-title-prefix)
- **`backlog` skill** — the shared, role-agnostic dedupe-first flow to file or
  comment on a Back Log entry.
  [board.md](board.md#back-log)
- **board ↔ repo link** — `gh project link` connects a Projects board to the
  repository; board creation is create + link. [board.md](board.md#key-concepts)

## The budget app (the product being built)

- **budget-app** — the application itself: its backend, frontend, and data
  model. [budget-app.md](budget-app.md)
- **app plan** — the navigable, pre-implementation design-of-record for the
  whole app under `project-plan/` (data model, storage, recurring engine,
  activity model, frontend / UI surface, portability, dependency strategy,
  testing, and MVP build order). [budget-app.md](budget-app.md#the-app-plan)
- **MVP build order (5-phase PWA + Phase 6 native/store)** — the iterative
  implementation sequence (Phase 1: Toolchain/CSP/CI → Phase 2: Pure `src/core/` →
  Phase 3: IndexedDB Storage & `BudgetApi` → Phases 4A–4D: Walking Skeleton +
  `gh-pages` Deploy / Budget Tab / Insights & Settings Tabs / Offline PWA SW, each
  with co-shipped Playwright E2E → Phase 5: Release Hardening, SemVer Tagging &
  Rollback/Roll-Forward Verification → Phase 6: Native Shell Packaging & Phased
  Store Releases) guaranteeing all 5 core engineering pillars from commit #1.
  [project-plan/build-order.md](../project-plan/build-order.md)
- **Content Security Policy (CSP — `connect-src 'none'`)** — the strict W3C CSP3
  `<meta http-equiv="Content-Security-Policy">` tag in `index.html` (`default-src 'self'`,
  `connect-src 'none'`, `require-trusted-types-for 'script'`,
  `trusted-types sw-register`, omitting `frame-ancestors`) paired with
  `<meta name="referrer" content="no-referrer">`, a `top !== self` frame-buster
  in `src/main.ts`, a Vite-generated `sw.js` same-origin guard, and a strict DOM
  XSS ban (no `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write`
  / `document.writeln` / `eval` / `new Function`).
  [project-plan/frontend.md](../project-plan/frontend.md#1-strict-content-security-policy-indexhtml)
- **Trusted Types** — defense-in-depth CSP directives
  (`require-trusted-types-for 'script'; trusted-types sw-register`) in
  `index.html` enforcing at the browser engine level that no unsafe DOM
  injection sink can receive raw strings, while allowlisting a single
  `createScriptURL`-only `sw-register` policy for `navigator.serviceWorker.register`
  (layering on top of the CI-enforced DOM XSS ban).
  [project-plan/frontend.md](../project-plan/frontend.md#1-strict-content-security-policy-indexhtml)
- **origin isolation** — deriving IndexedDB (`DB_NAME`), CacheStorage, and
  `BroadcastChannel` names from `import.meta.env.BASE_URL`
  (`simple-budget-app` / `simple-budget-sync` vs.
  `simple-budget-app-pr-<N>` / `simple-budget-sync-pr-<N>`) so PR previews on
  the shared `tandyn.github.io` origin never collide with or upgrade production
  storage, caches, or tabs (OQ-1; custom domain optional for full origin isolation).
  [project-plan/frontend.md](../project-plan/frontend.md#4-shared-origin-isolation-on-github-pages-oq-1-adopted-default)
- **Data Not Collected (App Store & Play Store privacy)** — the verified store
  privacy qualification ("Data Not Collected" in Apple App Store Connect and
  "No data shared / No data collected" in Google Play Console) achieved via
  100% on-device storage (IndexedDB for the MVP PWA + OQ-4 durable native store
  for store releases), zero analytics/telemetry SDKs, zero remote
  assets, and automated Playwright E2E zero-egress verification.
  [project-plan/portability.md](../project-plan/portability.md#app-store--play-store-privacy-compliance-data-not-collected)
- **`PrivacyInfo.xcprivacy` (iOS privacy manifest)** — the Apple iOS privacy
  manifest (`native/ios/App/App/PrivacyInfo.xcprivacy`) declaring `NSPrivacyTracking: false`,
  empty `NSPrivacyCollectedDataTypes`, and every Required-Reason API used by Capacitor
  core and installed native plugins (verified via Xcode's "Generate Privacy Report",
  starting from `NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`, preventing
  App Store Connect error `ITMS-91053`).
  [project-plan/portability.md](../project-plan/portability.md#2-ios-required-reason-api-privacy-manifest-nativeiosappappprivacyinfoxcprivacy)
- **`PlatformServices`** — the tiny runtime interface (`saveBackup`, `shareBackup`,
  `isNative`) resolved via `window.Capacitor` feature detection so the zero-prod-dep
  web bundle (`dist/`) stays identical and never imports `@capacitor/*`, while native
  shell wrappers live in the isolated `native/` workspace package.
  [project-plan/portability.md](../project-plan/portability.md#package-boundary--platformservices-seam)
- **`BudgetBackup` (atomic JSON export/import & validation)** — the versioned
  (`schemaVersion: 1`) JSON backup envelope validated by `validateBackupPayload`
  (10 MB byte ceiling, `__proto__` / `constructor` / `prototype` key rejection,
  full entity invariant checks) and restored atomically via a single IndexedDB
  `readwrite` transaction (`replaceAll`) that rolls back on any failure.
  [project-plan/data-model.md](../project-plan/data-model.md#versioned-budgetbackup-schema--hardened-import-validation)
- **encrypted backup envelope** — the Phase 6 store-release passphrase-encrypted
  backup format (`{ schemaVersion, enc: { alg: "AES-256-GCM", kdf: "PBKDF2-HMAC-SHA256", 600_000 <= iter <= 5_000_000, salt, iv }, ciphertext }`)
  built on WebCrypto so exported financial history is never left in plaintext in
  iCloud/Drive.
  [project-plan/data-model.md](../project-plan/data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)
- **tombstone** — reserved optional `deletedAt?: string` (ISO-8601 UTC) and
  `deviceId?: string` fields on `RecurringRule` and `Activity` (unused in MVP,
  which hard-deletes) so a future E2EE sync layer can propagate deletions and
  resolve conflicts without a v1 schema migration.
  [project-plan/data-model.md](../project-plan/data-model.md#post-mvp-extensibility--growth-seams)
- **IndexedDB schema versioning (`DB_VERSION = 1`)** — the deterministic
  `onupgradeneeded(event)` sequential migration switch on base-path-derived
  `DB_NAME` (`simple-budget-app` / `simple-budget-app-pr-<N>`)
  provisioning the `"meta"`, `"rules"`, and `"activities"` stores and secondary
  indexes (`by_dateTime`, `by_type`, `by_tags`, `by_rule_period`; active vs.
  paused rules are filtered in memory since booleans are invalid IndexedDB keys).
  [project-plan/storage.md](../project-plan/storage.md#indexeddb-schema-versioning-indexes--migration-strategy)
- **storage durability (`navigator.storage.persist()` / `persisted()`)** —
  first-action best-effort `navigator.storage?.persist?.()` (not cold `init()`),
  live `navigator.storage?.persisted?.()` status + `lastBackupAt` N-day backup
  nag in Settings, pre-import confirmation + safety snapshot before `replaceAll`,
  and a mandatory durable native store release gate (SQLite `StorageAdapter` or
  mirrored auto-snapshot to app Documents) before store submission.
  [project-plan/storage.md](../project-plan/storage.md#storage-durability--webkit-eviction-mitigation)
- **short-month `Date.UTC` clamping** — clamping `rule.schedule.dayOfMonth`
  (`1..31`) to `daysInMonth` (`new Date(Date.UTC(y, m, 0)).getUTCDate()`) in
  `missingPeriods` and `dueDateTime` (anchored at fixed noon UTC `12:00:00Z`,
  OQ-2) so rules due on days 29–31 never overflow short months into the next
  month.
  [project-plan/recurring-engine.md](../project-plan/recurring-engine.md#short-month-dateutc-clamping)
- **`BroadcastChannel` (multi-tab sync)** — the base-path-scoped channel
  (`"simple-budget-sync"` on production, `"simple-budget-sync-pr-<N>"` on PR
  previews, derived from `import.meta.env.BASE_URL`) that broadcasts
  `"budget-mutated"` events on state-mutating `BudgetApi` calls so sibling PWA
  tabs re-query and update without reload (without cross-triggering between
  production and preview tabs).
  [project-plan/frontend.md](../project-plan/frontend.md#2-multi-tab-state-synchronization-broadcastchannel)
- **post-MVP extensibility seams** — the non-breaking v2+ growth seams layered
  over `DB_VERSION = 1` and `RecurringRule`/`Activity` (category envelopes
  `BudgetTarget`, multi-period `summarizeByPeriod`, flexible cadences, split
  transactions, multi-account transfers, first-class CSV/OFX/QFX file import via
  `importBatchId`, encrypted backup envelope, E2EE sync tombstones, opt-in bank
  sync that re-opens Pillar 2, and multi-currency).
  [project-plan/data-model.md](../project-plan/data-model.md#post-mvp-extensibility--growth-seams)
- **RecurringRule** — the user-editable "what repeats"; separate from the
  activities it generates. [project-plan/data-model.md](../project-plan/data-model.md)
- **Activity** — one unified, always-editable record (manual or auto-posted);
  the single source of truth for Available Funds.
  [project-plan/activity-model.md](../project-plan/activity-model.md)
- **recurring engine** — idempotent, period-based auto-poster; rule edits affect
  future periods only. [project-plan/recurring-engine.md](../project-plan/recurring-engine.md)
- **Available Funds** — derived (income − expense) from the activity log, never
  stored. [project-plan/activity-model.md](../project-plan/activity-model.md#available-funds--derived-from-the-activity-log)
- **storage adapter** — the thin `open/save/delete/query/replaceAll/getMeta/setMeta`
  seam over IndexedDB; the only platform surface the backend depends on.
  [project-plan/storage.md](../project-plan/storage.md)
- **portability** — backend as a framework-agnostic TS library shared by the PWA,
  the iOS (Capacitor / WebKit), and the Android (Capacitor / Chromium) shells;
  one bundle, three webview targets.
  [project-plan/portability.md](../project-plan/portability.md)
- **Capacitor** — the native-shell framework that wraps the same TS bundle into
  the iOS (WKWebView) and Android (System WebView / Chromium) apps.
  [project-plan/portability.md](../project-plan/portability.md)
- **dependency strategy** — the hard constraint of zero production dependencies
  in the root web bundle (runtime uses only Web-platform APIs; native shell deps
  isolated in `native/` for Phase 6) plus a curated set of well-maintained dev
  dependencies; **pnpm is the package manager (provisioned via `packageManager`
  + `pnpm/action-setup` without assuming local `corepack`)**, paired with
  `.nvmrc`, `pnpm-workspace.yaml` (`saveExact: true`, `allowBuilds: {}`, `minimumReleaseAge: 4320`),
  full-SHA-pinned CI actions, and Dependabot.
  [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md)
- **SHA pinning** — pinning every `uses:` GitHub Action in `.github/workflows/`
  to its full 40-character commit SHA with a `# vX.Y.Z` version comment (never a
  mutable tag) and enabling the repository setting "Require actions to be pinned
  to a full-length commit SHA".
  [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md#guardrails-enforce-in-ci--review)
- **Dependabot** — `.github/dependabot.yml` configured for both `github-actions`
  (keeping SHA-pinned workflow actions fresh) and `npm` (keeping exact-pinned
  `devDependencies` current).
  [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md#guardrails-enforce-in-ci--review)
- **zero-prod-deps** — `package.json` `dependencies` is empty; at runtime the app
  uses only IndexedDB, WebCrypto, `Date`/`Intl`, and pure TS logic.
  [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md)
- **testing strategy** — the 3-layer test pyramid (Vitest unit/integration with `>= 95%` `src/core/` coverage, Playwright 3-viewport Chromium + WebKit E2E + zero-egress gate, QA headless live spec check) and GitHub Actions CI gates, conditional on code infrastructure existing. [project-plan/testing.md](../project-plan/testing.md)
- **integer-cent money** — amounts stored as canonical integer `amountCents` (minor units), integer arithmetic throughout, decimal-unit conversion only at the display boundary. [project-plan/data-model.md](../project-plan/data-model.md#derived-values-never-stored)
- **input guard (upper bound)** — runtime validation on decimal-unit input: `decimal > 0`, a whole cent after rounding, **and** `decimal <= Number.MAX_SAFE_INTEGER / 100` so the derived `amountCents` never overflows a 64-bit integer (closes the unbounded gap where `Number.isInteger(1e23)` is `true`). [project-plan/data-model.md](../project-plan/data-model.md#2-activity--a-concrete-independent-always-editable-record)
- **ActivityFilter** — the optional filter for `listActivities()`; **aliased to `ActivitySearchFilter`** (same `since` / `until` / `tag` / `type` predicates), so the two are the same shape; the full `searchActivities` surface is the dedicated insights/search entry point. [project-plan/portability.md](../project-plan/portability.md#the-public-api-what-the-front-end-calls)
- **offline / installable (PWA-scoped)** — a **PWA (built-in-browser) capability only**: service worker + manifest deliver offline caching and add-to-home-screen in the PWA and the Android (Chromium) browser; on **iOS (Capacitor / WKWebView) the SW is limited / not available**, so it is not a guarantee there. [project-plan/frontend.md](../project-plan/frontend.md)
- **insights / search surface** — `searchActivities(filter)` (period + tag + type) and `summarizeByTag(activities)` (roll-up), pure and derived from the activity log, so 5-year tag analysis needs no stored aggregate. [project-plan/activity-model.md](../project-plan/activity-model.md#insights--search)
- **bank-sync / file-import seams** — reserved optional fields (`importBatchId`,
  `source: "bank-sync"`, `externalTxnId`, `sourceAccountId`) supporting
  privacy-preserving CSV/OFX/QFX file import first; aggregator bank sync
  (Plaid/GoCardless/MX) requires a server-held secret or vendor SDK and
  explicitly re-opens Pillar 2 ("Data Not Collected"), while SimpleFIN Bridge is
  a user-token opt-in seam with a narrow `connect-src` and documented label
  change. [project-plan/data-model.md](../project-plan/data-model.md#privacy-label-impact-and-sync-tradeoffs)
- **BudgetApi** — the backend's single public API surface (`createBudgetApi(...)`); the only thing a frontend shell imports/calls (rules, activities, the insights/search surface, the recurring-engine run, derived Available Funds, and `exportBackup`/`importBackup`/`getLastBackupAt`). [project-plan/portability.md](../project-plan/portability.md#the-public-api-what-the-front-end-calls)
- **frontend / PWA plan** — the UI surface, a first-class designed area of the plan: zero-prod-dep static bundle, iPhone-Duo foldable viewport (folded/unfolded), configurable base path, rendering all ten requirements over the shared `BudgetApi`. [project-plan/frontend.md](../project-plan/frontend.md)
- **zero-prod-dep frontend** — the frontend is a zero-prod-dep shell (`dependencies: {}`): plain TS/HTML against the `BudgetApi` + built-in Web-platform APIs, no framework runtime dep in production; the build output is a single static web bundle with an empty `dependencies`. [project-plan/frontend.md](../project-plan/frontend.md#zero-production-dependencies-req-1)
- **cross-platform static bundle** — the build output is one static web bundle (`vite build` → `dist/`) with an empty root `dependencies` and zero `@capacitor/*` imports; the **identical artifact** is served on all phones (PWA now, iOS/Android Capacitor shells in `native/` via `PlatformServices` later). [project-plan/portability.md](../project-plan/portability.md#what-this-buys)
- **iPhone-Duo foldable** — the **primary** viewport target: a foldable phone with two states — **folded** (slab-like, baseline 1-page, the mobile baseline) and **unfolded** (dual-panel, enhanced 1-page); **supersedes** the "iPhone class" (SE → 16 Pro Max) verification set. [project-plan/frontend.md](../project-plan/frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2)
- **responsive viewport (folded/unfolded)** — the state-aware layout model built on **logical units + safe-area insets**, not fixed pixel widths; breakpoint is **folded → unfolded** (NOT mobile → tablet → desktop); **slab phones (≈ folded) are the secondary target**. [project-plan/frontend.md](../project-plan/frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2)
- **safe-area inset** — `env(safe-area-inset-*)` used in padding/margin/position so content is never obscured by the notch, Dynamic Island, home indicator, or status bar; the iPhone-Duo layout relies on it rather than hard-pixel viewports. [project-plan/frontend.md](../project-plan/frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2)
- **base path (configurable)** — the Vite `base` / `VITE_BASE_PATH` build-time input (read from `import.meta.env.BASE_URL` at runtime) that rewrites asset URLs; production = `/simple-budget-app/`, PR preview = `/simple-budget-app/pr-<PR#>/`; an explicit, non-hardcoded build decision. [project-plan/frontend.md](../project-plan/frontend.md#base-path-configurable-explicit-build-decision)
- **gh-pages preview (mode a)** — the mode-(a) same-site sub-path PR-preview architecture (`tandyn.github.io/simple-budget-app/pr-<PR#>/`) published via plain `git` to the `gh-pages` branch using `GITHUB_TOKEN` (no third-party Pages action; OQ-5, flagged to the user for confirmation), serialized via `concurrency: { group: "pages-deploy", cancel-in-progress: false }`, guaranteeing **production root untouched** on PR deploys and **PR sub-path pruned on merge/close**. [project-plan/testing.md](../project-plan/testing.md#ci-workflow-mechanics-gh-pages-branch-publishing--prune-on-merge--production-unchanged)
- **well-maintained criterion** — the governing rule for **any** dev dependency (local package *or* CI action): must be **Active & current**, **First-party / tool-maintainer**, and **Industry-standard** in its category; the curated dev-dep set (pnpm, Vite, Vitest, `@vitest/coverage-v8`, Playwright, `@axe-core/playwright`, `fake-indexeddb`, Biome, tsc) and the SHA-pinned CI actions all pass it. [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency)
- **credential-gated build** — the Android/iOS native build jobs are **skip-not-fail** gated at job level by `if: ${{ vars.NATIVE_BUILDS_ENABLED == 'true' }}` with signing secrets mapped to step-level `env:` (disabled/absent → **skipped, not failed**); the always-run Web/PWA build is **not** credential-gated. Build-only, no store upload. [project-plan/testing.md](../project-plan/testing.md#android--ios-test-build-pipeline-credential-skip-build-only)
- **release automation (`.github/workflows/release.yml`)** — manual SemVer in root `package.json` + annotated `vX.Y.Z` git tags on `main` triggering `.github/workflows/release.yml` (SHA-pinned first-party actions, zero extra third-party release bots) to verify CI, attach an immutable `dist/` archive + SHA-256 checksum, and publish a Conventional Commits GitHub Release. [project-plan/testing.md](../project-plan/testing.md#release-versioning--rollback--roll-forward-pipeline)
- **Roll-Forward** — the mandatory forward-only recovery strategy when binary or schema downgrade is impossible (post-`DB_VERSION`-bump IndexedDB migrations at `N + 1`, Emergency No-Op/Kill-Switch `sw.js` recovery, and Phase 6 iOS/Android monotonic hotfix releases after pausing/halting a rollout); same-schema PWA releases (`DB_VERSION` unchanged) may roll back via `workflow_dispatch` tag re-deploy. [project-plan/testing.md](../project-plan/testing.md#release-versioning--rollback--roll-forward-pipeline)
- **Phased Release / Staged Rollout** — gradual production mobile release ramps (**Apple 7-day Phased Release** `1% → 100%` with Pause + Expedited Review; **Google Play Staged Rollout** with Halt Rollout) paired with monotonic build numbers (`CFBundleVersion` / `versionCode`) and zero-SDK OS-level crash/vitals monitoring. [project-plan/portability.md](../project-plan/portability.md#native-versioning-phasedstaged-rollouts--roll-forward-hotfix-strategy)
- **`updateViaCache`** — Service Worker registration option set to `{ updateViaCache: "none" }` so the browser always revalidates `sw.js` directly against the network, bypassing GitHub Pages' default 10-minute `Cache-Control` window for immediate update and rollback detection. [project-plan/frontend.md](../project-plan/frontend.md#service-worker-design-pwa-offline-scoping--update-lifecycle)
- **`VersionError`** — W3C IndexedDB error thrown when `indexedDB.open(name, version)` requests a lower `DB_VERSION` than the on-disk database; handled defensively with a non-destructive "Update required" banner (calling `indexedDB.deleteDatabase()` is strictly forbidden) and avoided via expand-and-contract roll-forward migrations (`DB_VERSION = N + 1`). [project-plan/storage.md](../project-plan/storage.md#indexeddb-schema-rollback-safety-versionerror--expand-and-contract)
- **`assertNotFramed`** — dependency-injected `top !== self` clickjacking frame-buster guard exported by `src/main.ts` (clears `documentElement` via `replaceChildren()` and throws `"Framing is not permitted"` when framed; unit-tested in `src/main.test.ts`). [budget-app.md](budget-app.md#key-decisions)
- **`verify:gates` (`scripts/verify-build-gates.mjs`)** — zero-dependency Node ESM post-build security & privacy gate script (unit-tested in `scripts/verify-build-gates.test.mjs`) enforcing empty `dependencies`/`optionalDependencies` + exact `devDependencies` + zero `@capacitor/*` in `src/`, strict CSP + Trusted Types + `no-referrer` (and no `frame-ancestors`) in `dist/index.html` with linear comment stripping (`stripHtmlComments`) and fail-closed HTML5 comment-end checks, zero external `http(s)://` URLs in `dist/` (outside W3C XML namespaces), and zero banned DOM XSS / eval sinks in non-test `src/` files. [budget-app/testing.md](budget-app/testing.md#phase-1-toolchain-conventions)
- **split `tsconfig` (`tsconfig.json` / `tsconfig.node.json`)** — strict browser/app TypeScript config (`types: ["vite/client"]`, `include: ["src"]`, `skipLibCheck: false`) paired with `tsconfig.node.json` (`types: ["node"]`, isolating `@types/node` to Vite/Vitest/Playwright configs and `e2e/`). [budget-app/testing.md](budget-app/testing.md#phase-1-toolchain-conventions)
- **post-merge repo hardening** — the three `gh api` commands (`vulnerability-alerts`, `actions/permissions` `sha_pinning_required=true`, and `branches/main/protection` requiring the `ci` check with `enforce_admins: true`) run by `staff-software-engineer` immediately upon merging Story #216 to `main`. [budget-app/testing.md](budget-app/testing.md#post-merge-repository-hardening-commands)
- **`validateBackupPayload` (`src/core/validate.ts`)** — hardened JSON backup validator enforcing the 10 MB pre-parse byte cap (`MAX_BACKUP_BYTES`), `__proto__`/`constructor`/`prototype` key rejection (`assertNoPrototypePollution`), `<= 100_000` per-array cap (`MAX_BACKUP_ARRAY_LENGTH`), duplicate ID rejection, and single-currency consistency. [budget-app/backend.md](budget-app/backend.md#2-runtime--backup-validation-srccorevalidatets)
- **`toCents` / `fromCents` / `validateAmountCents` (`src/core/validate.ts`)** — integer-cent money boundary conversions and positive safe-integer validator enforcing `decimal <= Number.MAX_SAFE_INTEGER / 100` and rejecting sub-cent fractions. [budget-app/backend.md](budget-app/backend.md#2-runtime--backup-validation-srccorevalidatets)
- **`runRecurringEngine` (`src/core/engine.ts`)** — the pure idempotent monthly recurring auto-poster (materializes at most one `Activity` per `(rule.id, period)` via the `alreadyPosted` guard, advances `rule.lastPostPeriod` only when a period posted, never mutates caller input) plus the `parseYM`/`periodOfDate`/`periodBefore`/`missingPeriods`/`dueDateTime` period & due-instant helpers (short-month `Date.UTC` clamping + fixed `12:00:00Z` due instant, OQ-2). [budget-app/backend.md](budget-app/backend.md#3-monthly-recurring-engine-srccoreenginets)
- **`computeAvailableFunds` (`src/core/funds.ts`)** — pure integer-cent Available Funds derivation (`income + deposit − expense`), soft-deletion-aware, returns `0` for empty and a negative balance when expenses exceed income + deposits. [budget-app/backend.md](budget-app/backend.md#4-derived-available-funds-srccorefundsts)
- **`searchActivities` (`src/core/insights.ts`)** — intersecting (logical-AND) `since`/`until`/`tag`/`type` filter over the activity log (`since` inclusive, `until` exclusive, omitted predicates unbounded so `{}` returns all). [budget-app/backend.md](budget-app/backend.md#5-insights--search-tag--period-rollups-srccoreinsightsts)
- **`summarizeByTag` (`src/core/insights.ts`)** — per-tag `totalInCents`/`totalOutCents` integer-cent rollup (multi-tag contributes to each tag, untagged creates no bucket, `localeCompare` sorted). [budget-app/backend.md](budget-app/backend.md#5-insights--search-tag--period-rollups-srccoreinsightsts)
- **period attribution (OQ-2, `activityPeriod` / `summarizeByPeriod` in `src/core/insights.ts`)** — buckets recurring activities by `Activity.period` (not `dateTime`) and non-recurring by the UTC month of `dateTime`, so timezone offsets / timestamp edits never misattribute a 1st-of-month recurring item to an adjacent month. [budget-app/backend.md](budget-app/backend.md#5-insights--search-tag--period-rollups-srccoreinsightsts)

> As backend / frontend / data topics land, add their terms here and split the
> area doc into `budget-app/<area>.md` when it grows.
