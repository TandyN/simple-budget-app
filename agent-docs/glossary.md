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
  testing). [budget-app.md](budget-app.md#the-app-plan)
- **RecurringRule** — the user-editable "what repeats"; separate from the
  activities it generates. [project-plan/data-model.md](../project-plan/data-model.md)
- **Activity** — one unified, always-editable record (manual or auto-posted);
  the single source of truth for Available Funds.
  [project-plan/activity-model.md](../project-plan/activity-model.md)
- **recurring engine** — idempotent, period-based auto-poster; rule edits affect
  future periods only. [project-plan/recurring-engine.md](../project-plan/recurring-engine.md)
- **Available Funds** — derived (income − expense) from the activity log, never
  stored. [project-plan/activity-model.md](../project-plan/activity-model.md#available-funds--derived-from-the-activity-log)
- **storage adapter** — the thin `open/save/delete/query` seam over IndexedDB;
  the only platform surface the backend depends on.
  [project-plan/storage.md](../project-plan/storage.md)
- **portability** — backend as a framework-agnostic TS library shared by the PWA,
  the iOS (Capacitor / WebKit), and the Android (Capacitor / Chromium) shells;
  one bundle, three webview targets.
  [project-plan/portability.md](../project-plan/portability.md)
- **Capacitor** — the native-shell framework that wraps the same TS bundle into
  the iOS (WKWebView) and Android (System WebView / Chromium) apps.
  [project-plan/portability.md](../project-plan/portability.md)
- **dependency strategy** — the hard constraint of zero production dependencies
  (runtime uses only Web-platform APIs) plus a curated set of well-maintained
  dev dependencies; **pnpm is the package manager (provisioned via the
  `packageManager` field / corepack, not a `devDependency`)**.
  [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md)
- **zero-prod-deps** — `package.json` `dependencies` is empty; at runtime the app
  uses only IndexedDB, WebCrypto, `fetch`, `Date`/`Intl`, and pure TS logic.
  [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md)
- **testing strategy** — the 3-layer test pyramid (Vitest unit/integration, Playwright E2E/regression, QA headless live spec check) and GitHub Actions CI gates, conditional on code infrastructure existing. [project-plan/testing.md](../project-plan/testing.md)
- **integer-cent money** — amounts stored as canonical integer `amountCents` (minor units), integer arithmetic throughout, decimal-unit conversion only at the display boundary. [project-plan/data-model.md](../project-plan/data-model.md#derived-values-never-stored)
- **input guard (upper bound)** — runtime validation on decimal-unit input: `decimal > 0`, a whole cent after rounding, **and** `decimal <= Number.MAX_SAFE_INTEGER / 100` so the derived `amountCents` never overflows a 64-bit integer (closes the unbounded gap where `Number.isInteger(1e23)` is `true`). [project-plan/data-model.md](../project-plan/data-model.md#2-activity--a-concrete-independent-always-editable-record)
- **ActivityFilter** — the optional filter for `listActivities()`; **aliased to `ActivitySearchFilter`** (same `since` / `until` / `tag` / `type` predicates), so the two are the same shape; the full `searchActivities` surface is the dedicated insights/search entry point. [project-plan/portability.md](../project-plan/portability.md#the-public-api-what-the-front-end-calls)
- **offline / installable (PWA-scoped)** — a **PWA (built-in-browser) capability only**: service worker + manifest deliver offline caching and add-to-home-screen in the PWA and the Android (Chromium) browser; on **iOS (Capacitor / WKWebView) the SW is limited / not available**, so it is not a guarantee there. [project-plan/frontend.md](../project-plan/frontend.md)
- **insights / search surface** — `searchActivities(filter)` (period + tag + type) and `summarizeByTag(activities)` (roll-up), pure and derived from the activity log, so 5-year tag analysis needs no stored aggregate. [project-plan/activity-model.md](../project-plan/activity-model.md#insights--search)
- **bank-OAuth slots** — reserved (not implemented) fields for future bank-sync: `ActivitySource: "bank-sync"`, `externalTxnId`, `sourceAccountId`; the data model must not foreclose it. **Feasibility is affirmed**: bank-OAuth account-linking is an explicit go for a later platform-layer project (RFC 8252 loopback pattern), needing no data-model change. [project-plan/data-model.md](../project-plan/data-model.md#2-activity--a-concrete-independent-always-editable-record)
- **BudgetApi** — the backend's single public API surface (`createBudgetApi(...)`); the only thing a frontend shell imports/calls (rules, activities, the insights/search surface, the recurring-engine run, derived Available Funds). [project-plan/portability.md](../project-plan/portability.md#the-public-api-what-the-front-end-calls)
- **frontend / PWA plan** — the UI surface, a first-class designed area of the plan: zero-prod-dep static bundle, iPhone-Duo foldable viewport (folded/unfolded), configurable base path, rendering all ten requirements over the shared `BudgetApi`. [project-plan/frontend.md](../project-plan/frontend.md)
- **zero-prod-dep frontend** — the frontend is a zero-prod-dep shell (`dependencies: {}`): plain TS/HTML against the `BudgetApi` + built-in Web-platform APIs, no framework runtime dep in production; the build output is a single static web bundle with an empty `dependencies`. [project-plan/frontend.md](../project-plan/frontend.md#zero-production-dependencies-req-1)
- **cross-platform static bundle** — the build output is one static web bundle (`vite build` → `dist/`) with an empty `dependencies`; the **identical artifact** is served on all phones (PWA now, iOS/Android Capacitor shells later) — **no per-platform bundle, build flag, or code path**. [project-plan/portability.md](../project-plan/portability.md#what-this-buys)
- **iPhone-Duo foldable** — the **primary** viewport target: a foldable phone with two states — **folded** (slab-like, baseline 1-page, the mobile baseline) and **unfolded** (dual-panel, enhanced 1-page); **supersedes** the "iPhone class" (SE → 16 Pro Max) verification set. [project-plan/frontend.md](../project-plan/frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2)
- **responsive viewport (folded/unfolded)** — the state-aware layout model built on **logical units + safe-area insets**, not fixed pixel widths; breakpoint is **folded → unfolded** (NOT mobile → tablet → desktop); **slab phones (≈ folded) are the secondary target**. [project-plan/frontend.md](../project-plan/frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2)
- **safe-area inset** — `env(safe-area-inset-*)` used in padding/margin/position so content is never obscured by the notch, Dynamic Island, home indicator, or status bar; the iPhone-Duo layout relies on it rather than hard-pixel viewports. [project-plan/frontend.md](../project-plan/frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2)
- **base path (configurable)** — the Vite `base` / `VITE_BASE_PATH` build-time input (read from `import.meta.env.BASE_URL` at runtime) that rewrites asset URLs; production = `/simple-budget-app/`, PR preview = `/simple-budget-app/pr-<PR#>/`; an explicit, non-hardcoded build decision. [project-plan/frontend.md](../project-plan/frontend.md#base-path-configurable-explicit-build-decision)
- **PR# preview (mode a)** — the confirmed PR-preview architecture: **same-site sub-path** `tandyn.github.io/simple-budget-app/pr-<PR#>/`, with two guarantees — **production root untouched** on a PR deploy and **PR sub-path pruned on merge/close**. [project-plan/testing.md](../project-plan/testing.md#ci-deploy--preview-github-pages)
- **well-maintained criterion** — the governing rule for **any** dev dependency (local package *or* CI action): must be **Active & current**, **First-party / tool-maintainer**, and **Industry-standard** in its category; the curated dev-dep set (pnpm, Vite, Vitest, Playwright, fake-indexeddb, Biome, tsc) and the CI actions all pass it. [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency)
- **credential-gated build** — the Android/iOS native build jobs are **skip-not-fail** gated on the presence of signing secrets (absent → **skipped, not failed**); the always-run Web/PWA build is **not** credential-gated. Build-only, no store upload. [project-plan/testing.md](../project-plan/testing.md#android--ios-test-build-pipeline-credential-skip-build-only)

> As backend / frontend / data topics land, add their terms here and split the
> area doc into `budget-app/<area>.md` when it grows.
