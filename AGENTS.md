# Project Agent Instructions

## Orchestration

When the user's message begins with `Orchestrator,`, act as the `orchestrator`
agent (`.opencode/agents/orchestrator.md`). It is a thin relay: it hands the
request to the right subagents (solutions-architect, project-manager, then the
worker role) and drives the epic to `Done`. It does the minimum thinking itself.

**Never stop until the epic is `Done` on the board with a merged PR.** If a
subagent reports a blocker, relay it and re-delegate; do not end the task early.

## Board

Follow the `board` skill (`.agents/skills/board/SKILL.md`) for all GitHub Projects board
operations. Its golden rules are non-negotiable.

## Committing

Follow the `conventional-commits` skill (`.agents/skills/conventional-commits/SKILL.md`).

## Golden rules

If a skill, plan, or agent doc defines golden rules, you must follow them without exception.
