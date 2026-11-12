# Orchestration (the multi-agent system)

This repo is built by a multi-agent pipeline. A human starts it by running the
**`/orchestrator <prompt>`** opencode command; everything else is done by roles.
This doc describes how the system works. The detailed per-role behavior lives in
`.opencode/agents/*.md`.

## Activation

The **orchestrator** relay is activated by the opencode command
**`/orchestrator <prompt>`** (defined in
[`.opencode/command/orchestrator.md`](../.opencode/command/orchestrator.md)). The
command binds the `orchestrator` agent and passes the text the user typed as the
**original prompt** (`$ARGUMENTS`). This is a deterministic, config-driven agent
binding — it replaces the retired `Orchestrator,` text-prefix nudge (a prose hint
the base agent could ignore), so the right agent always runs the turn.

The **orchestrator** itself is `mode: primary` (an interactive/relay agent, not a
spawnable subagent). Once active it is the only role that can spawn, and it drives
the workflow described below.

## The model

- The **epic** is the feature. Each epic gets ONE **feature branch**.
- Task PRs merge into the feature branch. The **feature PR** (feature branch →
  `main`) is the only thing that touches production.
- A subagent **cannot spawn another subagent**. All delegation funnels through
  the **orchestrator**, which is the only role allowed to spawn.

## Epic

A tracking issue created by the **product-manager** from the user's prompt. An
epic has three sections, read in this priority order:

1. `Task` — this epic's specific slice (primary).
2. `Summary` — the user's whole ask, restated (shared context).
3. `Original Prompt` — the verbatim prompt (final word on intent).

## Ticket types

- **spike ticket** (`role: solutions-architect`) — research. Produces a signed
  comment with findings; no code, no PR. Always done before the tasks it
  unblocks.
- **task ticket** (`role: software-engineer`) — implementation. One self-contained
  job, ends in a PR into the feature branch.

A sub-issue is always either a spike or a task, never both. Tickets that depend
on other work are linked with a **blocker** (`addBlockedBy`); a ticket is in the
**ready set** (spawnable) only when all its blockers are `Done`.

## Roles

| Role | Job |
| ---- | --- |
| **product-manager** | Creates the epic ticket(s) from the prompt. |
| **project-manager** | Breaks the epic into spikes + tasks, links blockers, creates the feature branch, and builds fix tickets from rejections. |
| **solutions-architect** | Works spikes: researches, leaves a signed comment with findings + recommended tasks. |
| **software-engineer** | Implements exactly one task on a branch cut from the feature branch; opens a PR into the feature branch; also updates docs best-effort. |
| **senior-software-engineer** | Reviews a single task PR; signed comment on rejection. |
| **staff-software-engineer** | Final holistic epic review; owns the feature PR end to end (opens + merges to `main`). |
| **qa** | Validates the feature PR against the epic spec, once per epic. |
| **docs-agent** | Final documentation pass over `agent-docs/`, once per epic, after QA approves and before the feature PR merges. |

## Subagent roster

The orchestrator spawns the eight `mode: subagent` roles listed above
(`product-manager`, `project-manager`, `solutions-architect`, `software-engineer`,
`senior-software-engineer`, `staff-software-engineer`, `qa`, `docs-agent`). Each is
a file under `.opencode/agents/` with frontmatter `mode: subagent`. The
**orchestrator** is `mode: primary`, so it is the active relay agent — not one of
the spawnable subagents.

**Restart requirement.** opencode reads `.opencode/agents/`, `.opencode/command/`,
and `.agents/skills/` **once at server startup** (no hot-reload). A server that
started before a role file was added, renamed, or edited holds a **stale snapshot**
and may expose only a subset of the roster (with stale `description` text) until it
is restarted. A clean restart of the opencode server makes the full 8-role roster
spawnable again. Do not mistake a partial roster for a missing source — it is a
time-of-start cache, fixed by restarting. After any change to these startup-loaded
surfaces, agents follow the `config-reload` skill: prompt the user to restart
opencode rather than assuming the change is live.

## Branches and merge ownership

- **One feature branch per epic** (`feature/epic-<n>-<slug>`), created by the
  project-manager when it declares readiness.
- **Task PR** (task branch → feature branch): approved by the
  senior-software-engineer, merged by the software-engineer.
- **Feature PR** (feature branch → `main`): opened and merged by the
  staff-software-engineer, only after its final review **and** QA **and** the
  docs-agent pass all approve.
- `main` is production; only the feature PR touches it.

## The flow

1. product-manager creates the epics.
2. project-manager decomposes (spikes + tasks), links blockers, creates the
   feature branch.
3. Orchestrator works the ready set in dependency order — solutions-architect
   for spikes, software-engineer for tasks — serially.
4. senior-software-engineer reviews each task PR; rejections go back to
   project-manager for fix tickets.
5. When all tasks are `Done`, staff-software-engineer does the final holistic
   epic review and opens the feature PR.
6. QA validates the feature PR once; rejections go back for fix tickets.
7. **docs-agent** does the final documentation pass over `agent-docs/`; rejections
   go back for fix tickets.
8. staff-software-engineer merges the feature PR into `main`; the epic moves to
   `Done`.

## Verification gates

Before the orchestrator proceeds past a step, it verifies the expected **signed
summary/verdict comment** (per the `comment-signature` skill) exists on the
current artifact (ticket or PR). If that comment is **missing or unsigned**, the
orchestrator does not proceed — it relays the work back to the role that should
have left it, then re-checks. A missing comment means context is lost and the
next role cannot act correctly.

| Before the orchestrator ... | it verifies the artifact has |
| --------------------------- | ---------------------------- |
| spawn the **senior-software-engineer** to review a task PR | a `(software-engineer-agent):` summary comment |
| relay **APPROVED** to the **software-engineer** (merge a task PR) | a `(senior-software-engineer-agent):` verdict comment |
| spawn the **staff-software-engineer** for the final epic review | every task PR has a `(senior-software-engineer-agent):` verdict and is merged |
| spawn **QA** on the feature PR | a `(staff-software-engineer-agent):` holistic-review comment |
| spawn the **docs-agent** | a `(qa-agent):` verdict comment (APPROVED) |
| relay docs-agent **APPROVED** to the **staff-software-engineer** (merge) | a `(docs-agent-agent):` summary comment (APPROVED) |

Source of truth: the **Verification gates** section of
[`.opencode/agents/orchestrator.md`](../.opencode/agents/orchestrator.md).

## Docs

The system documents itself in [`agent-docs/`](README.md). The **docs-agent** is
the role responsible for keeping it accurate (see [budget-app.md](budget-app.md)
for the product docs, which follow the same rules).
