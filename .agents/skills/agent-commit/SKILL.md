---
name: agent-commit
description: >-
  Use this skill whenever creating or amending a git commit in Simple Budget. It enforces incremental,
  story-telling Conventional Commits, the mandatory "(agent-generated)" suffix on every agent commit,
  verifies the "# Human Description" section in README.md was never touched, and confirms the repository
  remote is TandyN/simple-budget-app.
---

# Agent Commit

Every commit made by an agent must be immediately distinguishable from a human commit, respect human-only files,
and **tell a clear, incremental story** of how the feature was built.

## 1. Commit Often to Tell a Story (Never One Giant Commit)

- **Do NOT wait until the end of a task to dump 1,000+ lines into a single commit.**
- Commit after completing each logical unit of work on a feature branch (typically **3–6 commits per plan task**):
  1. Core module / schema / primitive + its tests (`feat(money): parse and format integer cents [T02] (agent-generated)`)
  2. Next module / component / use-case + its tests (`feat(calendar): add local calendar rules and month grid [T02] (agent-generated)`)
  3. Integration / UI screen + E2E journey (`feat(ledger): compute month statements and recurring rollover [T02] (agent-generated)`)
  4. Documentation & plan completion notes (`docs(domain): document domain modules and mark T02 done [T02] (agent-generated)`)
- These Conventional Commits automatically feed `scripts/release-version.mjs` when cutting an official release, so each commit subject should read like a clean line in the release notes.

## 2. Pre-Commit Checks

1. **For intermediate commits on a feature branch:** run the fast local checks (`pnpm docs:check && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
2. **Before the final commit on a branch (prior to opening a PR):** run the full verification gate `bash scripts/verify.sh` (via the `verify-before-commit` skill), including all Playwright E2E journeys and the hands-on visual check.
3. Confirm `# Human Description` at the top of `README.md` (everything above `# Simple Budget`) is completely untouched (`scripts/check-docs.sh` checks this automatically).
4. Confirm `git status` has no untracked build artifacts (`dist/`, `test-results/`, `playwright-report/`, `*.tsbuildinfo`).

## 3. Commit Message Format

- Use Conventional Commits (`feat`, `fix`, `docs`, `chore`, `refactor`, `perf`, `test`) with a descriptive scope and the task ID (`[Txx]`) when applicable.
- **Append `(agent-generated)` to the end of the subject line AND to the very end of the commit message body.**

### Single-line example

```bash
git commit -m "docs(workflow): document release pipeline and agent personas (agent-generated)"
```

### Multi-line example

```bash
git commit -m "feat(money): parse and format integer cents [T02] (agent-generated)" \
  -m "- Parse human currency strings into branded integer Cents
- Format Cents with true minus (U+2212) and explicit plus signs
- Prove round-trip invariant with property tests (agent-generated)"
```

## 4. Verify Commit Log

Run `git log -n 1` after committing and verify the commit message ends with `(agent-generated)`.
