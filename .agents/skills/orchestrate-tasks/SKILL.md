---
name: orchestrate-tasks
description: >-
  Use this skill when coordinating multiple agents (Implementer, Reviewer, Release-QA) or running independent
  plan tasks in parallel (such as T02+T04 or T11+T12). It defines the subagent personas and handoff protocol.
---

# Orchestrate Multi-Agent Tasks

Simple Budget supports a structured handoff workflow across specialized subagent personas, and parallel execution
for tasks whose dependencies in `docs/plan/README.md` do not overlap.

## 1. Define Subagent Personas

Use `define_subagent` to register the three team personas when orchestrating:

1. **`implementer`** (`EnableWriteTools: true`, `Workspace: 'branch'` or `'share'`):
   - System prompt: Follows `AGENTS.md`, `work-next-plan-task`, `write-readable-tests`, `keep-docs-accurate`,
     `verify-before-commit`, and `agent-commit`. Never touches `# Human Description` in `README.md`. Never adds
     runtime dependencies outside `react` and `react-dom`. Works on a feature branch `feat/Txx-<slug>` and returns
     the branch name, test results, and Duo folded/unfolded screenshot paths.
2. **`reviewer`** (`EnableWriteTools: true`, `Workspace: 'inherit'`):
   - System prompt: Follows `.agents/skills/review-pr/SKILL.md`. Audits `gh pr diff` for a PR on
     `TandyN/simple-budget-app`, verifies every checklist item, posts a review comment on the PR, and reports
     `APPROVED` or `CHANGES_REQUESTED`.
3. **`release-qa`** (`EnableWriteTools: true`, `Workspace: 'inherit'`):
   - System prompt: Follows `.agents/skills/ship-and-verify-release/SKILL.md`. Bumps SemVer & `CHANGELOG.md`,
     merges an approved PR to `main`, deploys to GitHub Pages (`pnpm release:deploy`), and verifies the live site
     and offline PWA (`pnpm verify:live`).

## 2. Parallelizable Task Groups in `docs/plan/README.md`

Check `docs/plan/README.md` before starting parallel subagents:

- **Group A (after T01 is `done`):**
  - Stream 1: `T02` (Domain core) → `T03` (Local database) — touches `src/domain/`, `src/data/`, `src/app/` (planned until T02/T03).
  - Stream 2: `T04` (Design system & responsive app shell) — touches `src/ui/` and `dev/` (planned until T04).
- **Group B (after T10 is `done`):**
  - Stream 1: `T11` (Tags) → `T13` (Insights).
  - Stream 2: `T12` (Calendar).

## 3. Handoff Protocol

1. **Dispatch:** Launch `implementer` subagent(s) with `invoke_subagent` (`Model: 'inherit'`, `Workspace: 'share'`).
2. **PR Creation:** Once an `implementer` finishes and passes `pnpm verify`, push its `feat/Txx-...` branch and open a PR.
3. **Review Handoff:** Launch `reviewer` subagent on the PR number. If changes are requested, message the `implementer`
   subagent to address them and re-verify.
4. **Release & Live QA Handoff:** Once approved, run `release-qa` (sequentially, one PR merged and deployed at a time)
   so each task gets its own clean SemVer release (`v0.2.0`, `v0.3.0`, …) and live offline verification.
