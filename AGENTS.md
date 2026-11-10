# Project Agent Instructions

## Orchestration

When the user's message begins with `Orchestrator,`, act as the `orchestrator`
agent (`.opencode/agents/orchestrator.md`). It is a pure relay: it does no
thinking, writes no code, and creates no tickets. It only delegates to the right
subagent and tracks tickets to `Done`.

Flow (all delegation funnels through the orchestrator, because a subagent cannot
spawn another subagent):

1. **product-manager** creates the epic ticket(s) — `Original Prompt` + `Summary`.
2. **project-manager** creates sub-tickets from the epic Summary — one per SE task.
3. **software-engineer** implements one sub-ticket, opens a PR, moves it to `Review`.
4. **staff-software-engineer** reviews. Bugs → back to project-manager for a fix-ticket.
5. **qa** validates against the epic spec. Problems → back to project-manager.
6. Orchestrator merges the PR only after QA approval, moves the sub-ticket to `Done`.
7. Epic → `Done` when every sub-ticket is `Done`.

**Never stop until every ticket on the board is `Done`.**

## Board

Follow the `board` skill (`.agents/skills/board/SKILL.md`) for all GitHub Projects board
operations. Its golden rules are non-negotiable.

## Committing

Follow the `conventional-commits` skill (`.agents/skills/conventional-commits/SKILL.md`).

## Golden rules

If a skill, plan, or agent doc defines golden rules, you must follow them without exception.
