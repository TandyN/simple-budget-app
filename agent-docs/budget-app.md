# The budget app

The **product** this repository builds: a simple budget app. Unlike the
orchestration system (which already exists and is documented in
[orchestration.md](orchestration.md)), the app is **built over time** by the
pipeline. This doc tracks what is real **now** and grows as each epic ships.

Keep it split by area so a reviewer can read only what they need:

| Area | What it covers | Doc |
| ---- | -------------- | --- |
| **backend** | APIs, business logic, validation, persistence | _not yet built_ |
| **frontend** | UI, components, state, how it talks to the backend | _not yet built_ |
| **data** | the budget data model, storage, what is persisted | _not yet built_ |

When an area ships, add a `budget-app/<area>.md` with the details and link it
here; add its key terms to the [glossary](glossary.md). Do **not** inline a whole
area's detail into this file — keep it a short map.

## Conventions

- A **software-engineer** updating an area should keep the matching
  `budget-app/<area>.md` accurate and add new glossary terms.
- The **docs-agent** reconciles everything here against the code before a feature
  merges to `main`.
