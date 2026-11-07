---
name: work-next-plan-task
description: >-
  Use this skill when asked to work on the Simple Budget build plan, "do the next task", "continue the plan",
  or implement a specific plan task (T01–T14). It picks the correct task from docs/plan/README.md and runs the
  full loop: read → mark in progress → incremental story-telling commits → see it work → update docs → verify → PR → merge → automated release.
---

# Work the next plan task

## 1. Pick the task

1. Read `AGENTS.md` and `docs/plan/README.md`.
2. If a task is `in-progress`, continue it. Otherwise take the **first `todo` task whose dependencies are all `done`**.
   If the user named a task, use that one, but stop and ask if its dependencies are not `done`.
3. Read the whole task file, plus every doc it links to. Read `docs/testing.md` before writing any test.

## 2. Start

1. Make sure the working tree is clean (`git status`), `origin` is `TandyN/simple-budget-app`, and `main` is up to date (`git checkout main && git pull --ff-only origin main`).
2. Create a feature branch from `main` (e.g. `git checkout -b feat/T03-local-database`).
3. In `docs/plan/README.md` set the task's status to `in-progress`.

## 3. Build it in small, story-telling commits (tests first)

1. Use the `write-readable-tests` skill. Turn **every bullet in the task's "Behaviors to prove"** into a test
   whose name matches the bullet (wording may be polished, meaning may not change). Add more tests if you find more behaviors.
2. **Commit incrementally as each logical sub-piece is completed** (3–6 commits per task using `agent-commit`) instead of waiting until the end for one giant commit:
   - Run the fast checks (`pnpm docs:check && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`) before each intermediate commit.
   - Write clear Conventional Commit subjects (`feat(db): ... [T03] (agent-generated)`, `test(db): ... [T03] (agent-generated)`) that will read naturally in the generated release notes.
3. Follow the golden rules in `AGENTS.md` (integer cents, string dates, pure domain, one transaction per write).
4. Stay inside the task's scope. If you discover necessary work outside it, write it under
   "Follow-ups" in the task file instead of doing it — unless it blocks the task.

## 4. See it work

Use the `verify-before-commit` skill. It runs the full gate (`bash scripts/verify.sh`) **and** requires a hands-on check of the feature in both iPhone Duo layouts (screenshots you actually look at).

## 5. Docs & Task Completion Commit

1. Use the `keep-docs-accurate` skill. Typical updates: `AGENTS.md` repository map (remove "(planned)" from
   anything that now exists), `docs/developer-setup.md` commands, `docs/testing.md` driver vocabulary,
   `docs/architecture.md` if a decision changed.
2. Tick every acceptance-criteria checkbox in the task file that is truly met. If one isn't met, the task isn't done.
3. Fill in the task's **Completion notes**: what was built, anything surprising, follow-ups.
4. Set the status to `done` in `docs/plan/README.md`.
5. Run `bash scripts/verify.sh` and commit the docs/plan completion using `agent-commit` (e.g. `docs(db): document src/data layer and complete T03 plan notes [T03] (agent-generated)`).

## 6. PR Verification (`/pr-<N>/` Preview QA) → Merge → Automated Release (`.github/workflows/release.yml`)

Use the `ship-and-verify-release` skill:

1. **Open PR to `main`:** Push the branch and open a PR on `TandyN/simple-budget-app`.
2. **Wait for `.github/workflows/ci.yml` & Independent Review:** Run `gh pr checks <pr> --watch --repo TandyN/simple-budget-app` (which verifies the branch is up to date with `main`, runs all tests, deploys the isolated preview to `https://tandyn.github.io/simple-budget-app/pr-<N>/`, runs live WebKit + offline QA on that preview, and uploads the `SimpleBudget-iOS-Simulator` artifact) and run `review-pr`.
3. **Merge with a Clean Feature Title:** Merge to `main` using `--merge` and `--subject "feat(<scope>): <feature summary> (#<pr>) [Txx] (agent-generated)"`.
4. **Watch the Automated Production Release (`.github/workflows/release.yml`):** Merging to `main` automatically runs `.github/workflows/release.yml` on GitHub Actions to bump SemVer, generate categorized release notes in `CHANGELOG.md`, deploy the production PWA, run live QA, push `vX.Y.Z` + GitHub Release notes, and trigger `ios-testflight`. Wait for `gh run watch` to finish and pull `origin/main`.
5. Report to the user: the incremental commit story, PR link, automated release version, and local + live verification results.
   **Do not start the next task** unless the user asked for several.

## If you get stuck

Don't weaken a test, skip a check, or mark a criterion done to get unstuck. Write down what you tried in the
task's Completion notes, leave the status `in-progress`, and ask the user.
