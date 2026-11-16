# The budget app

The **product** this repository builds: a simple budget app. Unlike the
orchestration system (which already exists and is documented in
[orchestration.md](orchestration.md)), the app is **built over time** by the
pipeline. This doc tracks what is real **now** and grows as each story ships.

Keep it split by area so a reviewer can read only what they need:

| Area | What it covers | Doc |
| ---- | -------------- | --- |
| **backend** | APIs, business logic, validation, persistence (integer-cent money, insights/search, bank-sync slots) | _planned_ — [the app plan](#the-app-plan) |
| **frontend** | UI, components, state, how it talks to the backend (zero-prod-dep static bundle, iPhone-Duo foldable viewport, configurable base path, **PWA-scoped** offline/installable) | _planned_ — [the app plan](#the-app-plan) |
| **data** | the budget data model, storage, what is persisted | _planned_ — [the app plan](#the-app-plan) |
| **testing** | test pyramid (Vitest, Playwright), CI pipeline, headless CLI verification rules, mode-(a) PR preview, credential-gated native builds | _planned_ — [the app plan](#the-app-plan) |

## The app plan

Before implementation begins, the app is **planned** (not yet built). The
navigable, agent-consumable plan lives at the repo root under
[`project-plan/`](../project-plan/README.md) — a per-area set of docs covering
the data model, local secure storage, the recurring-transaction engine, the
activity model (integer-cent money, insights/search surface, bank-sync slots),
the **frontend / UI** surface (a zero-prod-dep **static bundle**, the
**iPhone-Duo foldable viewport** — folded = baseline 1-page / unfolded = enhanced
1-page, slab phones ≈ folded — and a **configurable base path**), platform
portability (one bundle, three webview targets, **cross-platform static
artifact**), the dependency strategy (zero production deps + the
**well-maintained dev-dep & CI-action set**), and the testing & CI/CD strategy
(unit/integration/E2E, **mode-(a) same-site sub-path PR preview** with
production-untouched + prune-on-merge, **credential-gated** native builds).

| Area | Doc |
| ---- | --- |
| Index / MVP scope | [project-plan/README.md](../project-plan/README.md) |
| Data model | [project-plan/data-model.md](../project-plan/data-model.md) |
| Local secure storage | [project-plan/storage.md](../project-plan/storage.md) |
| Recurring engine | [project-plan/recurring-engine.md](../project-plan/recurring-engine.md) |
| Activity model (integer-cent money, insights/search) | [project-plan/activity-model.md](../project-plan/activity-model.md) |
| Frontend / UI (zero-prod-dep static bundle, iPhone-Duo foldable viewport, configurable base path) | [project-plan/frontend.md](../project-plan/frontend.md) |
| Portability (one bundle / three webview targets, cross-platform static artifact) | [project-plan/portability.md](../project-plan/portability.md) |
| Dependency strategy (zero prod deps + well-maintained dev-dep & CI-action set) | [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md) |
| Testing & CI/CD (test pyramid, mode-(a) PR preview, credential-gated native builds) | [project-plan/testing.md](../project-plan/testing.md) |

> The plan is the design-of-record. When an area *ships*, the
> `budget-app/<area>.md` area doc above will track what is real in code; the
> plan stays as the design-of-record.

When an area ships, add a `budget-app/<area>.md` with the details and link it
here; add its key terms to the [glossary](glossary.md). Do **not** inline a whole
area's detail into this file — keep it a short map.

## Conventions

- A **software-engineer** updating an area should keep the matching
  `budget-app/<area>.md` accurate and add new glossary terms.
- The **docs-agent** reconciles everything here against the code before the
  feature PR merges to `main`.
