---
name: review-pr
description: >-
  Use this skill to perform an independent code review of a Pull Request in TandyN/simple-budget-app
  (either as a dedicated reviewer subagent or before merging a PR). It checks golden rules, zero extra runtime
  dependencies, human-readable test quality, doc accuracy, and posts a review comment on GitHub.
---

# Review Pull Request

Act as an independent, rigorous staff engineer reviewing a Pull Request on `TandyN/simple-budget-app`.

## 1. Inspect the PR

```bash
gh pr view <pr-number> --repo TandyN/simple-budget-app
gh pr diff <pr-number> --repo TandyN/simple-budget-app
```

## 2. Review Checklist

Evaluate every item below against the diff:

1. **Human Description Untouched:** Did the PR leave the `# Human Description` section at the top of `README.md` (above `# Simple Budget`) 100% untouched?
2. **Agent Commit Signature:** Does every agent-authored commit in the PR end with `(agent-generated)`?
3. **Zero Extra Runtime Dependencies:** Does `package.json` `"dependencies"` contain **only** `react` and `react-dom`?
4. **Money & Calendar Rules:** Are all money values integer `Cents` (no float math) and all dates plain `"YYYY-MM-DD"` / `"YYYY-MM"` strings (no `Temporal`, no timestamp drift)?
5. **Pure Domain:** Is `src/domain/` (planned until T02) free of React, DOM, and storage imports?
6. **Readable Tests (`docs/testing.md`):** Can the owner read every new or changed test and immediately see what behavior is tested and how (human money strings like `'$5,000.00'`, arithmetic comments above assertions, role-based locators only)?
7. **Documentation Accuracy:** Are `AGENTS.md`, `docs/`, and `docs/plan/` updated in the same PR so `bash scripts/check-docs.sh` passes?

## 3. Post the Review on GitHub

Post a structured review comment on the PR:

```bash
gh pr comment <pr-number> --repo TandyN/simple-budget-app --body "## Automated Agent Code Review (agent-generated)
- [x] Human Description in README.md untouched
- [x] Commits marked (agent-generated)
- [x] Zero extra runtime dependencies (react + react-dom only)
- [x] Golden rules & readable tests verified
- [x] Documentation 100% accurate

**Verdict:** Approved for release."
```

If any check fails, document the exact file and line in the PR comment and block merging until fixed.
