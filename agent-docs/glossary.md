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
  [board.md](board.md#signed-comments)

## Board (GitHub Projects workflow)

- **board** — the GitHub Projects board that is the single source of truth for
  ticket state. [board.md](board.md)
- **Status** — Todo / In Progress / Review / Done. [board.md](board.md)
- **role field** — which agent owns a ticket. [board.md](board.md)

## The budget app (the product being built)

- **budget-app** — the application itself: its backend, frontend, and data
  model. [budget-app.md](budget-app.md)

> As backend / frontend / data topics land, add their terms here and split the
> area doc into `budget-app/<area>.md` when it grows.
