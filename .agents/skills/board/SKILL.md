---
name: board
description: GitHub Projects board operations. Use whenever creating, linking, or updating board items (epics, sub-issues, status, role). All agents follow this skill.
---

# Board

All agents (orchestrator, project-manager, software-engineer, solutions-architect)
drive the same GitHub Projects board. Use this skill's commands and IDs.

## IDs (simple-budget-app)

| What | Value |
|------|-------|
| Owner (login) | `TandyN` |
| Owner ID | `26911814` |
| Repository ID (node) | `R_kgDOVo_TtA` |
| Project ID | `PVT_kwHOAZqkRs4Bq9W1` |
| Project number | `6` |
| Status field ID | `PVTSSF_lAHOAZqkRs4Bq9W1zhpSI3U` |
| role field ID | `PVTSSF_lAHOAZqkRs4Bq9W1zhpSJEw` |

### Status option IDs

| Option | ID |
|--------|----|
| Todo | `f75ad846` |
| In Progress | `47fc9ee4` |
| Review | `eeb70041` |
| Human Approval | `d24afde9` |
| Done | `98236657` |

### Role option IDs

| Option | ID |
|--------|----|
| project-manager | `8a181a9d` |
| software-engineer | `8b393d4c` |
| solutions-architect | `e946faea` |

## Commands

### Create a real GitHub Issue

```
gh api graphql -f query='
mutation {
  createIssue(input: {
    repositoryId: "R_kgDOVo_TtA",
    title: "<title>",
    body: "<body>"
  }) { issue { id number } }
}'
```

### Add an issue to the board

```
gh api graphql -f query='
mutation {
  addProjectV2ItemById(input: {
    projectId: "PVT_kwHOAZqkRs4Bq9W1",
    contentId: "<issue-node-id>"
  }) { item { id } }
}'
```

### Link a sub-issue to its epic

Use **node IDs** (the `id` field, not `number`).

```
gh api graphql -f query='
mutation {
  addSubIssue(input: {
    issueId: "<epic-node-id>",
    subIssueId: "<sub-issue-node-id>"
  }) { subIssue { id number } }
}'
```

### Set a field value (status or role)

```
gh api graphql -f query='
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PVT_kwHOAZqkRs4Bq9W1",
    itemId: "<board-item-id>",
    fieldId: "<field-id>",
    value: { singleSelectOptionId: "<option-id>" }
  }) { clientMutationId }
}'
```

> Note: `itemId` is the **board item id** (from `addProjectV2ItemById` → `item.id`),
> not the issue node id.

### List items

```
gh project item-list 6 --owner @me --format json
```

### List fields

```
gh project field-list 6 --owner @me --format json
```

### Open a PR referencing a sub-issue

```
gh pr create --base main --head <branch> \
  --title "<summary>" --body "Closes #<sub-issue-number>"
```

## Golden rules

- Every epic must have a PR. No epic reaches `Done` without a merged PR.
- Every sub-issue MUST be linked to its parent epic via `addSubIssue` before
  being added to the board.
- Every PR body MUST contain `Closes #<sub-issue-number>`.
- Commit messages MUST reference the sub-issue number.
- One sub-issue → one PR.
- The board is the single source of truth for state — always reflect state via `Status`.
