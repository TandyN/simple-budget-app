---
name: board
description: GitHub Projects board operations. Use whenever creating, linking, or updating board items (epics, sub-issues, status, role). All agents follow this skill.
---

# Board

All agents (orchestrator, product-manager, project-manager, software-engineer,
staff-software-engineer, qa, solutions-architect) drive the same GitHub Projects
board. This skill is **repo-agnostic**: it discovers IDs from the current repository.

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
SA_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="solutions-architect") | .id')
PRODPM_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="product-manager") | .id')
SSE_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="staff-software-engineer") | .id')
QA_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="role") | .options[] | select(.name=="qa") | .id')
```

If the board doesn't exist, create it:

```bash
gh project create --owner "$REPO_OWNER" --title "$BOARD_NAME" --format json
```

Then ensure the `Status` field (options: Todo, In Progress, Review, Done) and the
`role` field (options: product-manager, project-manager, software-engineer,
solutions-architect, staff-software-engineer, qa) exist via `gh project field-create`.

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

### Open a PR referencing a sub-issue (and the epic)

The PR body MUST reference **both** the sub-issue and its epic. GitHub links the
PR to both issues, which populates the epic's "Linked pull requests" board field
(referencing only the sub-issue leaves the epic unlinked — this was the bug).

```
gh pr create --base main --head <branch> \
  --title "<summary>" \
  --body "Closes #<sub-issue-number>
Part of #<epic-number>"
```

## Golden rules

- Every **sub-issue** is implemented by ONE software-engineer (one specific task).
  The sub-issue moves `In Progress → Review` when the PR is opened. It reaches
  `Done` only after its PR is merged (which happens only after
  staff-software-engineer and QA both approve).
- An **epic** is a tracking issue created by the product-manager. It reaches
  `Done` only when **every** sub-issue under it is `Done` (all PRs merged).
- Every sub-issue MUST be linked to its parent epic via `addSubIssue` before
  being added to the board.
- Every PR body MUST contain `Closes #<sub-issue-number>` **and**
  `Part of #<epic-number>` (so the epic's "Linked pull requests" field populates).
- Commit messages MUST reference the sub-issue number.
- One sub-issue → one PR.
- Only the **orchestrator** merges a PR, and only after QA approves it.
- The board is the single source of truth for state — always reflect state via `Status`.
