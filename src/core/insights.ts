import type { Activity, ActivitySearchFilter, TagSummary } from "./types";

/**
 * Pure Insights query and rollup surface (`project-plan/activity-model.md` →
 * `#insights--search`).
 *
 * Portability boundary (`project-plan/portability.md`): pure TypeScript, no
 * imports from `src/storage/`, no browser DOM globals, no Node globals. All
 * money values are integer cents.
 */

/**
 * Filter activities by intersecting (logical-AND) predicates. Omitted
 * predicates are unbounded, so `{}` returns all items.
 *
 * - `since` — ISO-8601 UTC lower bound, **inclusive** (`a.dateTime >= since`).
 * - `until` — ISO-8601 UTC upper bound, **exclusive** (`a.dateTime < until`).
 * - `tag`   — `a.tags` must include the tag.
 * - `type`  — `a.type` must equal the type.
 *
 * `dateTime` strings are stored as normalized UTC ISO-8601, so lexicographic
 * comparison is equivalent to chronological comparison and never depends on a
 * host timezone.
 */
export function searchActivities(
  activities: readonly Activity[],
  filter: ActivitySearchFilter,
): Activity[] {
  return activities.filter(
    (a) =>
      (filter.since === undefined || a.dateTime >= filter.since) &&
      (filter.until === undefined || a.dateTime < filter.until) &&
      (filter.tag === undefined || a.tags.includes(filter.tag)) &&
      (filter.type === undefined || a.type === filter.type),
  );
}

/**
 * Aggregate a (possibly filtered) activity set into a per-tag rollup of money
 * in and money out, in **integer cents**.
 *
 * - `totalInCents` — Σ `amountCents` where `type ∈ {income, deposit}`.
 * - `totalOutCents` — Σ `amountCents` where `type === "expense"`.
 * - An activity with multiple tags contributes its cents to **each** tag.
 * - Untagged activities (`tags: []`) create no bucket.
 * - Soft-deleted (`deletedAt !== undefined`) activities are excluded.
 * - Results are deterministically sorted by `tag` (`localeCompare`).
 */
export function summarizeByTag(activities: readonly Activity[]): TagSummary[] {
  const byTag = new Map<string, TagSummary>();
  for (const a of activities) {
    if (a.deletedAt !== undefined) {
      continue;
    }
    for (const tag of a.tags) {
      let summary = byTag.get(tag);
      if (!summary) {
        summary = { tag, totalInCents: 0, totalOutCents: 0 };
        byTag.set(tag, summary);
      }
      if (a.type === "expense") {
        summary.totalOutCents += a.amountCents;
      } else {
        // `income` or `deposit` counts as money in.
        summary.totalInCents += a.amountCents;
      }
    }
  }
  return [...byTag.values()].sort((x, y) => x.tag.localeCompare(y.tag));
}

/**
 * Period key (`"YYYY-MM"`) used to bucket an activity for period rollups (OQ-2).
 *
 * - **Recurring** activities (`source === "recurring"`) are attributed by their
 *   authoritative `Activity.period` (e.g. `"2026-11"`) so timezone offsets or
 *   user timestamp edits never misattribute a 1st-of-month item to an adjacent
 *   month.
 * - **Non-recurring** activities fall back to the UTC month of `dateTime`
 *   (`dateTime.slice(0, 7)`), which is timezone-safe because `dateTime` is a
 *   normalized ISO-8601 UTC string.
 */
export function activityPeriod(activity: Activity): string {
  if (activity.source === "recurring" && activity.period !== undefined) {
    return activity.period;
  }
  return activity.dateTime.slice(0, 7);
}

/**
 * Per-period rollup shape returned by `summarizeByPeriod`.
 */
export interface PeriodSummary {
  /** `"YYYY-MM"` period key (recurring `Activity.period`, else UTC month of `dateTime`). */
  period: string;
  /** Σ `amountCents` where `type ∈ {income, deposit}` in this period. */
  totalInCents: number;
  /** Σ `amountCents` where `type === "expense"` in this period. */
  totalOutCents: number;
  /** Per-tag breakdown for this period (`summarizeByTag` over the bucket). */
  tags: TagSummary[];
}

/**
 * Bucket activities by their `"YYYY-MM"` period (OQ-2 period attribution) and
 * roll each bucket up with `summarizeByTag`.
 *
 * Returns one rollup per period, sorted chronologically (lexicographic `"YYYY-MM"`
 * order is chronological order). Each `PeriodSummary.tags` entry is the
 * `summarizeByTag` output for the activities attributed to that period.
 */
export function summarizeByPeriod(
  activities: readonly Activity[],
): PeriodSummary[] {
  const byPeriod = new Map<string, Activity[]>();
  for (const a of activities) {
    if (a.deletedAt !== undefined) {
      continue;
    }
    const period = activityPeriod(a);
    const bucket = byPeriod.get(period);
    if (bucket) {
      bucket.push(a);
    } else {
      byPeriod.set(period, [a]);
    }
  }

  const periods = [...byPeriod.keys()].sort((x, y) => x.localeCompare(y));
  return periods.map((period) => {
    const bucket = byPeriod.get(period) as Activity[];
    return {
      period,
      totalInCents: bucket.reduce(
        (sum, a) => (a.type === "expense" ? sum : sum + a.amountCents),
        0,
      ),
      totalOutCents: bucket.reduce(
        (sum, a) => (a.type === "expense" ? sum + a.amountCents : sum),
        0,
      ),
      tags: summarizeByTag(bucket),
    };
  });
}
