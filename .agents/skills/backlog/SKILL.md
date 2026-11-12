---
name: backlog
description: Use when an agent finds an unrelated, non-blocking bug while working or reviewing. Defines the dedupe-first, file-or-comment flow: search for an existing Back Log entry, comment on it if found, otherwise file a new Bug: issue with Status: Back Log as an independent (non-sub-issue) ticket.
---

# Back Log

The **Back Log** is where an **unrelated, non-blocking** bug found while working
or reviewing goes. It is a **`Status` option** on the board (not a tracker issue
and **not** a sub-issue of any story). This skill is **role-agnostic**: any agent
(senior-software-engineer, staff-software-engineer, qa, docs-agent, ...) that
stumbles on such a bug follows it.

## When to use

Use this flow **only** for a bug that is:

- **unrelated** to the current story/task, and
- **non-blocking** — not required for, and not blocking, the work in front of you.

A bug that **is** in-scope or **is** blocking for the current story is **not** a
Back Log item — it is a `Bug:` ticket **linked as a sub-issue of the story** (see
the `board` skill's "Where a bug goes").

### Applies to BOTH verdicts (approval **and** rejection)

This rule is **not** only for rejections. **Any reviewer** — whether they
**APPROVE** or **REJECT** — who raises a **non-blocking finding** that will not
be worked in the current story MUST give it a **stated disposition** in their
signed verdict comment, so it is never left as an untracked mention:

- `→ Back Log` — the reviewer flags it and routes it to the **project-manager**
  (via the orchestrator), who files it here (dedupe-first) so it is captured and
  traceable; **or**
- `→ in-story task` — it is being worked as a sub-issue of the current story.

A bare "recommend a Back Log entry" with **no ticket and no explicit handoff is
NOT sufficient** — the finding is only considered handled once a Back Log item
exists (or an in-story ticket does). The reviewer who flags it is responsible for
making the disposition explicit; the **project-manager** owns actually creating
the Back Log ticket from a flagged finding.

## Why a `Status` option (not a sub-issue)

- A Back Log item is an **independent issue** — it is **NOT** a sub-issue of any
  story, so it sits **outside** a story's "all sub-issues Done" gate.
- The **orchestrator's done-criteria treats `Status: Back Log` as
  done-equivalent** (parked/resolved, not a blocker). It is therefore excluded
  from the story done gate.
- The GitHub issue stays **OPEN** with `Status: Back Log` — it remains visible
  and re-filable. Do **not** close it.

## Procedure (dedupe first)

1. **Dedupe before filing.** Search the repo's open issues for a matching bug:

   ```
   gh search issues --repo <owner>/<repo> --state open "<normalized-keyword>"
   ```

   There is **no exact semantic-match API**. Use a **heuristic keyword**: the
   bug's key identifier — **file/component + symptom** (e.g. `budget
   recurring`, `activity ordering`, `save race`). Normalize (lowercase, drop
   stopwords) so the search is not brittle.

2. **A match with `Status: Back Log` already exists** → do **not** create a
   duplicate. Leave a **signed comment** on the **existing** issue (sign per the
   `comment-signature` skill) adding your new findings, and stop.

3. **No match exists** → create a new **`Bug:`-titled** issue (per the `board`
   skill's title convention), add it to the board with **`Status: Back Log`**,
   and keep it **independent — do NOT link it as a sub-issue of any story**.

4. **Match is ambiguous** (the search is inconclusive — a near-miss, a different
   symptom, or you can't tell) → do **not** guess. Escalate to the
   **project-manager / a human** for confirmation before filing or commenting.

## Golden rules

- **Dedupe first.** Never create a second Back Log entry for a bug that is
  already parked; comment on the existing one instead.
- **Independent, not a sub-issue.** Back Log items are never sub-issues of an
  story, so they never block a story's done-criteria.
- **Done-equivalent.** The orchestrator treats `Status: Back Log` as done and
  ignores it in the "all sub-issues Done" gate.
- **Issue stays OPEN.** Parked, not closed.
- **Signed.** Every comment you leave (dedupe or new) is signed per the
  `comment-signature` skill.
- **Non-blocking only.** In-scope or blocking bugs are `Bug:` sub-issues of the
  story, not Back Log items.
