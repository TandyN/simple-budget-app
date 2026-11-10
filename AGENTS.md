# Project Agent Instructions

## Delegation

For non-trivial work, delegate to the right specialist instead of doing everything
inline. This table is the portable, harness-agnostic description of the team.
Harnesses that support named subagents (e.g. opencode, see `.opencode/agents/`)
expose these directly as launchable agents.

| Role            | Does                                                            | Does not      |
| --------------- | --------------------------------------------------------------- | ------------- |
| orchestrator    | decomposes work, delegates, integrates + verifies               | implements    |
| project-manager | scope, priorities, ordered tasks, risks                         | writes code   |
| architect       | design, interfaces, data model, trade-offs                      | implements    |
| engineer        | implements well-scoped tasks; tests + verifies                  | scope/design  |
| staff-engineer  | hard/cross-cutting/risky work; senior review                    | —             |

Routing:
- Big/ambiguous task → orchestrator (it delegates downward).
- Scope or priorities unclear → project-manager.
- Needs a design before code → architect.
- Well-scoped implementation → engineer.
- Hard, risky, or cross-cutting → staff-engineer.

Each subagent task must be short, specific, and self-contained, with a clear
definition of done. Independent items should be delegated in parallel.

## Committing

Follow the `conventional-commits` skill (`.agents/skills/conventional-commits/SKILL.md`).

## Golden rules

If a skill defines golden rules, you must follow them without exception.
