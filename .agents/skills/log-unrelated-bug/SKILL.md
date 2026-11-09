---
name: log-unrelated-bug
description: >-
  Use this skill whenever, while working on the task the user asked for, you discover a bug or defect that
  is NOT the thing you were asked to fix (e.g. a wrong row order while fixing scrolling, a clipped label
  while adjusting a layout). It keeps the current task on track by recording the unrelated bug as a
  repository GitHub issue (with repro, root cause, and a proposed fix) instead of silently fixing it or
  silently ignoring it — then the owner decides whether to ship it now or later.
---

# Log an unrelated bug

You are working on task A (what the owner asked for). While doing it you discover bug B — something real
but **not the thing you were asked to fix**. The correct move is: **log it, finish A, then let the owner
decide about B.** Do not silently fix B (it is out of scope and may need the owner's call), and do not
silently ignore it (the owner is watching the live app and will hit it anyway).

> This is not a stop-excuse. Logging the issue and _continuing task A in the same turn_ is the point —
> see `never-stop-mid-task`.

## 1. Decide: is it really unrelated?

- **Related** (part of what the owner asked, or a regression your own change caused) → **fix it now**, in
  the same PR. Do not file it as an issue.
- **Unrelated** (a pre-existing bug you merely noticed, or a defect outside the requested change) → file
  an issue and move on. Confirm it is pre-existing before logging it (e.g. stash your change and repro on
  baseline) so you do not accuse the code of a bug your own edit introduced.

## 2. File the issue (do this in the same turn as the discovery)

```bash
gh issue create --repo TandyN/simple-budget-app \
  --title "<short, owner-readable bug title>" \
  --label "bug" \
  --body-file /tmp/opencode/<slug>.issue.md
```

The body must let the owner (or the next agent) act on it **cold**. Include:

- **Repro** — the exact steps that show it (with the app state, e.g. "add 4 same-minute expenses").
- **What you saw** — the wrong behavior, ideally a concrete example ("rows read Entry 8, 7, 6, 4, 5").
- **Root cause** — the file + function if you know it (e.g. `compareNewestFirst` in `src/domain/ledger.ts`
  ties on random UUIDs). Say "suspected" if you have not fully proven it.
- **Impact** — who sees it (owner-visible UI? a flaky test? money wrong?).
- **Proposed fix** — 1–3 concrete options, so it is easy to accept.
- **Acceptance** — checkboxes that prove it is fixed (a unit test, a non-flaky e2e, etc.).
- **Found while** — one line naming the task you were doing when you noticed it (cross-references the PR).

Use an existing label if one fits (`bug` by default; do not invent labels).

## 3. Cross-reference both ways

- In the issue: "Found while working <task/PR #>".
- On the current PR (one line, in the body or a comment): "Related: #<n> — separate pre-existing bug
  noticed while verifying this change; not fixed here, tracked separately." This keeps the PR's scope
  honest and gives the owner the thread.

## 4. Keep going on the original task

Immediately return to the task the owner asked for. The issue is filed; the decision to ship it now vs.
later is the owner's. If the owner says "do it now," re-scope it as its own branch/PR (not by silently
adding it to the current PR) unless they say otherwise.

## Self-check

- [ ] Is it truly unrelated (not a regression I caused)? If it is my regression, I fixed it, not filed it.
- [ ] Did I confirm it is pre-existing before logging (repro on baseline if in doubt)?
- [ ] Does the issue body have repro + what-I-saw + root cause + impact + proposed fix + acceptance?
- [ ] Did I cross-reference the issue in the current PR, and the PR in the issue?
- [ ] Did I continue the original task in the **same turn** I filed the issue?
