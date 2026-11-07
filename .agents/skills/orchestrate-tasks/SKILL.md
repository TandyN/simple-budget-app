---
name: orchestrate-tasks
description: >-
  Use this skill when coordinating multiple agents (Implementer, Reviewer, Release-QA) or running independent
  plan tasks in parallel (such as T02+T04 or T11+T12). It defines the subagent personas and handoff protocol.
---

# Orchestrate Multi-Agent Tasks

Simple Budget supports a structured handoff workflow across specialized subagent personas, and parallel execution
for tasks whose dependencies in `docs/plan/README.md` do not overlap.

## 1. Subagent Personas (launched with the `task` tool)

The `task` tool is the real spawning mechanism in this environment — `agent_type` is one of
`explore`, `task`, `general-purpose`, `code-review`, `research`, or `security-review`, and
`mode` is `sync` (wait) or `background` (fire-and-forget, notified on completion). The three
team personas map to it as follows:

1. **`implementer`** — the main conversation itself (or a `general-purpose` background agent
   when running tasks in parallel).
   - Follows `AGENTS.md`, `work-next-plan-task`, `write-readable-tests`, `keep-docs-accurate`,
     `verify-before-commit`, and `agent-commit`. Never touches `# Human Description` in `README.md`.
     Never adds runtime dependencies outside `react` and `react-dom`. Works on a feature branch
     `feat/Txx-<slug>` and returns the branch name, test results, and Duo folded/unfolded screenshot
     paths. **Never merges its own PR.**
2. **`reviewer`** — a **fresh** `general-purpose` background agent (see `ship-and-verify-release` §3).
   - Follows `.agents/skills/review-pr/SKILL.md`. Waits for CI with `gh pr checks --watch`, audits
     `gh pr diff`, does hands-on QA in the browser at both iPhone Duo layouts, and posts a structured
     review comment. Returns `APPROVED` or `CHANGES REQUESTED`. **Never merges** — that is the
     tech lead's action.
3. **`tech lead` (the human, not an agent)** — does the **final review**, runs `gh pr merge --merge`
   with a feature merge subject, and owns the ship. Merges are always a human decision because they
   put code into production.
4. **`release-qa`** — folded into the engineer personas: after the tech lead merges, we watch
   `.github/workflows/release.yml` to completion (SemVer bump, `CHANGELOG.md`, PWA deploy, `vX.Y.Z` tag)
   and confirm the live site + offline PWA at `https://tandyn.github.io/simple-budget-app/` for the tech lead.

## 2. Parallelizable Task Groups in `docs/plan/README.md`

Check `docs/plan/README.md` before starting parallel subagents:

- **Group A (after T01 is `done`):**
  - Stream 1: `T02` (Domain core) → `T03` (Local database) — touches `src/domain/`, `src/data/`, `src/app/` (planned until T02/T03).
  - Stream 2: `T04` (Design system & responsive app shell) — touches `src/ui/` and `dev/` (planned until T04).
- **Group B (after T10 is `done`):**
  - Stream 1: `T11` (Tags) → `T13` (Insights).
  - Stream 2: `T12` (Calendar).

## 3. Handoff Protocol

1. **Implement (sync or background):** Work the task on a `feat/Txx-<slug>` branch, committing
   incrementally with `(agent-generated)`. Run `bash scripts/verify.sh` and the hands-on Duo check
   locally before pushing.
2. **PR Creation:** Push the branch and open a PR on `TandyN/simple-budget-app`.
3. **Review Handoff:** Dispatch a **fresh `general-purpose` reviewer** (`mode: "background"`) per
   `ship-and-verify-release` §3. The implementer keeps working (or reports to the user) while the
   reviewer waits for CI, reviews, QAs, and comments — and returns a verdict. It **does not merge**.
   If changes are requested, fix them, re-run `bash scripts/verify.sh`, push, and re-dispatch a fresh reviewer.
4. **Tech Lead Merge Handoff:** On `APPROVED`, the implementer hands the PR to the **tech lead** with a crisp
   summary. The tech lead does the final review and runs `gh pr merge --merge` to `main`.
   (The implementer never merges its own work, and neither does the reviewer.)
5. **Release & Live QA Confirmation:** After the tech lead merges, we watch `.github/workflows/release.yml` to completion
   (SemVer bump, `CHANGELOG.md`, PWA deploy, live offline QA, `vX.Y.Z` tag) and confirm the live site + offline PWA
   for the tech lead. Only then is the task fully shipped.

**Ordering rule:** tasks whose dependencies overlap in `docs/plan/README.md` must be sequential —
each task ships its own clean SemVer release (`v0.2.0`, `v0.3.0`, …) and its own independent review.
