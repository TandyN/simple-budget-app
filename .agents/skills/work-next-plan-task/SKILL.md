---
name: work-next-plan-task
description: >-
  Use this skill when asked to work on the Simple Budget build plan, "do the next task", "continue the plan",
  or implement a specific plan task (T01–T14). It picks the correct task from docs/plan/README.md and runs the
  full loop: read → mark in progress → readable tests → implement → see it work → update docs → verify → commit → mark done.
---

# Work the next plan task

## 1. Pick the task

1. Read `AGENTS.md` and `docs/plan/README.md`.
2. If a task is `in-progress`, continue it. Otherwise take the **first `todo` task whose dependencies are all `done`**.
   If the user named a task, use that one, but stop and ask if its dependencies are not `done`.
3. Read the whole task file, plus every doc it links to. Read `docs/testing.md` before writing any test.

## 2. Start

1. Make sure the working tree is clean (`git status`). If not, ask the user what to do with the changes.
2. In `docs/plan/README.md` set the task's status to `in-progress`.

## 3. Build it, tests first

1. Use the `write-readable-tests` skill. Turn **every bullet in the task's "Behaviors to prove"** into a test
   whose name matches the bullet (wording may be polished, meaning may not change). Add more tests if you find more behaviors.
2. Run them and watch them fail for the right reason.
3. Implement until they pass. Follow the golden rules in `AGENTS.md` (integer cents, string dates, pure domain, one transaction per write).
4. Stay inside the task's scope. If you discover necessary work outside it, write it under
   "Follow-ups" in the task file instead of doing it — unless it blocks the task.

## 4. See it work

Use the `verify-before-commit` skill. It runs the full gate **and** requires a hands-on check of the feature
in both iPhone Duo layouts (screenshots you actually look at).

## 5. Docs

Use the `keep-docs-accurate` skill. Typical updates: `AGENTS.md` repository map (remove "(planned)" from
anything that now exists), `docs/developer-setup.md` commands, `docs/testing.md` driver vocabulary,
`docs/architecture.md` if a decision changed.

## 6. Finish

1. Tick every acceptance-criteria checkbox in the task file that is truly met. If one isn't met, the task isn't done.
2. Fill in the task's **Completion notes**: what was built, anything surprising, follow-ups.
3. Set the status to `done` in `docs/plan/README.md`.
4. Commit (Conventional Commits + task id, e.g. `feat(rollover): carry leftover budget into the next month [T07]`).
   Small intermediate commits are fine; each one must pass the gate.
5. Report to the user: what changed, how it was verified (with screenshot paths), any follow-ups.
   **Do not start the next task** unless the user asked for several.

## If you get stuck

Don't weaken a test, skip a check, or mark a criterion done to get unstuck. Write down what you tried in the
task's Completion notes, leave the status `in-progress`, and ask the user.
