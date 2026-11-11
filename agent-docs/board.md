# Board (GitHub Projects workflow)

The board is the **single source of truth for ticket state**. Every ticket's
lifecycle is tracked by its `Status`; every agent drives the same board. This
doc is a short, accurate overview. The **authoritative** commands and golden
rules live in the `board` skill:
[`.agents/skills/board/SKILL.md`](../.agents/skills/board/SKILL.md).

## Fields

- **Status** — `Todo` → `In Progress` → `Review` → `Done`.
- **role** — which agent owns the ticket (product-manager, project-manager,
  solutions-architect, software-engineer, senior-software-engineer,
  staff-software-engineer, qa, docs-agent).

## Key concepts

- **Dependency order.** A ticket spawns only when it is in the ready set (all
  its blockers are `Done`). Spikes usually go first because tasks are blocked
  on them, but the rule is blockers, not ticket type.
- **One feature branch per epic.** All task PRs merge into the epic feature
  branch; nothing task-related ever merges directly into `main`.
- **Merge ownership** — task PR: approved by senior-software-engineer, merged by
  software-engineer; feature PR (→ `main`): opened + merged by
  staff-software-engineer, only after final review, QA, and the docs-agent pass
  all approve.
- **Main is production.** Only the feature PR touches it, and only after
  approval.

## Signed comments

Agents communicate findings and verdicts by **signed comments** (e.g.
`(senior-software-engineer-agent): ...`), never by editing another role's ticket
body. A rejection carries a signed comment listing every issue, which the
project-manager reads to build fix tickets. Format and golden rules:
[`.agents/skills/comment-signature/SKILL.md`](../.agents/skills/comment-signature/SKILL.md).

## Where the actual commands are

All `gh project` / GraphQL commands (create issue, add to board, link
sub-issue/blocker, set status/role, open PRs) are in the
[board skill](../.agents/skills/board/SKILL.md). This file is the human/agent
map; the skill is the source of truth.
