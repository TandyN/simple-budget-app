---
name: keep-docs-accurate
description: >-
  Use this skill after any change to Simple Budget's code, scripts, folder structure, commands, data model, or
  behavior, and before every commit. It keeps AGENTS.md, README.md, docs/ and the plan 100% accurate by running
  the mechanical docs check and walking a manual review checklist.
---

# Keep docs accurate

Docs are part of the change. A commit that makes any doc wrong is a broken commit.

## 1. Run the mechanical check

```bash
bash scripts/check-docs.sh
```

It verifies: every path in backticks or links in `AGENTS.md`, `README.md`, `docs/*.md` and skill files exists
(fenced code blocks, `docs/plan/`, and lines marked `(planned)` are skipped); every skill is listed in `AGENTS.md`;
every plan task is in the plan index; every top-level folder under src/ is described in `AGENTS.md`; every
script in package.json is documented in `docs/developer-setup.md` as `pnpm <script>`.

Things that don't exist yet may be mentioned on a line containing `(planned until Txx)` (or `(planned)`); the
task that builds them removes the marker.

Fix every failure. Prefer fixing the doc; if the doc is right and the code is wrong, fix the code.

## 2. Walk the manual checklist for what you changed

| If you changed…                             | Update…                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Created a folder or key file                | `AGENTS.md` "Where things are" table; remove its `(planned)` marker. Trees in `docs/architecture.md` §3. |
| A package.json script or tool version       | `docs/developer-setup.md` commands table (exact names, what they do).                                    |
| The data model, Dexie version, indexes      | `docs/architecture.md` §4 (schema) and §7 (backup format), with the migration.                           |
| A user-visible flow or rule                 | `docs/architecture.md` §5 flows; glossary in `AGENTS.md` if a term changed.                              |
| The test driver `e2e/support/budget-app.ts` | Driver table in `docs/testing.md`.                                                                       |
| Colors, tokens, layouts, device profiles    | `docs/design.md`.                                                                                        |
| Hosting, install, deploy workflow           | `docs/install-on-iphone.md`.                                                                             |
| Task progress                               | `docs/plan/README.md` status + the task file's checkboxes and Completion notes.                          |
| An agent workflow                           | The relevant `.agents/skills/*/SKILL.md`, and the skills table in `AGENTS.md`.                           |

## 3. Truth test

For each doc you touched (and each doc that describes what you changed), ask: _"If a new agent followed this
literally right now, would it work?"_ Run any command you documented. Remove anything that describes the past
or a future that isn't marked `(planned)`.

## 4. Re-run

`bash scripts/check-docs.sh` must pass. Commit docs together with the code they describe.
