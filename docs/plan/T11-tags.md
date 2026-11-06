# T11 — Tags

**Depends on:** T10 — **Milestone:** Full app

## Goal

Tag anything — manual expenses, deposits, and recurring expenses from the budget plan — with as many tags as you like.
Picking existing tags and creating new ones is effortless.

## Read first

`docs/architecture.md` §4 (`tags` table, `*tagIds` index), `docs/design.md` (tag palette, chips).

## Scope

**In:** `src/domain/tags.ts` (normalize, uniqueness, color assignment), `TagPicker` component, tags in the entry sheet,
in the recurring-expense editor (Settings) and in setup rows, tag chips on ledger rows, Settings → Tags (rename, recolor,
delete with usage count), propagation of recurring tags to this month's recurring line and future months.
**Out:** insights (T13), tag merging (follow-up if wanted).

## Steps

1. Domain: `normalizeTagName` (trim, collapse spaces), `nameKey` (lowercase), duplicate detection, next palette color.
2. `TagPicker`: selected chips (tap × to remove) + input. Typing filters existing tags (recently used first); if no exact match,
   first option is *Create "coffee"*. Enter adds; supports several tags quickly; accessible (combobox pattern).
3. Wire into: entry sheet (T06 slot), recurring expense edit sheet (T08), setup expense rows (T05).
4. Recurring tag edits: no timing prompt; update the item and this month's recurring line for it (adjustment lines inherit item tags).
5. Ledger rows: up to 2 chips + "+N".
6. Settings → Tags: list with usage counts; rename (uniqueness enforced), recolor, delete (confirm: "Remove from 23 entries? Entries are kept.").
7. Driver: `tags` option on `addExpense`/`addDeposit`/`addRecurringExpense`, `renameTag`, `deleteTag`, `tagsShownOn(lineName)`.

## Behaviors to prove

- `an expense can have several tags`
- `a new tag can be created while adding an expense`
- `existing tags are suggested as you type`
- `tag names are unique regardless of capitalization` ("Food" and "food" are the same tag)
- `tags on a recurring expense appear on its ledger line`
- `adding a tag to a recurring expense also tags this month's line without asking when`
- `a recurring expense can be tagged during first-run setup`
- `renaming a tag updates it everywhere`
- `deleting a tag removes it from entries but keeps the entries and the budget unchanged`

## Acceptance criteria

- [ ] Tag queries use the `*tagIds` index.
- [ ] TagPicker is fully usable with VoiceOver and keyboard (combobox semantics; axe clean).
- [ ] `pnpm verify` passes; screenshots of the picker at both Duo sizes reviewed.

## Docs to update

`docs/architecture.md` (tag rules), `docs/design.md` (chips/picker), `docs/testing.md` (driver).

## Completion notes

_Filled in by the agent when done._

