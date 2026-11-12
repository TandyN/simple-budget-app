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

- The **story** is the top-level unit of work (not necessarily a code feature —
  it may be research or requirements). Each story gets ONE **feature branch**.
- Task PRs merge into the feature branch. The **feature PR** (feature branch →
  `main`) is the only thing that touches production.
- A subagent **cannot spawn another subagent**. All delegation funnels through
  the **orchestrator**, which is the only role allowed to spawn.

## Story

A tracking issue created by the **product-manager** from the user's prompt. An
story has three sections, read in this priority order:

1. `Task` — this story's specific slice (primary).
2. `Summary` — the user's whole ask, restated (shared context).
3. `Original Prompt` — the verbatim prompt (final word on intent).

## Ticket types

- **spike ticket** (`role: solutions-architect`) — research. Produces a signed
  comment with findings; no code, no PR. Always done before the tasks it
  unblocks.
- **task ticket** (`role: software-engineer`) — implementation. One self-contained
  job, ends in a PR into the feature branch.
- **`Bug:` ticket** (`role: software-engineer`) — an in-scope / blocking bug
  found during review; title prefix `Bug:`, linked as a sub-issue of the story.
  Filed by the project-manager from a reviewer's signed rejection.

A sub-issue is a spike, a task, or a `Bug:` — never a mix. Tickets that depend
on other work are linked with a **blocker** (`addBlockedBy`); a ticket is in the
**ready set** (spawnable) only when all its blockers are `Done`.

## Milestones

The **product-manager** assigns each story, and the **project-manager** assigns
each sub-ticket (spike, task, `Bug:`), to the appropriate **open** GitHub
Milestone when creating the ticket. The user maintains milestones manually; the
agent chooses the right open one (`gh api repos/<owner>/<repo>/milestones`). If
no sensible open milestone exists, leave it unset and note why in a signed
comment.

**Sub-issues do NOT inherit their parent's milestone.** Verified against the
GitHub API: a sub-issue linked via `addSubIssue` keeps whatever milestone it was
created with (unset stays unset; a pre-set milestone is not overwritten by the
parent's). So every ticket's milestone must be set explicitly — never assume a
sub-ticket inherited the story's milestone.

## Roles

| Role | Job |
| ---- | --- |
| **product-manager** | Creates the story ticket(s) from the prompt. |
| **project-manager** | Breaks the story into spikes + tasks, links blockers, creates the feature branch, and builds fix tickets from rejections. |
| **solutions-architect** | Works spikes: researches, leaves a signed comment with findings + recommended tasks. |
| **software-engineer** | Implements exactly one task on a branch cut from the feature branch; opens a PR into the feature branch; also updates docs best-effort. |
| **senior-software-engineer** | Reviews a single task PR; signed comment on rejection. |
| **staff-software-engineer** | Final holistic story review; owns the feature PR end to end (opens + merges to `main`). |
| **qa** | Validates the feature PR against the story spec, once per story. |
| **docs-agent** | Final documentation pass over `agent-docs/`, once per story, after QA approves and before the feature PR merges. |

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

- **One feature branch per story** (`feature/<story-number>-<slug>`), created by the
  project-manager when it declares readiness.
- **Task PR** (task branch → feature branch): approved by the
  senior-software-engineer, merged by the software-engineer.
- **Feature PR** (feature branch → `main`): opened and merged by the
  staff-software-engineer, only after its final review **and** QA **and** the
  docs-agent pass all approve.
- `main` is production; only the feature PR touches it.

## Role-agnostic skills

The shared skills (`board`, `backlog`, `comment-signature`, `config-reload`) are
**role-agnostic**: each is a job any role can follow, describing mechanics (how to
operate the board, how to sign a work product, how to file a Back Log entry, how
to prompt a restart) — not who does what. **Role-specific policy** — which role
does what (who creates the feature branch, who approves a task PR, who opens or
merges the feature PR, who leaves which summary and where) — lives in each role's
persona under `.opencode/agents/`, not in the skills. This keeps the shared skills
short and reusable, and puts each role's obligations where they belong.

## The flow

1. product-manager creates the stories.
2. project-manager decomposes (spikes + tasks), links blockers, creates the
   feature branch.
3. Orchestrator works the ready set in dependency order — solutions-architect
   for spikes, software-engineer for tasks — serially.
4. senior-software-engineer reviews each task PR; rejections go back to
   project-manager for fix tickets.
5. When all tasks are `Done`, staff-software-engineer does the final holistic
   story review and opens the feature PR.
6. QA validates the feature PR once; rejections go back for fix tickets.
7. **docs-agent** does the final documentation pass over `agent-docs/`; rejections
   go back for fix tickets.
8. staff-software-engineer merges the feature PR into `main`; the story moves to
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
| spawn the **staff-software-engineer** for the final story review | every task PR has a `(senior-software-engineer-agent):` verdict and is merged |
| spawn **QA** on the feature PR | a `(staff-software-engineer-agent):` holistic-review comment |
| spawn the **docs-agent** | a `(qa-agent):` verdict comment (APPROVED) |
| relay docs-agent **APPROVED** to the **staff-software-engineer** (merge) | a `(docs-agent-agent):` summary comment (APPROVED) |

Source of truth: the **Verification gates** section of
[`.opencode/agents/orchestrator.md`](../.opencode/agents/orchestrator.md).

## Docs

The system documents itself in [`agent-docs/`](README.md). The **docs-agent** is
the role responsible for keeping it accurate (see [budget-app.md](budget-app.md)
for the product docs, which follow the same rules).
