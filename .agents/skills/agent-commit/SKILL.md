---
name: agent-commit
description: >-
  Use this skill whenever creating or amending a git commit in Simple Budget. It enforces the mandatory
  "(agent-generated)" suffix on every agent commit, verifies the "# Human Description" section in README.md
  was never touched, and confirms the repository remote is TandyN/simple-budget-app.
---

# Agent Commit

Every commit made by an agent must be immediately distinguishable from a human commit and must respect human-only files.

## 1. Pre-Commit Checks

1. Run `bash scripts/verify.sh` (via the `verify-before-commit` skill) and ensure it passes 100%.
2. Confirm `# Human Description` at the top of `README.md` (everything above `# Simple Budget`) is completely untouched.
   `scripts/check-docs.sh` checks this automatically.
3. Confirm `git status` has no untracked build artifacts (`dist/`, `test-results/`, `playwright-report/`, `*.tsbuildinfo`).

## 2. Commit Message Format

- Use Conventional Commits (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`) with the task ID when applicable.
- **Append `(agent-generated)` to the end of the subject line AND to the very end of the commit message body.**

### Single-line example

```bash
git commit -m "docs(workflow): document release pipeline and agent personas (agent-generated)"
```

### Multi-line example

```bash
git commit -m "feat(domain): add integer cents money parser and formatter [T02] (agent-generated)" \
  -m "- Parse human currency strings into branded integer Cents
- Format Cents with true minus (U+2212) and explicit plus signs
- Prove round-trip invariant with property tests
Verified: scripts/verify.sh green. (agent-generated)"
```

## 3. Verify Commit Log

Run `git log -n 1` after committing and verify the commit message ends with `(agent-generated)`.
