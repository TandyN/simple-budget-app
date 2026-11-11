# Budget App — Backend Plan

This is the **backend plan** for the simple budget app. It is a navigable,
agent-consumable set of documents: this file is the index, and each of the five
per-area docs is a self-contained hub you can read on its own.

Grounded in the user's ask (Epic #5) and the solutions-architect's design
findings (signed comment on spike #6). **No code in this epic** — the deliverable
is this plan. A software-engineer should be able to decompose it into task
tickets and start implementing.

## How to navigate

```
README.md  (you are here — what this is, MVP scope, links, out-of-scope)
   ├── storage.md          — where/how data is persisted locally, securely
   ├── data-model.md       — entities, field definitions, types, relationships
   ├── recurring-engine.md — how recurring income/expense auto-posts (idempotent)
   ├── activity-model.md   — the unified, editable Activity record
   └── portability.md      — PWA-now / iOS-later boundary + interfaces
```

Read in this order for a first pass: **data-model → storage →
recurring-engine → activity-model → portability**. Each doc links to the others
where the boundary matters.

## MVP scope (what the backend must support)

- **Monthly income + recurring expenses**, both defaulting to the **1st of every
  month**. (Bi-weekly / weekly cadence and custom dates are future work.)
- **Available Funds** = income − expenses, **derived** from the activity log
  (never stored as a separate number).
- The user can **add manual expenses and deposits** any time during the month.
- On each period boundary (MVP: the 1st) the system **auto-posts** each recurring
  income and recurring expense to the activity log — **without double-posting**.
- **Every activity is editable** after the fact (manual *and* auto-generated).
- **Manual tagging** on every activity (for future insight / analytics).
- Every transaction **defaults to the current time but the timestamp is editable**.
- Recurring income and expenses can be **changed at any time** without losing
  prior auto-posted history.
- **Local and secure**: data lives purely on the device, zero network egress.
- **Portable**: the same backend runs as a **PWA (GitHub Pages)** now and as an
  **iOS app** (Capacitor) later.

## Per-area docs

| # | Area | Doc |
|---| ---- | --- |
| 1 | Local secure storage | [storage.md](storage.md) |
| 2 | Data model | [data-model.md](data-model.md) |
| 3 | Recurring-transaction engine | [recurring-engine.md](recurring-engine.md) |
| 4 | Transaction / activity model | [activity-model.md](activity-model.md) |
| 5 | Platform portability | [portability.md](portability.md) |

## Out of scope / future (explicitly NOT in the MVP)

- **Frontend UI** — the PWA and iOS shells are separate work; this plan only
  defines the backend they consume. See [portability.md](portability.md) for the
  boundary.
- **Bi-weekly / weekly schedules and custom dates** — the recurring engine is
  designed to generalize, but the MVP only implements `monthly` (1st of month).
- **iOS app shell** — shipping the Capacitor wrapper is a later epic; this plan
  just guarantees the backend is portable enough to run inside it.
- **Analytics / insights** — tags are captured now (stored on each Activity) but
  no analytics features ship in the MVP.
- **Client-side encryption** — see the [open decisions](portability.md#open-decisions).
