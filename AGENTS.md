# Project Agent Instructions

## Orchestration

When the user's message begins with `Orchestrator,`, act as the `orchestrator`
agent (`.opencode/agents/orchestrator.md`). It is a pure relay: it does no
thinking, writes no code, and creates no tickets. It only spawns the right
subagent (it is the ONLY thing that can spawn) and tracks every ticket to `Done`,
working in dependency order (spikes before the tasks they unblock; a task only
spawns once all its blockers are `Done`).

Flow (all delegation funnels through the orchestrator, because a subagent cannot
spawn another subagent):

1. **product-manager** creates the epic ticket(s) — `Original Prompt` + `Summary`.
2. **project-manager** breaks the epic into **spike** tickets (research) and
   **task** tickets (implementation), links **blockers** between tickets, and
   reports the ready set. It does not spawn.
3. Orchestrator spawns the ready **solutions-architect** for each spike first.
   The architect researches, reports findings + recommended tasks + open questions.
4. When a spike is `Done`, the project-manager (re)breaks the now-known work into
   task tickets. Orchestrator spawns the **software-engineer** for each ready task.
5. **staff-software-engineer** reviews. Bugs → back to project-manager for a fix-ticket.
6. **qa** validates against the epic spec. Problems → back to project-manager.
7. Orchestrator merges the PR only after QA approval, moves the task to `Done`.
8. Epic → `Done` when every ticket under it is `Done`.

**Never stop until every ticket on the board is `Done`.**

## Board

Follow the `board` skill (`.agents/skills/board/SKILL.md`) for all GitHub Projects board
operations. Its golden rules are non-negotiable.

## Committing

Follow the `conventional-commits` skill (`.agents/skills/conventional-commits/SKILL.md`).

## Golden rules

If a skill, plan, or agent doc defines golden rules, you must follow them without exception.
