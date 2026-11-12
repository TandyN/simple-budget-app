---
name: config-reload
description: Use after an agent commits a change to opencode config that loads only at startup (.opencode/agents, .opencode/command, .agents/skills). The change is inert until opencode restarts, so the agent MUST prompt the user to restart opencode and never assume the change is live. Role-agnostic: any agent that touches these files follows it.
---

# Config Reload

opencode reads its agent/command/skill config **once at server startup** — there is
no hot-reload. This skill is **role-agnostic**: any agent (software-engineer,
project-manager, ...) that makes a change to one of these files follows it.

## When it applies

It applies to any change to opencode config that opencode loads once at startup
and does **NOT** hot-reload:

- `.opencode/agents/*.md` — agent personas
- `.opencode/command/*.md` — commands
- `.agents/skills/**` — skills

A change to any of these files is **inert until opencode is restarted**. Until
then, the running session is using the **pre-change** config (the stale in-memory
copy from startup).

## The rule

After an agent commits changes to any of the files above, it **MUST** tell the
orchestrator/user that **a restart of opencode is required** for the change to take
effect — and that until then the running session is still using the old config.

**Do not assume the change is live.** It is committed and correct, but the current
opencode process does not see it until restarted.

## Why

opencode loads these files once at server startup (no hot-reload). A stale in-memory
copy means an edit made mid-session is not picked up until restart. This is the root
cause of the **stale subagent-roster / stale-skill** symptom: a role file or skill
added/edited while the server was running was not exposed (or was exposed with stale
text) until the server restarted.

## What to say

Surface this to the user (fill in the concrete file/area you changed):

> Restart opencode (quit and relaunch from this repo) — I changed
> `<agent|command|skill>` config (e.g. `<path>`), which only loads at startup.
> The change is committed but **not active in the current session** until you
> restart.

## Not applicable (no restart needed)

These changes take effect with no restart:

- **Plain code or app source** (e.g. the budget app, `project-plan/`) — opencode
  does not cache these at startup.
- **`agent-docs/`** — just documentation; it is not loaded into the running
  process.

Only the three startup-loaded surfaces above (`.opencode/agents`,
`.opencode/command`, `.agents/skills`) require a restart prompt.

## Note

This skill is a **prompt** mechanism (tell the user to restart), **not** an
auto-restart. The agent surfaces the requirement; the human performs the restart.

## Golden rules

- **Prompt, don't assume.** After committing a change to a startup-loaded config
  file, always tell the user a restart is required and that the current session is
  still on the old config.
- **Cite the surface.** Name the specific agent/command/skill file(s) you changed.
- **Only the startup-loaded surfaces.** Code, app source, and `agent-docs/` do not
  need a restart prompt.
- **Prompt, not auto-restart.** Never restart opencode yourself; ask the user to do
  it.
