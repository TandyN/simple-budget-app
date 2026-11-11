---
name: board
description: GitHub Projects board operations. Use whenever creating, linking, or updating board items (epics, sub-issues, status, role). All agents follow this skill.
---

# Board

All agents (orchestrator, product-manager, project-manager, software-engineer,
senior-software-engineer, staff-software-engineer, qa, docs-agent,
solutions-architect) drive the same GitHub Projects board. This skill is
**repo-agnostic**: it discovers IDs from the current repository.

## Ticket types

- **Spike ticket** (`role: solutions-architect`) — research. The
  solutions-architect investigates a problem, produces a plan / clarifies what is
  needed, and moves its own spike ticket to `Done`. No code, no PR. Spikes are
  always done **before** the tasks they unblock.
- **Task ticket** (`role: software-engineer`) — implementation. One specific,
  self-contained job for one software-engineer, ending in a PR. Task tickets that
  depend on other work are linked via **blockers** (below).

A sub-issue is always either a spike or a task, never both.

## Feature branch (per epic)

Each epic has ONE **feature branch** (`feature/epic-<epic-number>-<slug>`), off
`main`. The **project-manager creates it** once it has finished decomposing the
epic and declares readiness. All task tickets for that epic are implemented on
branches cut from the feature branch and merged **into the feature branch** (not
`main`). `main` is production and is only changed by the final **feature PR**
(feature branch → `main`), which opens only after all tasks are `Done`, the
staff-software-engineer's final holistic review passes, QA approves, and the
docs-agent pass approves.

## Discover IDs (run once per session)

> Parse JSON with `jq` if available, otherwise `python3`. The patterns below
> assume `jq`; substitute `python3 -c` if `jq` is not installed.

```bash
# Repo owner + name (from git remote)
REPO=$(gh repo view --json owner,name -q '.owner.login + "/" + .name')
REPO_OWNER=$(echo "$REPO" | cut -d/ -f1)
REPO_NAME=$(echo "$REPO" | cut -d/ -f2)

# Repository node ID
REPO_ID=$(gh api graphql -f query='query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }' -f owner="$REPO_OWNER" -f name="$REPO_NAME" -q '.repository.id')

# Board name = <repo-name>-agent-board
BOARD_NAME="${REPO_NAME}-agent-board"

# Project ID + number
PROJECT_JSON=$(gh project list --owner "$REPO_OWNER" --format json)
PROJECT_ID=$(echo "$PROJECT_JSON" | jq -r '.projects[] | select(.title=="'"$BOARD_NAME"'") | .id')
PROJECT_NUM=$(echo "$PROJECT_JSON" | jq -r '.projects[] | select(.title=="'"$BOARD_NAME"'") | .number')

# Field IDs
FIELDS_JSON=$(gh project field-list "$PROJECT_NUM" --owner "$REPO_OWNER" --format json)
STATUS_FIELD_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .id')
ROLE_FIELD_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .id')

# Status option IDs
TODO_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Todo") | .id')
IN_PROGRESS_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="In Progress") | .id')
REVIEW_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Review") | .id')
DONE_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Done") | .id')

# Role option IDs
PM_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="project-manager") | .id')
SE_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="software-engineer") | .id')
SENE_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="senior-software-engineer") | .id')
SA_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="solutions-architect") | .id')
PRODPM_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="product-manager") | .id')
SSE_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="staff-software-engineer") | .id')
QA_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="qa") | .id')
DOCS_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="docs-agent") | .id')
```

If the board doesn't exist, create it:

```bash
gh project create --owner "$REPO_OWNER" --title "$BOARD_NAME" --format json
```

Then ensure the `Status` field (options: Todo, In Progress, Review, Done) and the
`role` field (options: product-manager, project-manager, software-engineer,
senior-software-engineer, staff-software-engineer, solutions-architect, qa,
docs-agent) exist via `gh project field-create`.

## Commands (use the discovered IDs)

### Create a real GitHub Issue

```
gh api graphql -f query='
mutation {
  createIssue(input: { repositoryId: "<REPO_ID>", title: "<title>", body: "<body>" })
  { issue { id number } }
}'
```

### Add an issue to the board

```
gh api graphql -f query='
mutation {
  addProjectV2ItemById(input: { projectId: "<PROJECT_ID>", contentId: "<issue-node-id>" })
  { item { id } }
}'
```

### Link a sub-issue to its epic (use node IDs)

```
gh api graphql -f query='
mutation {
  addSubIssue(input: { issueId: "<epic-node-id>", subIssueId: "<sub-issue-node-id>" })
  { subIssue { id number } }
}'
```

### Link a blocker (task depends on another ticket)

Use **issue node IDs**. `<blocked>` is the ticket that cannot start yet;
`<blocker>` is the ticket it waits for. A ticket is **ready** only when none of
its `blockedBy` are still open.

```
gh api graphql -f query='
mutation {
  addBlockedBy(input: { issueId: "<blocked-node-id>", blockingIssueId: "<blocker-node-id>" })
  { issue { number } }
}'
```

Remove a blocker when it no longer applies:

```
gh api graphql -f query='
mutation {
  removeBlockedBy(input: { issueId: "<blocked-node-id>", blockingIssueId: "<blocker-node-id>" })
  { issue { number } }
}'
```

### Read a ticket's blockers (to find the ready set)

```
gh api graphql -f query='
query {
  node(id: "<ticket-node-id>") {
    ... on Issue {
      number
      state
      blockedBy(first: 20) { nodes { number state } }
    }
  }
}'
```

A ticket is in the **ready set** when every `blockedBy` node is `state: CLOSED`
(i.e. all its blockers are Done). Spikes (research) are never blockers of each
other unless explicitly linked; they must finish before the tasks they unblock.

### Set a field value (status or role)

```
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "<PROJECT_ID>",
    itemId: "<board-item-id>",
    fieldId: "<STATUS_FIELD_ID or ROLE_FIELD_ID>",
    value: { singleSelectOptionId: "<option-id>" }
  }) { clientMutationId }
}'
```

> `itemId` is the **board item id** (from `addProjectV2ItemById` → `item.id`),
> not the issue node id. `singleSelectOptionId` is a **String**, not an ID.

### List items / fields

```
gh project item-list <PROJECT_NUM> --owner <REPO_OWNER> --format json
gh project field-list <PROJECT_NUM> --owner <REPO_OWNER> --format json
```

### Create the epic feature branch (project-manager)

```
git checkout main && git pull
git checkout -b feature/epic-<epic-number>-<slug>
git push -u origin feature/epic-<epic-number>-<slug>
```

### Open a task PR (task ticket → feature branch)

The PR merges into the epic's **feature branch** (not `main`). The body MUST
reference **both** the task ticket and the epic so both issues stay linked.

```
gh pr create --base feature/epic-<epic-number>-<slug> --head feature/<task-number>-<slug> \
  --title "<summary>" \
  --body "Closes #<task-number>
Part of #<epic-number>"
```

### Open the feature PR (feature branch → main) — only after all tasks Done

```
gh pr create --base main --head feature/epic-<epic-number>-<slug> \
  --title "<epic title>" \
  --body "Part of #<epic-number>
Closes #<epic-number>"
```

## Golden rules

- **Dependency order.** A ticket is only spawned when it is in the **ready set**
  (all its `blockedBy` are `Done`). Spikes usually go first because tasks are
  blocked on them, but the rule is blockers, not ticket type. Spikes and tasks
  can block each other.
- A **task ticket** is implemented by ONE software-engineer (one specific task).
  It moves `In Progress → Review` when its PR is opened. It reaches `Done` only
  after the **senior-software-engineer approves** and the SE merges the PR into
  the epic feature branch.
- A **spike ticket** is done by the solutions-architect, produces a plan/report,
  and moves itself to `Done`. No code, no PR.
- **One feature branch per epic.** All task PRs merge into the epic feature
  branch. **Nothing task-related ever merges directly into `main`.**
- **Merge ownership:**
  - Task PR (→ feature branch): reviewed/approved by the
    **senior-software-engineer**, then merged by the **software-engineer**.
  - Feature PR (→ `main`): opened and merged by the **staff-software-engineer**,
    only after its final holistic review **and** QA **and** the docs-agent pass
    all approve. (The orchestrator relays the approvals to the
    staff-software-engineer; it does not merge itself.)
- **QA runs ONCE, on the epic** (the feature PR), after all tasks are `Done` and
  staff-software-engineer has done a final holistic review. QA does not run per
  task.
- **The docs-agent runs ONCE per epic, after QA approves and before the feature
  PR merges to `main`.** It fixes `agent-docs/` in the feature PR.
- **Only the orchestrator spawns subagents.** A subagent that needs another role
  reports back; the orchestrator spawns that role.
- **Blockers must be linked** with `addBlockedBy` when a ticket depends on
  another.
- **`main` is production.** Only the feature PR touches it, and only after
  approval.
- An **epic** is a tracking issue created by the product-manager. It reaches
  `Done` only when **every** sub-issue under it is `Done` and the feature PR is
  merged.
- Every sub-issue MUST be linked to its parent epic via `addSubIssue` before
  being added to the board.
- Every PR body MUST reference its ticket and the epic (`Closes #<n>` +
  `Part of #<epic>`) so the epic's "Linked pull requests" field populates.
- Commit messages MUST reference the task ticket number.
- One task ticket → one PR (into the feature branch).
- The board is the single source of truth for state — always reflect state via `Status`.
