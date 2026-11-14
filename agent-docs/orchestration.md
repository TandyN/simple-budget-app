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

A tracking issue created by the **product-manager** from the user's prompt. A
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
  found during story-level review (`staff-software-engineer`, `qa`, `docs-agent`);
  title prefix `Bug:`, linked as a sub-issue of the story. Filed by the
  `project-manager` from a **story-level** reviewer's signed rejection, and
  worked identically to a `Task:` ticket (1 `Bug:` sub-issue → 1 fix PR into the
  feature branch; pre-merge task-PR rejections are fixed on that same task PR
  without a `Bug:` ticket).

A sub-issue is a spike, a task, or a `Bug:` — never a mix. Tickets that depend
on other work are linked with a **blocker** (`addBlockedBy`); a ticket is in the
**ready set** (spawnable) only when all its blockers satisfy the **done-gate**
(`C1`): a sub-issue or blocker satisfies the done-gate when its board `Status` is
`Done` **AND** its GitHub issue is `CLOSED`, OR it is closed (`CLOSED`) with the
`wontfix` label (unrelated `Status: Back Log` items are independent open issues
— never sub-issues or blockers — and sit outside the story's done-gate).

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
| **project-manager** | Creates (or reuses) the story feature branch on its initial pass, breaks the story into spikes + tasks, links blockers, builds `Bug:` sub-issues from story-level rejections, and files/dedupes `Back Log` tickets. |
| **solutions-architect** | Works spikes: researches, leaves a signed comment with findings + recommended tasks, closes the spike issue, and moves it to `Done`. |
| **software-engineer** | Implements exactly one `Task:` or `Bug:` sub-issue on a branch cut from the feature branch (`Bug:` sub-issues are worked identically to `Task:` tickets); opens a PR into the feature branch; updates docs best-effort; merges the task PR into the feature branch and closes the issue after `senior-software-engineer` approves. |
| **senior-software-engineer** | Reviews a single task PR (`APPROVED` or `REJECTED`); never merges; leaves a signed verdict comment. |
| **staff-software-engineer** | Final holistic story review once all sub-issues satisfy the done-gate; opens (or reuses) and merges the feature PR to `main`. |
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

- **One feature branch per story** (`feature/<story-number>-<slug>`), created (or
  reused) by the project-manager on its initial pass for the story.
- **Task PR** (task branch → feature branch): reviewed by the
  `senior-software-engineer`, who **never merges**. On `APPROVED`, the
  `software-engineer` merges the task PR into the feature branch and closes the
  task issue (`gh issue close <task-number>`). On `REJECTED` of an unmerged task
  PR, the orchestrator routes the rejection back to the `software-engineer` on
  that same task ticket and branch. Story-level rejections
  (`staff-software-engineer`, `qa`, `docs-agent`) go to the `project-manager` to
  create `Bug:` sub-issues.
- **Feature PR** (feature branch → `main`): opened (or reused after a rejection
  loop) and merged by the `staff-software-engineer`, only after its final review
  **and** QA **and** the `docs-agent` pass all approve.
- `main` is production; only the feature PR touches it.

## Role-agnostic skills

The shared skills (`board`, `backlog`, `comment-signature`, `config-reload`,
`conventional-commits`) are **role-agnostic**: each is a job any role can follow,
describing mechanics (how to operate the board, how to sign a work product, how to
file a Back Log entry, how to prompt a restart, how to format a commit message) —
not who does what. **Role-specific policy** — which role
does what (who creates the feature branch, who approves a task PR, who opens or
merges the feature PR, who leaves which summary and where) — lives in each role's
persona under `.opencode/agents/`, not in the skills. This keeps the shared skills
short and reusable, and puts each role's obligations where they belong.

## The flow

1. **product-manager** creates the stories.
2. **project-manager** creates (or reuses) the story feature branch on its
   initial pass for the story, decomposes (spikes + tasks), and links blockers;
   the orchestrator moves the parent Story to `In Progress`.
3. Orchestrator works the ready set in dependency order — **solutions-architect**
   for spikes, **software-engineer** for `Task:` and `Bug:` sub-issues (`Bug:`
   sub-issues are worked identically to `Task:` tickets) — serially, as each
   ticket's blockers satisfy the **done-gate** (`Status: Done` + `CLOSED`, or
   `CLOSED` with `wontfix`).
4. **senior-software-engineer** reviews each task PR (`senior-software-engineer`
   never merges). On `APPROVED`, **software-engineer** merges the task PR into
   the feature branch and closes the task issue (`gh issue close <task-number>`).
   On `REJECTED` of an unmerged task PR, the orchestrator routes the rejection
   back to **software-engineer** on that same task ticket and branch. Story-level
   rejections (`staff-software-engineer`, `qa`, `docs-agent`) go to
   **project-manager** to create `Bug:` sub-issues.
5. When all sub-issues of the story satisfy the **done-gate** (`C1`), the
   orchestrator moves the parent Story to `Review` and
   **staff-software-engineer** begins the final holistic story review; on
   approval, **staff-software-engineer** opens (or reuses, if re-running after a
   QA or `docs-agent` rejection) the feature PR and posts a new signed
   holistic-review verdict comment on it.
6. **qa** validates the feature PR once; rejections go to **project-manager** to
   create `Bug:` sub-issues (then repeat steps 3–6).
7. **docs-agent** does the final documentation pass over `agent-docs/`; rejections
   go to **project-manager** to create `Bug:` sub-issues (then repeat steps 3–7).
8. **staff-software-engineer** merges the feature PR into `main`; once merged, the
   orchestrator closes the Story GitHub issue (`gh issue close <story-number>`)
   and moves the Story to `Done`.

### Non-blocking findings — never lost

A reviewer's verdict is **APPROVED** or **REJECTED**. Either way, if they raise a
**non-blocking finding** that will not be worked in the current story, it MUST get
a **stated disposition** in the signed verdict comment: `-> Back Log` (`→ Back Log`)
or `→ in-story task #<n>`. On **both** `APPROVED` and `REJECTED` verdicts, if a
reviewer flags `-> Back Log`, the orchestrator spawns `project-manager` to
file/dedupe the Back Log ticket before continuing. A bare "recommend a Back Log
entry" with no ticket and no handoff is **not sufficient** — the finding is only
handled once a Back Log item (or an in-story ticket) exists. This applies to
**both** verdicts so that approved-but-flagged issues are never silently dropped.
The shared rule lives in the [`backlog` skill](../.agents/skills/backlog/SKILL.md)
("Applies to BOTH verdicts"); each reviewer's obligation is in their persona.

## Verification gates

Before the orchestrator proceeds past a step, it verifies the expected **signed
summary/verdict comment** (per the `comment-signature` skill) exists on the
current artifact (ticket or PR). If that comment is **missing or unsigned**, the
orchestrator does not proceed — it relays the work back to the role that should
have left it, then re-checks. A missing comment means context is lost and the
next role cannot act correctly.

- **Recency rule (`C15`):** After any `REJECTED` verdict, the subsequent expected
  signed summary/verdict comment must appear **after** the most recent rejection
  comment on that artifact (for the story-level loop, treat the story ticket and
  its feature PR as one artifact and compare against the most recent rejection on
  either). An older comment from a prior pass never satisfies the gate.
- **5-try retry circuit breaker (`W5`):** If the exact same Task PR or Feature PR
  is rejected **5 consecutive times**, the orchestrator pauses and escalates to
  the user rather than looping forever (count the story-level loop — staff-SE,
  QA, docs-agent — as one counter, since staff-SE rejections land on the story
  ticket rather than the feature PR).

| Before the orchestrator ... | it verifies the artifact has |
| --------------------------- | ---------------------------- |
| spawn the **senior-software-engineer** to review a task PR | a `(software-engineer-agent):` summary comment |
| relay **APPROVED** to the **software-engineer** (merge a task PR) | a `(senior-software-engineer-agent):` verdict comment |
| spawn the **staff-software-engineer** for the final story review | every sub-issue satisfies the done-gate and every task PR has a `(senior-software-engineer-agent):` verdict and is merged |
| spawn **QA** on the feature PR | a `(staff-software-engineer-agent):` holistic-review comment |
| spawn the **docs-agent** | a `(qa-agent):` verdict comment (APPROVED) |
| relay docs-agent **APPROVED** to the **staff-software-engineer** (merge) | a `(docs-agent-agent):` summary comment (APPROVED) |

Source of truth: the **Verification gates** section of
[`.opencode/agents/orchestrator.md`](../.opencode/agents/orchestrator.md).

## Docs

The system documents itself in [`agent-docs/`](README.md). The **docs-agent** is
the role responsible for keeping it accurate (see [budget-app.md](budget-app.md)
for the product docs, which follow the same rules).
