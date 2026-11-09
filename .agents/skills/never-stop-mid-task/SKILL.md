---
name: never-stop-mid-task
description: >-
  Use this skill at the start of any multi-turn task in Simple Budget (fixing a bug, working a plan task,
  reviewing, releasing) and whenever the user says an agent "stops randomly," "stalls," or "ends the turn
  without finishing." It fixes the failure modes that cause premature turn ends: ending a turn on
  narration, blocking silently on long commands, bouncing questions that already have an answer, and
  ending a turn at the "understanding -> acting" boundary (the #1 observed cause).
---

# Never stop mid-task

The owner has observed agents ending the turn in the middle of a task and requiring a "continue" nudge.
That is a behavior bug, not an accident. Fix it with the rules below. Read this skill at the **start
of every multi-turn session** (before the first tool call) and again any time the user reports a stall.

**Meta-rule (the root of most stalls):** a turn's last act must be a **tool call or the final user-facing
summary** — never a _receptive_ or _reporting_ step. The stops that actually happen are at the boundary
between _understanding_ and _acting_: the turn ends right after reading a file, reading the user's
message, polling a job, or posting a comment, and the next action is deferred to the _next_ turn. That
deferred action is where the stop happens. **Never do that.**

## 1. Never end a turn on narration

A turn ends when the assistant's message contains **no tool call**. Narration alone ("I'll now read the
CSS", "Let me look at the tests", "Next I will…") is the #1 cause of random stops.

- **Rule:** the last thing in any assistant turn that is not the final user-facing summary **must be a
  tool call**, not a sentence describing the next tool call.
- **Practical:** if you are going to read a file in your next step, _call the read tool now in the same
  turn_. Batch reads/edits in one message; never end a turn describing what you are about to do.
- **If you catch yourself writing "I will now…" as the last line of a response, delete it and make the
  tool call instead.**
- Long tasks: every few tool calls, emit a _one-line_ progress line (what completed, what is next) **and
  keep going** with the next tool call in the same turn. Do not let progress lines become turn-enders.

## 2. Never block silently on long commands

`pnpm verify`, `bash scripts/verify.sh`, `gh pr checks --watch`, `gh run watch`, e2e suites, and
`pnpm release:deploy` can run for several minutes. A silent block looks like a stall and may trip the
host's idle timeout, killing the turn.

- **Before running any command expected to exceed ~60 s:** say one line naming the command, the estimated
  duration, and the next action you will take when it returns. _Then make the call in the same turn._
- **Run long commands with an explicit timeout** (use the `timeout` parameter of the `bash` tool). Pick a
  ceiling slightly above the known worst case. On timeout, re-queue the command and report what you saw —
  do not end the turn.
- **CI watching:** prefer `gh pr checks <n> --watch --repo TandyN/simple-budget-app` inside the `bash`
  tool with a `timeout` of ~30 min. On timeout, re-check `gh pr checks <n> --repo TandyN/simple-budget-app`
  and continue watching if still running, or diagnose if red.
- **Releases / deploys:** same pattern around `gh run watch <id>` — explicit timeout, re-poll on timeout,
  never a silent multi-minute gap.
- **If the command genuinely cannot finish in a reasonable time** (e.g., a hung Playwright browser), kill
  it, report what hung, and propose the fix — do not silently wait for it to resolve.

## 3. Never bounce questions that already have an answer

The `question` tool is for **genuine blockers** — things the owner alone can decide. AGENTS.md, the plan,
`docs/`, and linked skills already answer most "what do you mean?" questions. The pattern of "I'll ask how
to size the page" is a stall, not diligence.

- **Default:** state the interpretation you will use, name the source (AGENTS.md rule, plan task, design
  doc), and proceed. Do not open a question turn around it.
- **Real blocker test:** "If I pick the wrong answer, does money, data, or the owner-visible UI break in a
  way the owner must choose?" If yes — ask. If no — pick the plan default and go.
- **On ambiguity:** use the exact wording from AGENTS.md §"Working with you": state the interpretation,
  the plan default you are leaning on, and continue building in the same turn.

## 4. Never end a turn at the "understanding -> acting" boundary

This is the **most common real stop** observed, and it is _not_ narration — the turn simply ends after
a receptive/reporting step and before the first productive action.

Observed turn-enders (all were stops the owner had to nudge):

| Ended right after…                        | Next step that got deferred (caused the stop) |
| ----------------------------------------- | --------------------------------------------- |
| a large parallel **read batch**           | analysis + first edit                         |
| **reading the user's multi-part message** | create todos + start implementing             |
| a **poll** of a background job (`tail`)   | act on the result                             |
| **posting a comment** to a GH issue       | continue the actual task                      |

- **Rule:** receptive/reporting steps (reading files, reading the user's message, polling a job, posting
  a comment) are **not** turn-ending actions. If the next logical step is productive (edit, create, test,
  implement, commit), **that action is the first tool call in the _same_ turn** — not the first action in
  the next turn.
- **Practical:** after any "I now understand" moment, immediately pair it with the action: same message,
  e.g. `read(user message) + todowrite(plan)`, or `read(file) + edit(file)`. Never `read(message)` alone.
- **Do not over-think before acting.** The host caps turn time/thinking ("after ~2 minutes of thinking"
  it cuts off). Long reasoning is the fuel for this stop: think _enough_ to act, then act. If you are
  still reasoning as the turn budget runs out, **stop reasoning and emit the first tool call** — momentum
  beats a perfect plan. A short "my plan is X" line is enough; the action follows in the same turn.

## Recovery: if the user says an agent stopped

1. **Diagnose honestly.** Say in one line which pattern it was (narration-only turn, silent long wait,
   over-asked question, or the understanding→acting boundary). No excuses.
2. **Re-enter the task at its last real state:** `git status`, the last log, the last tool call.
3. **Resume with a tool call, not a status sentence.** Pick up from the failing step and keep going.
4. **If the stop is reproducible** (same command hangs every time, same screen asks the same question),
   update the relevant skill in `.agents/skills/` in the same PR — usually `verify-before-commit`,
   `ship-and-verify-release`, or this file. The fix is a durable one, not a per-session hand-wave.

## Self-check before ending a non-final turn

Before your next response, ask:

- [ ] Does my last line end with a tool call, not a sentence describing the next tool call?
- [ ] Am I about to run a command over ~60 s? If yes, have I named the command + duration + next action
      first, and set a `timeout` on the call?
- [ ] Am I about to ask a question that is already answered in AGENTS.md / plan / linked doc? If yes, drop
      the question and pick the plan default.
- [ ] Did I just finish a receptive/reporting step (read a file or the user's message, poll a job, post a
      comment)? If the next step is productive, did I pair it with a tool call in _this_ turn? If not, do
      it now.
- [ ] Am I over-thinking? If the plan is good enough, emit the first tool call instead of more reasoning.
- [ ] If any of the above is "no," fix it in _this_ turn before the assistant message ends.
