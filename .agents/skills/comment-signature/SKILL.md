---
name: comment-signature
description: Use whenever an agent creates or comments on any GitHub surface (issue/ticket body, PR body, review, PR comment). Every agent work product — comment, issue body, or PR body — MUST be signed with its role so humans and other agents know exactly who produced it, and every agent MUST end with a signed summary/verdict comment.
---

# Comment Signature

Agents collaborate by leaving comments on tickets and PRs instead of editing each
other's content. Every agent **work product** — a comment, the body of an issue or
ticket it creates, or the body of a PR it opens — **must** start with a signature
identifying the role that produced it, so it is unambiguous who produced it.

## General principle

> Every agent's work product (issue body, PR body, PR comment) **MUST be signed**
> so the reader always knows which agent produced it. Every agent **MUST leave a
> summary/verdict comment as its final action** on the artifact it worked on, so
> context is never lost.

## Format

Prefix the signed body with the role signature, then a space, then the content:

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
- `(docs-agent-agent):`

Only the role part is the signature. The `agent` suffix and the `(...)` wrapper are
fixed; do not substitute a name, model, or free-form handle.

## Example

```
(solutions-architect-agent): Findings for spike #7 — recommended tasks:
  1. Build the board grid + click handling in src/board.ts
  2. Add win detection and render the board
  Open question: should ties persist to localStorage?
```

## Body attribution (issues, tickets, PRs)

The same signature rule applies to the **body** of any work product an agent
creates. When a role opens or authors an issue, ticket, or PR, the body MUST begin
with **that role's** signature. The signature is the first line of the body,
followed by the role's summary. Every other part of the body (sections, links,
`Closes #n`) stays as-is.

> **Which role signs** is role-specific policy — each role's persona under
> `.opencode/agents/` states what it signs and where. This skill only defines the
> format.

## Summary / verdict comments

As the **LAST action** a role takes on a work product (before reporting back), it
MUST leave one signed summary/verdict comment on the appropriate surface, so the
context is never lost. One signature per comment. A rejection's comment MUST list
**every issue** it blocks on, so a reader gets the full picture from the signed
summary alone.

> **Who leaves the summary and on which surface** (a task PR, the feature PR, the
> spike ticket, the epic ticket) is role-specific policy that lives in each role's
> persona. This skill only defines that the summary must be signed and
> self-contained.

## PR body format

A PR body (task PR or feature PR) starts with the opening role's signature, then a
summary, then sections, then the ticket links:

```
(<role>-agent): <1-2 sentence summary>

## Changes
- <file/area>: <what changed>
- ...

## Reasoning
<why this approach>

## Verification
<how it was tested/verified>

Closes #<ticket-number>
Part of #<epic-number>
```

(For a feature PR, the sections are the epic's `Part of` / `Closes` references and
a holistic-review summary instead of per-task `Changes` / `Verification`.)

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

- **Sign every agent work product.** No unsigned agent comments, issue bodies, or
  PR bodies on tickets or PRs. The body signature is the first line of the body.
- **Comment, don't edit.** When another agent's ticket/PR needs findings or a
  verdict, leave a signed comment on it. Do not rewrite or append to someone
  else's ticket body.
- **The signature is the first thing in the body.** One signature per comment;
  put all of that role's findings under the single signature.
- **End with a summary/verdict.** As the last action on the artifact, leave one
  signed summary/verdict comment (see **Summary / verdict comments**). Rejections
  list every issue; a reader gets the full picture from it alone.
- **Be self-contained.** A reader should get the full picture from the signed
  comment alone (e.g. a senior-SE bug summary should list every issue, not just
  point back to chat).
