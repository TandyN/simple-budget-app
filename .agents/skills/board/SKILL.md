---
name: board
description: GitHub Projects board operations. Use whenever creating, linking, or updating board items (stories, sub-issues, status, role). All agents follow this skill.
---

# Board

Every agent drives the same GitHub Projects board. This skill is **repo-agnostic**
(it discovers IDs from the current repository) and **role-agnostic** (it describes
how to operate the board, not which role does what — role-specific policy lives in
each role's persona under `.opencode/agents/`).

## Ticket types

- **Spike ticket** (`role: solutions-architect`) — research: investigate a
  problem, produce a plan / clarify what is needed, and move the ticket to `Done`.
  No code, no PR. Spikes are done **before** the tasks they unblock.
- **Task ticket** (`role: software-engineer`) — implementation: one specific,
  self-contained job, ending in a PR. Task tickets that depend on other work are
  linked via **blockers** (below).

A sub-issue is a spike, a task, or a `Bug:` (see the title convention below), never
a mix.

## Ticket title convention

Every ticket title MUST begin with a **type prefix** so a reader knows the ticket
type at a glance. The prefix is part of the title, before a space:

| Ticket type | Title starts with |
| ----------- | ----------------- |
| Story | `Story: <title>` |
| Spike | `Spike: <title>` |
| Task | `Task: <title>` |
| Bug | `Bug: <title>` |

The ticket's creator sets the prefix (a story is `Story:`, a sub-issue is `Spike:`,
`Task:`, or `Bug:`). A ticket whose title lacks the correct prefix is
non-conforming.

**Where a bug goes:** an **in-scope / blocking** bug found during review becomes a
`Bug:` ticket **linked as a sub-issue of the story** (the finding is recorded as a
`Bug:`; the fix itself is a `Task:` worked in the same story flow). An
**unrelated, non-blocking** bug goes to the **Back Log** instead — follow the
`backlog` skill for the dedupe-first / file-or-comment flow — and is **not** a
sub-issue of the story.

**Back Log semantics:** a Back Log item is a **parked, independent issue** —
never a sub-issue of any story. It is **done-equivalent** for the story's
done-criteria (parked/resolved, not a blocker), so it sits outside the story's
"all sub-issues Done" gate. The GitHub issue stays **OPEN** with `Status: Back
Log`. See the `backlog` skill.

**`wontfix` label flow:** to mark a ticket as "we will not do this, for whatever
reason" (a **terminal decision not to do** it), apply the GitHub **`wontfix`
label** to the issue (confirm it exists; create it if missing), add a **signed**
comment explaining **why** it is no longer being done, and **close** the issue.
This is distinct from `Back Log` (parked, *might do later*, done-equivalent, and
the issue stays **OPEN**) — `wontfix` is a **closed, decided-not-to-do** issue.
Like `Back Log` it sits **outside** the story's "all sub-issues Done" gate (a
closed, wontfix issue is not a blocker).

## Feature branch (per story)

Each story has ONE **feature branch** (`feature/<story-number>-<slug>`), off
`main`. It is created once the story is decomposed and declared ready. All task
tickets for that story are implemented on branches cut from the feature branch and
merged **into the feature branch** (not `main`). `main` is production and is only
changed by the final **feature PR** (feature branch → `main`), which opens only
after all tasks are `Done` and the final reviews (holistic story review, QA, and
the docs pass) approve.

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
BACKLOG_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Back Log") | .id')

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

If the board doesn't exist, create it — **create, then link** to the repo:

```bash
# A Projects v2 board is owner-scoped by default; connecting it to the repo is
# the separate `gh project link` step (create alone does NOT link it).
CREATE_JSON=$(gh project create --owner "$REPO_OWNER" --title "$BOARD_NAME" --format json)
NEW_PROJECT_NUM=$(echo "$CREATE_JSON" | jq -r '.number')
gh project link "$NEW_PROJECT_NUM" --owner "$REPO_OWNER" --repo "$REPO"
```

> **Board ↔ repo connection (the `link`) ≠ item connection.** `gh project link`
> associates the board with the repository (visible under the repo's
> Projects). Adding tickets to the board is the separate
> `addProjectV2ItemById` step. Both are required, and they are different things.

Then ensure the `Status` field (options: Todo, In Progress, Review, Done,
Back Log) and the `role` field (options: product-manager,
project-manager, software-engineer, senior-software-engineer,
staff-software-engineer, solutions-architect, qa, docs-agent) exist via
`gh project field-create`.

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

### Link a sub-issue to its story (use node IDs)

```
gh api graphql -f query='
mutation {
  addSubIssue(input: { issueId: "<story-node-id>", subIssueId: "<sub-issue-node-id>" })
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

### Create the feature branch

```
git checkout main && git pull
git checkout -b feature/<story-number>-<slug>
git push -u origin feature/<story-number>-<slug>
```

### Open a task PR (task ticket → feature branch)

The PR merges into the story's **feature branch** (not `main`). The body MUST
reference **both** the task ticket and the story so both issues stay linked, and
MUST be **signed** with a summary by the role opening it (see the full format in
the `comment-signature` skill).

```
gh pr create --base feature/<story-number>-<slug> --head feature/<task-number>-<slug> \
  --title "<summary>" \
  --body "(<role>-agent): <summary of changes>
Closes #<task-number>
Part of #<story-number>"
```

### Open the feature PR (feature branch → main) — only after all tasks Done

The body MUST be **signed** with a holistic summary by the role opening it (see
the full format in the `comment-signature` skill).

```
gh pr create --base main --head feature/<story-number>-<slug> \
  --title "<story title>" \
  --body "(<role>-agent): <summary of the story>
Part of #<story-number>
Closes #<story-number>"
```

## Golden rules

> These are the **mechanics** of the board. **Role-specific policy** — which role
> spawns, which role creates a branch, who approves a task PR, who merges the
> feature PR to `main`, the QA/docs cadence — lives in each role's persona under
> `.opencode/agents/`, not here.

- **Dependency order.** A ticket is only worked when it is in the **ready set**
  (all its `blockedBy` are `Done`). Spikes usually go first because tasks are
  blocked on them, but the rule is blockers, not ticket type. Spikes and tasks
  can block each other.
- **Blockers must be linked** with `addBlockedBy` when a ticket depends on
  another.
- **One feature branch per story.** All task PRs merge into the story feature
  branch. **Nothing task-related ever merges directly into `main`.** `main` is
  production and is only changed by the final feature PR, and only after the
  final reviews approve.
- Every sub-issue MUST be linked to its parent story via `addSubIssue` **before**
  being added to the board.
- Every PR body MUST reference its ticket and the story (`Closes #<n>` +
  `Part of #<story>`) so the story's "Linked pull requests" field populates.
- Commit messages MUST reference the ticket number.
- **Ticket titles MUST carry a type prefix** — `Story:`, `Spike:`, `Task:`, or
  `Bug:` — set by the ticket's creator. See **Ticket title convention**.
- **Work-product bodies MUST be signed** and end with a signed
  summary/verdict comment (see the `comment-signature` skill).
- One task ticket → one PR (into the feature branch).
- The board is the single source of truth for state — always reflect state via
  `Status`.
