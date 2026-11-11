# The budget app

The **product** this repository builds: a simple budget app. Unlike the
orchestration system (which already exists and is documented in
[orchestration.md](orchestration.md)), the app is **built over time** by the
pipeline. This doc tracks what is real **now** and grows as each epic ships.

Keep it split by area so a reviewer can read only what they need:

| Area | What it covers | Doc |
| ---- | -------------- | --- |
| **backend** | APIs, business logic, validation, persistence | _not yet built — planned_ |
| **frontend** | UI, components, state, how it talks to the backend | _not yet built_ |
| **data** | the budget data model, storage, what is persisted | _not yet built — planned_ |

## The backend plan

Before implementation begins, the backend is **planned** (not yet built). The
navigable, agent-consumable plan lives at the repo root under
[`project-plan/`](../project-plan/README.md) — a per-area set of docs covering
the data model, local secure storage, the recurring-transaction engine, the
activity model, and platform portability (PWA now / iOS later).

| Area | Doc |
| ---- | --- |
| Index / MVP scope | [project-plan/README.md](../project-plan/README.md) |
| Data model | [project-plan/data-model.md](../project-plan/data-model.md) |
| Local secure storage | [project-plan/storage.md](../project-plan/storage.md) |
| Recurring engine | [project-plan/recurring-engine.md](../project-plan/recurring-engine.md) |
| Activity model | [project-plan/activity-model.md](../project-plan/activity-model.md) |
| Portability | [project-plan/portability.md](../project-plan/portability.md) |

> The plan is the deliverable of Epic #5. When the backend *ships*, the
> `budget-app/backend.md` and `budget-app/data.md` area docs above will track
> what is real in code; the plan stays as the design-of-record.

When an area ships, add a `budget-app/<area>.md` with the details and link it
here; add its key terms to the [glossary](glossary.md). Do **not** inline a whole
area's detail into this file — keep it a short map.

## Conventions

- A **software-engineer** updating an area should keep the matching
  `budget-app/<area>.md` accurate and add new glossary terms.
- The **docs-agent** reconciles everything here against the code before a feature
  merges to `main`.
