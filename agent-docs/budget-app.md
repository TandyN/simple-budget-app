# The budget app

The **product** this repository builds: a simple budget app. Unlike the
orchestration system (which already exists and is documented in
[orchestration.md](orchestration.md)), the app is **built over time** by the
pipeline. This doc tracks what is real **now** and grows as each story ships.

Keep it split by area so a reviewer can read only what they need:

| Area | What it covers | Doc |
| ---- | -------------- | --- |
| **backend** | APIs, business logic, validation, persistence | _not yet built_ — [planned](#the-backend-plan) |
| **frontend** | UI, components, state, how it talks to the backend | _not yet built_ |
| **data** | the budget data model, storage, what is persisted | _not yet built_ — [planned](#the-backend-plan) |
| **testing** | test pyramid (Vitest, Playwright), CI pipeline, headless CLI verification rules | **toolchain scaffolded** ([#110](#toolchain)) — E2E suite still pending (#112) |

## The backend plan

Before implementation begins, the backend is **planned** (not yet built). The
navigable, agent-consumable plan lives at the repo root under
[`project-plan/`](../project-plan/README.md) — a per-area set of docs covering
the data model, local secure storage, the recurring-transaction engine, the
activity model, platform portability (PWA now / iOS + Android later), the
dependency strategy (zero production deps), and the testing & CI/CD strategy.

| Area | Doc |
| ---- | --- |
| Index / MVP scope | [project-plan/README.md](../project-plan/README.md) |
| Data model | [project-plan/data-model.md](../project-plan/data-model.md) |
| Local secure storage | [project-plan/storage.md](../project-plan/storage.md) |
| Recurring engine | [project-plan/recurring-engine.md](../project-plan/recurring-engine.md) |
| Activity model | [project-plan/activity-model.md](../project-plan/activity-model.md) |
| Portability (PWA / iOS / Android) | [project-plan/portability.md](../project-plan/portability.md) |
| Dependency strategy | [project-plan/dependency-strategy.md](../project-plan/dependency-strategy.md) |
| Testing & CI/CD strategy | [project-plan/testing.md](../project-plan/testing.md) |

> The plan is the deliverable of Story #5. When the backend *ships*, the
> `budget-app/backend.md` and `budget-app/data.md` area docs above will track
> what is real in code; the plan stays as the design-of-record.

## Toolchain

The zero-production-dependency toolchain (Story #108, task #110) is
**scaffolded** at the repo root so the build/lint/test/typecheck pipeline runs:
`package.json` (empty `dependencies`), `tsconfig.json`, `biome.json`,
`vite.config.ts`, `vitest.config.ts`, and `.github/workflows/ci.yml`. The first
code task (#111) replaces the `src/index.ts` placeholder with the domain core;
the E2E suite (#112) replaces the `test:e2e` stub. Details live in the plan:
[dependency-strategy](../project-plan/dependency-strategy.md) and
[testing](../project-plan/testing.md).

When an area ships, add a `budget-app/<area>.md` with the details and link it
here; add its key terms to the [glossary](glossary.md). Do **not** inline a whole
area's detail into this file — keep it a short map.

## Conventions

- A **software-engineer** updating an area should keep the matching
  `budget-app/<area>.md` accurate and add new glossary terms.
- The **docs-agent** reconciles everything here against the code before the
  feature PR merges to `main`.
