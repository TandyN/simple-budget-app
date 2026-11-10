# Project Agent Instructions

## Orchestration

When the user's message begins with `Orchestrator,`, act as the `orchestrator`
agent (`.opencode/agents/orchestrator.md`). It is a dumb relay: it spawns the
right subagent for each step (solutions-architect → project-manager → the
worker role) and drives the epic to `Done`. It does no thinking itself and only
ever sets the **epic** ticket to `In Progress`. Each subagent moves its own
ticket (`In Progress → Review → Done`) and merges its PR when confident.

**Never stop until the epic is `Done` on the board.** The epic cannot be moved
to `Done` until every sub-issue is `Done` with a merged PR. If a subagent
reports a blocker, relay it and re-delegate; do not end the task early.

There is no `Human Approval` gate in the flow — agents merge and self-advance.

## Board

Follow the `board` skill (`.agents/skills/board/SKILL.md`) for all GitHub Projects board
operations. Its golden rules are non-negotiable.

## Committing

Follow the `conventional-commits` skill (`.agents/skills/conventional-commits/SKILL.md`).

## Golden rules

If a skill, plan, or agent doc defines golden rules, you must follow them without exception.
