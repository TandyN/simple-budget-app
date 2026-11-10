---
name: board
description: GitHub Projects board operations. Use whenever creating, linking, or updating board items (epics, sub-issues, status, role). All agents follow this skill.
---

# Board

All agents (orchestrator, project-manager, software-engineer, solutions-architect)
drive the same GitHub Projects board. This skill is **repo-agnostic**: it discovers
IDs from the current repository.

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
```

If the board doesn't exist, create it:

```bash
gh project create --owner "$REPO_OWNER" --title "$BOARD_NAME" --format json
```

Then ensure the `Status` field (options: Todo, In Progress, Review, Done) and the
`role` field (options: project-manager, software-engineer, solutions-architect)
exist via `gh project field-create`.

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

### Open a PR referencing a sub-issue

```
gh pr create --base main --head <branch> \
  --title "<summary>" --body "Closes #<sub-issue-number>"
```

## Golden rules

- Every **sub-issue** must have a PR that closes it. The sub-issue only reaches
  `Done` after its PR is merged.
- An **epic** is a tracking issue. It reaches `Done` only when **every**
  sub-issue is `Done` (i.e. every sub-issue PR is merged). The epic itself does
  not need a PR.
- Every sub-issue MUST be linked to its parent epic via `addSubIssue` before
  being added to the board.
- Every PR body MUST contain `Closes #<sub-issue-number>`.
- Commit messages MUST reference the sub-issue number.
- One sub-issue → one PR.
- The board is the single source of truth for state — always reflect state via `Status`.
