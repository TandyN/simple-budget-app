# Simple Budget — agent instructions

This repository uses a single, canonical agent-instructions file: **`AGENTS.md`** at the repo
root. Read and follow it in full before doing anything, and use the workflow skills it points to
under `.agents/skills/`.

The non-negotiables, in short:

- Do the due diligence and **ship the full loop**: implement → test locally → open a PR →
  independent review → hand to the tech lead.
- **Agents never merge their own work** (nor another agent's). An independent reviewer subagent
  audits the PR, does hands-on QA on both iPhone Duo layouts, and returns a verdict; the **tech
  lead** does the final review and is the one who merges to `main` and ships to production.
- Ask only on genuine blockers; otherwise state your interpretation, pick the plan default, and proceed.

For the complete list of golden rules, the glossary, the command list, and the review/ship
workflow, see `AGENTS.md`.
