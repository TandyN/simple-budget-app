# T13 — Insights: spending by tag & trends

**Depends on:** T11 — **Milestone:** Full app

## Goal

A separate Insights page that answers "where does my money go?": the sum of spending per tag for a chosen period, plus
a simple month-by-month trend of money in vs. out.

## Read first

`docs/architecture.md` §4 (indexes), §8 (performance budget), `docs/design.md`.

## Scope

**In:** `src/domain/insights.ts` (pure aggregation), period selector, spending-by-tag bars, Untagged bucket, totals,
drill-down list per tag, monthly trend chart (hand-rolled SVG, no chart library), tap a tag chip in the ledger → Insights filtered.
**Out:** budgets/goals per tag, forecasting (follow-ups if wanted).

## Steps

1. Domain: `spendingByTag(entries, tags)` → rows `{ tag | 'untagged', total, count, share }` sorted by total desc;
   `totalSpending(entries)` counts each entry once; `monthlyTrend(entries, months)` → `{ month, moneyIn, moneyOut, net }`.
   Spending = negative entries (manual expenses, recurring expenses, negative adjustments); positive adjustments reduce spending
   for their item's tags. Carried over is never included.
2. Periods: This month, Last 3 months, Year to date, Last 12 months, All time, Custom (month range). Query by `monthKey` range.
3. UI (compact): period selector, total spending, list of tag bars (name, amount, % of total). Expanded: tag list left, selected tag's
   entries + trend right.
4. Footnote when an entry has multiple tags: "Entries with several tags count toward each tag, so tag totals can add up to more than total spending."
5. Driver: `openInsights()`, `choosePeriod('Last 3 months')`, `spendingFor(tagName)`, `totalSpending` locator, `openTag(tagName)`.

## Behaviors to prove

- `spending is summed per tag for the chosen period`
- `an entry with two tags counts toward both tags but only once in total spending`
- `untagged expenses appear under Untagged`
- `deposits and income are not counted as spending`
- `recurring expenses count under their tags`
- `a refund adjustment reduces spending for that expense's tags`
- `changing the period updates the totals`
- `the trend shows money in and out for each month in the period`
- `tapping a tag shows the entries behind its total`
- `tapping a tag chip in the ledger opens Insights for that tag`

## Acceptance criteria

- [ ] Aggregations are pure and 100% covered; journeys use the year-of-history fixture via the real import feature.
- [ ] "All time" insights for the 10-year perf fixture computes within the budget in `docs/architecture.md` §8 (measured in T14; sanity-check here).
- [ ] `pnpm verify` passes; screenshots at both Duo sizes, light and dark, reviewed.

## Docs to update

`docs/architecture.md` (insights rules), `docs/design.md` (charts), `docs/testing.md` (driver).

## Completion notes

_Filled in by the agent when done._
