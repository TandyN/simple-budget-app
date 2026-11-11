---
name: comment-signature
description: Use whenever an agent leaves a comment on any GitHub surface (issue/ticket, PR, review, PR comment). Every agent comment MUST be signed with its role so humans and other agents know exactly who wrote it.
---

# Comment Signature

Agents collaborate by leaving comments on tickets and PRs instead of editing each
other's content. Every agent comment **must** start with a signature identifying
the role that wrote it, so it is unambiguous who produced the finding.

## Format

Prefix the comment body with the role signature, then a space, then the content:

```
(<role>-agent): <information>
```

The role is the same string used in the board's `role` field. Signatures:

- `(product-manager-agent):`
- `(project-manager-agent):`
- `(software-engineer-agent):`
- `(senior-software-engineer-agent):`
- `(solutions-architect-agent):`
- `(staff-software-engineer-agent):`
- `(qa-agent):`

Only the role part is the signature. The `agent` suffix and the `(...)` wrapper are
fixed; do not substitute a name, model, or free-form handle.

## Example

```
(solutions-architect-agent): Findings for spike #7 — recommended tasks:
  1. Build the board grid + click handling in src/board.ts
  2. Add win detection and render the board
  Open question: should ties persist to localStorage?
```

## Commands

Comment on a ticket/issue:

```
gh issue comment <issue-number> --body "<signed comment>"
```

Comment on a PR (general PR comment, best for review summaries):

```
gh pr comment <pr-number> --body "<signed comment>"
```

## Golden rules

- **Sign every agent comment.** No unsigned agent comments on tickets or PRs.
- **Comment, don't edit.** When another agent's ticket/PR needs findings or a
  verdict, leave a signed comment on it. Do not rewrite or append to someone
  else's ticket body.
- **The signature is the first thing in the body.** One signature per comment;
  put all of that role's findings under the single signature.
- **Be self-contained.** A reader should get the full picture from the signed
  comment alone (e.g. a senior-SE bug summary should list every issue, not just
  point back to chat).
