---
name: conventional-commits
description: Use whenever creating, amending, or drafting a git commit message. Enforces the Conventional Commits format and requires appending an (agent-generated) marker to agent-authored commits.
---

# Conventional Commits

Every commit message follows Conventional Commits: `<type>(<optional scope>): <summary>`.
Pick the type that fits (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`), add an optional scope for the affected area, and
write a short imperative summary (no trailing period). You may add an optional body
(a blank line, then wrapped paragraphs explaining *why*) and an optional footer (issue
references).

## Examples

```
feat(ledger): stable ordering for same-instant activity lines (#21) (agent-generated)
fix(layout): stable full-height activity box, no scroll (folded + unfolded) (agent-generated)
chore(release): v0.9.5 [skip ci] (agent-generated)
```

## Golden rules

- **Agent-generated marker (required).** Every commit you author as an agent MUST
  end its summary line with the literal marker ` (agent-generated)`, so agent and
  human commits are easy to tell apart in `git log`. This has no exceptions — it
  applies to `revert`, release, `chore`, and everything else. Human-authored commits
  carry no marker.
- **Breaking changes** are marked with `!` after the type or scope plus a
  `BREAKING CHANGE:` footer, e.g. `feat(api)!: drop legacy endpoints (agent-generated)`.
