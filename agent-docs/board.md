# Board (GitHub Projects workflow)

The board is the **single source of truth for ticket state**. Every ticket's
lifecycle is tracked by its `Status`; every agent drives the same board. This
doc is a short, accurate overview. The **authoritative** commands and golden
rules live in the `board` skill:
[`.agents/skills/board/SKILL.md`](../.agents/skills/board/SKILL.md).

## Fields

- **Status** — `Todo` → `In Progress` → `Review` → `Done`, plus `Back Log`
  (parked, done-equivalent). The "won't do this" decision is not a status — it is
  the **`wontfix` label flow** (see below): label the issue `wontfix`, comment
  the reason, and close it.
- **role** — which agent owns the ticket (product-manager, project-manager,
  solutions-architect, software-engineer, senior-software-engineer,
  staff-software-engineer, qa, docs-agent).

## Key concepts

- **Board creation is create + link.** A Projects v2 board is owner-scoped by
  default; connecting it to the repo is the separate `gh project link` step. So
  board creation runs `gh project create` **then** `gh project link`. The link
  (board ↔ repo) is distinct from item connection (`addProjectV2ItemById`) —
  both are required.
- **Dependency order.** A ticket spawns only when it is in the ready set (all
  its blockers are `Done`). Spikes usually go first because tasks are blocked
  on them, but the rule is blockers, not ticket type.
- **One feature branch per story.** All task PRs merge into the story feature
  branch; nothing task-related ever merges directly into `main`.
- **Merge ownership** — task PR: approved by senior-software-engineer, merged by
  software-engineer; feature PR (→ `main`): opened + merged by
  staff-software-engineer, only after final review, QA, and the docs-agent pass
  all approve.
- **Main is production.** Only the feature PR touches it, and only after
  approval.

## Signed work products

Every agent's work product — a comment, an issue/ticket body, or a PR body — is
**signed** with its role (`(role-agent):`) so the reader always knows who
produced it. Agents communicate findings and verdicts by **signed comments** (e.g.
`(senior-software-engineer-agent): ...`), never by editing another role's ticket
body. A rejection carries a signed comment listing every issue, which the
project-manager reads to build fix tickets. Every agent also ends with a signed
**summary/verdict comment** as its last action on the artifact it worked on.
Format and golden rules:
[`.agents/skills/comment-signature/SKILL.md`](../.agents/skills/comment-signature/SKILL.md).
Which role signs what, and where each role's summary goes, is role-specific policy
in each role's persona under `.opencode/agents/`.

## Back Log

**Back Log** is a `Status` option for an **unrelated, non-blocking** bug found
while working or reviewing. It is an **independent issue — never a sub-issue of
a story** — so it sits outside a story's "all sub-issues Done" gate; the
orchestrator treats `Status: Back Log` as **done-equivalent**. The GitHub issue
stays **OPEN** (parked, not closed). Filing it is **dedupe-first**: search open
issues for a matching bug, and if a Back Log entry already exists, comment your
findings on it instead of creating a duplicate. An in-scope / blocking bug is
**not** a Back Log item — it is a `Bug:` sub-issue of the story. A reviewer's
**non-blocking finding** is captured here **on both the APPROVED and REJECTED
paths** — the reviewer states a disposition (`→ Back Log` or `→ in-story task`)
in the signed verdict so it is never lost. Flow, search heuristic, signed-comment
rule, and the both-verdicts rule:
[`.agents/skills/backlog/SKILL.md`](../.agents/skills/backlog/SKILL.md).

## wontfix

**`wontfix`** is the marker for a **decision not to do this, for whatever
reason** — a **terminal, closed** state. The flow is: (1) apply the GitHub
**`wontfix`** label to the issue
(confirm the label exists; create it if missing), (2) add a **signed** comment
explaining **why** it is no longer being done, and (3) **close** the issue. It is
distinct from `Back Log` (parked, *might do later*, done-equivalent, and the
issue stays **OPEN**) — `wontfix` is a **closed, decided-not-to-do** issue — and
from `Done` (completed). Like `Back Log` it sits **outside** a story's "all
sub-issues Done" gate, so it will not block the story's done-criteria. Semantics
and the authoritative board rules:
[`.agents/skills/board/SKILL.md`](../.agents/skills/board/SKILL.md).

## Ticket title prefix

Every ticket title begins with a type prefix — `Story:`, `Spike:`, `Task:`, or
`Bug:` — written by the creator (product-manager for stories, project-manager for
spikes and tasks/bugs). Convention and enforcement:
[`.agents/skills/board/SKILL.md`](../.agents/skills/board/SKILL.md).

## Role-agnostic skills

The shared skills (`board`, `backlog`, `comment-signature`, `config-reload`) are
**role-agnostic**: they describe the mechanics any role can follow, and they
discover IDs from the current repository. **Role-specific policy** — which role
does what (who creates the feature branch, who approves a task PR, who opens or
merges the feature PR, who leaves which summary and where) — lives in each role's
persona under `.opencode/agents/`, not in the skills.

## Where the actual commands are

All `gh project` / GraphQL commands (create issue, add to board, link
sub-issue/blocker, set status/role, open PRs) are in the
[board skill](../.agents/skills/board/SKILL.md). This file is the human/agent
map; the skill is the source of truth.
