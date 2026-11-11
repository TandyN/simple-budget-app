# Project Agent Instructions

## Orchestration

When the user's message begins with `Orchestrator,`, act as the `orchestrator`
agent (`.opencode/agents/orchestrator.md`). It is a pure relay: it does no
thinking, writes no code, and creates no tickets. It is the ONLY thing that can
spawn subagents, and it works tickets in dependency order (a ticket only spawns
a task once all its blockers are `Done`), spawning tasks serially.

Model: the **epic** is the feature. Each epic has ONE **feature branch** (created
by the project-manager when it declares readiness). Task PRs merge into the
feature branch; the **feature PR** (feature branch → `main`) is the only thing
that touches production.

Flow (all delegation funnels through the orchestrator, because a subagent cannot
spawn another subagent):

1. **product-manager** creates the epic ticket(s), each with three sections:
   `Original Prompt` (verbatim), `Summary` (the user's whole ask), and `Task`
   (this epic's specific slice). Together the epics solve the full prompt.
2. **project-manager** breaks the epic into **spike** tickets (research) and
   **task** tickets (implementation), links **blockers**, iterates spikes until
   fully decomposed, declares readiness, and **creates the epic feature branch**.
3. Orchestrator works the ready set in dependency order: spawns the
   **solutions-architect** for spikes and the **software-engineer** for tasks
   (serially, one at a time, in blocker order).
4. **senior-software-engineer** reviews each task. Bugs → back to project-manager
   for a fix ticket. Approved → the SE merges the task PR into the feature branch.
5. When all tasks are `Done`, **staff-software-engineer** does a final holistic
   epic review.
6. **Staff-software-engineer** opens the **feature PR** (→ `main`). Orchestrator
   runs **QA once** on it. Problems → back to project-manager for fix tickets,
   then repeat 3–6.
7. After QA approves, the **docs-agent** does a **final pass over `agent-docs/`**
   (once per epic): it reviews each section against what ships, fixes the docs in
   the feature PR, and reports back. Problems → back to project-manager for fix
   tickets, then repeat 3–7.
8. **Staff-software-engineer** merges the feature PR into `main` only after the
   final review, QA, **and** the docs-agent pass all approve (it is the only role
   that merges into `main`). Orchestrator then moves the epic to `Done`.

**Never stop until every ticket on the board is `Done` and all feature PRs are
merged to `main`.**

## Board

Follow the `board` skill (`.agents/skills/board/SKILL.md`) for all GitHub Projects board
operations. Its golden rules are non-negotiable.

## Commenting

Follow the `comment-signature` skill (`.agents/skills/comment-signature/SKILL.md`).
Agents communicate findings and verdicts by **signed comments** (e.g.
`(solutions-architect-agent): ...`, `(senior-software-engineer-agent): ...`) on the
ticket or PR — they never edit another role's ticket body. A rejection carries a
signed comment listing every issue, which the project-manager reads to build fix
tickets.

## Docs

Keep `agent-docs/` accurate. It is a small navigable graph (see
`agent-docs/README.md`): a `glossary.md` index of every key term → link, and a
hub doc per area (`orchestration.md`, `board.md`, `budget-app.md`, ...). Keep
docs short and **split by area** so a reviewer reading one area (e.g. backend)
never has to read another (e.g. frontend).

- The **software-engineer** updates docs **best-effort** as part of their task.
- The **docs-agent** does the **final pass over `agent-docs/`** once per epic,
  after QA approves and before the feature PR merges to `main` (see step 7). It
  reviews every section against what ships, fixes what is wrong, and adds what
  is missing. Only then does the staff-software-engineer merge.

## Committing

Follow the `conventional-commits` skill (`.agents/skills/conventional-commits/SKILL.md`).

## Golden rules

If a skill, plan, or agent doc defines golden rules, you must follow them without exception.
