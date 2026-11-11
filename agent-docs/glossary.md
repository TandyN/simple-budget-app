# Glossary

The index of the codebase. Every key term gets a one-line definition and a link
to where it is documented. **Start here when you don't know where something
lives.**

Keep each entry to one line + link. If a term needs more than that, it belongs
in its own topic doc, not here.

## Orchestration (the multi-agent system that builds this repo)

- **orchestrator** — the pure relay that is the only role that can spawn
  subagents. [orchestration.md](orchestration.md)
- **epic** — a feature; a tracking ticket with `Original Prompt` / `Summary` /
  `Task` sections. [orchestration.md](orchestration.md#epic)
- **spike ticket** — a research ticket; done by the solutions-architect before
  the tasks it unblocks. [orchestration.md](orchestration.md#ticket-types)
- **task ticket** — an implementation ticket; one job for one software-engineer,
  ends in a PR. [orchestration.md](orchestration.md#ticket-types)
- **feature branch** — one per epic; all task PRs merge into it. [orchestration.md](orchestration.md#branches-and-merge-ownership)
- **feature PR** — feature branch → `main`; the only thing that touches
  production. [orchestration.md](orchestration.md#branches-and-merge-ownership)
- **blocker** — a ticket another ticket waits on; a ticket is ready only when
  all its blockers are `Done`. [orchestration.md](orchestration.md#ticket-types)
- **roles** — product-manager, project-manager, solutions-architect,
  software-engineer, senior-software-engineer, staff-software-engineer, qa,
  docs-agent. [orchestration.md](orchestration.md#roles)
- **signed comment** — every agent finding/verdict, signed `(role-agent):`.
  [board.md](board.md#signed-work-products)
- **body attribution** — the `(role-agent):` signature on the *body* of an issue
  or PR an agent creates. [board.md](board.md#signed-work-products)
- **summary/verdict comment** — the signed comment every agent leaves as its last
  action on the artifact it worked on. [board.md](board.md#signed-work-products)
- **ticket title prefix** — `Epic:` / `Spike:` / `Task:` prefix on every ticket
  title. [board.md](board.md#ticket-title-prefix)
- **verification gates** — the orchestrator's mandatory check that the expected
  signed summary/verdict comment exists on an artifact before proceeding to the
  next step. [orchestration.md](orchestration.md#verification-gates)

## Board (GitHub Projects workflow)

- **board** — the GitHub Projects board that is the single source of truth for
  ticket state. [board.md](board.md)
- **Status** — Todo / In Progress / Review / Done. [board.md](board.md)
- **role field** — which agent owns a ticket. [board.md](board.md)

## The budget app (the product being built)

- **budget-app** — the application itself: its backend, frontend, and data
  model. [budget-app.md](budget-app.md)
- **backend plan** — the navigable, pre-implementation design for the app's
  backend under `project-plan/` (data model, storage, recurring engine, activity
  model, portability, dependency strategy).
  [budget-app.md](budget-app.md#the-backend-plan)
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
  dev dependencies.
  [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md)
- **zero-prod-deps** — `package.json` `dependencies` is empty; at runtime the app
  uses only IndexedDB, WebCrypto, `fetch`, `Date`/`Intl`, and pure TS logic.
  [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md)

> As backend / frontend / data topics land, add their terms here and split the
> area doc into `budget-app/<area>.md` when it grows.
