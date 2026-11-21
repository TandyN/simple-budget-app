import type { Activity, RecurringRule } from "./types";
import { validatePeriod } from "./validate";

/**
 * Options for running the pure monthly recurring-transaction engine (`runRecurringEngine`).
 */
export interface RunRecurringEngineOptions {
  /** Candidate recurring rules to evaluate (never mutated in place). */
  rules: readonly RecurringRule[];
  /** Existing activity records used for `(sourceRuleId, period)` idempotency checks (never mutated in place). */
  activities: readonly Activity[];
  /** Reference evaluation instant (`now`); defaults to `new Date()` when omitted. */
  now?: Date;
  /** Optional deterministic ID factory for materialized activities; defaults to `() => crypto.randomUUID()`. */
  idFactory?: () => string;
  /** Optional audit timestamp (`createdAt` / `updatedAt`); defaults to `now.toISOString()`. */
  timestamp?: string;
}

/**
 * Pure return shape from `runRecurringEngine`.
 */
export interface RecurringEngineResult {
  /** Newly materialized recurring activities to persist (in chronological evaluation order). */
  posted: Activity[];
  /**
   * Subset of rules whose `lastPostPeriod` advanced during this engine run
   * (convenient for persistence callers that only save modified rules).
   */
  updatedRules: RecurringRule[];
  /**
   * Full array of rules corresponding 1:1 with input `rules`, containing fresh copies
   * where `lastPostPeriod` advanced and shallow clones for unchanged rules.
   */
  rules: RecurringRule[];
}

/**
 * Parses a validated `"YYYY-MM"` period string into `[year, month]` where `1 <= month <= 12`.
 */
export function parseYM(period: string): [number, number] {
  const valid = validatePeriod(period, "period");
  const year = Number(valid.slice(0, 4));
  const month = Number(valid.slice(5, 7));
  return [year, month];
}

/**
 * Formats a UTC year and 1-based month (`1..12`) as a `"YYYY-MM"` period string.
 */
function formatYM(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/**
 * Returns the `"YYYY-MM"` UTC period string for a given `Date`.
 */
export function periodOfDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Invalid now: must be a valid Date instance");
  }
  return formatYM(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

/**
 * Returns the `"YYYY-MM"` period string immediately preceding `period`
 * (e.g. `"2026-01"` -> `"2025-12"`, `"2026-11"` -> `"2026-10"`).
 */
export function periodBefore(period: string): string {
  const [y, m] = parseYM(period);
  if (m === 1) {
    return formatYM(y - 1, 12);
  }
  return formatYM(y, m - 1);
}

/**
 * Computes the clamped `Date` due instant for `rule` in `period` (`"YYYY-MM"`):
 * - Clamps `rule.schedule.dayOfMonth` (`1..31`) to the actual number of days in month `m`
 *   (`new Date(Date.UTC(y, m, 0)).getUTCDate()`) so short months (Feb 28/29, Apr/Jun/Sep/Nov 30)
 *   never overflow `Date.UTC` into month `m + 1`.
 * - Anchors the due instant at fixed `12:00:00Z` (noon UTC, OQ-2 adopted default).
 */
function computeDueAt(rule: RecurringRule, year: number, month: number): Date {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const effectiveDay = Math.min(rule.schedule.dayOfMonth, daysInMonth);
  return new Date(Date.UTC(year, month - 1, effectiveDay, 12, 0, 0));
}

/**
 * Returns the ISO-8601 UTC due timestamp (`YYYY-MM-DDT12:00:00.000Z`) for `rule` in `period` (`"YYYY-MM"`),
 * applying short-month `Date.UTC` clamping and the fixed `12:00:00Z` due instant (OQ-2).
 */
export function dueDateTime(rule: RecurringRule, period: string): string {
  const [y, m] = parseYM(period);
  return computeDueAt(rule, y, m).toISOString();
}

/**
 * Enumerates all `"YYYY-MM"` month periods in the half-open interval `(startExclusive, endInclusive]`
 * in chronological order across month and year boundaries whose clamped `12:00:00Z` due instant
 * has occurred as of `now` (`dueAt.getTime() <= now.getTime()`).
 */
export function missingPeriods(
  rule: RecurringRule,
  startExclusive: string,
  endInclusive: string,
  now: Date,
): string[] {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("Invalid now: must be a valid Date instance");
  }

  let [y, m] = parseYM(startExclusive);
  const validEnd = validatePeriod(endInclusive, "endInclusive");

  const out: string[] = [];
  for (;;) {
    const cur = formatYM(y, m);
    if (cur > validEnd) {
      break;
    }
    if (cur !== startExclusive) {
      const dueAt = computeDueAt(rule, y, m);
      if (dueAt.getTime() <= now.getTime()) {
        out.push(cur);
      }
    }
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }

  return out;
}

/**
 * Primary idempotency guard: returns `true` iff an active (non-tombstoned) activity already exists
 * with `source === "recurring"`, `sourceRuleId === ruleId`, and `period === period`.
 */
export function alreadyPosted(
  activities: readonly Activity[],
  ruleId: string,
  period: string,
): boolean {
  return activities.some(
    (a) =>
      a.deletedAt === undefined &&
      a.source === "recurring" &&
      a.sourceRuleId === ruleId &&
      a.period === period,
  );
}

/**
 * Pure monthly recurring transaction engine (`project-plan/recurring-engine.md`).
 *
 * - Skips inactive rules (`rule.active === false`) and soft-deleted tombstoned rules (`rule.deletedAt !== undefined`)
 *   without advancing their `lastPostPeriod`.
 * - For each active rule, determines `start = rule.lastPostPeriod ?? periodBefore(periodOfDate(now))`
 *   and evaluates `duePeriods = missingPeriods(rule, start, periodOfDate(now), now)`.
 * - Materializes at most one `Activity` per `(rule.id, period)` pair, checking both existing `activities`
 *   and newly posted activities in the current run via `alreadyPosted`.
 * - Advances `rule.lastPostPeriod` to `duePeriods[duePeriods.length - 1]` (and updates `updatedAt`)
 *   only when `duePeriods.length > 0` (never unconditionally to `periodOfDate(now)` when the current month's
 *   due instant has not yet arrived).
 * - Never mutates caller input arrays or objects in place.
 */
export function runRecurringEngine(
  options: RunRecurringEngineOptions,
): RecurringEngineResult {
  const now = options.now ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("Invalid now: must be a valid Date instance");
  }

  const currentPeriod = periodOfDate(now);
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const auditTimestamp = options.timestamp ?? now.toISOString();

  const posted: Activity[] = [];
  const updatedRules: RecurringRule[] = [];
  const nextRules: RecurringRule[] = [];
  const combinedActivities: Activity[] = [...options.activities];

  for (const rule of options.rules) {
    const clonedRule: RecurringRule = {
      ...rule,
      schedule: { ...rule.schedule },
    };

    if (!rule.active || rule.deletedAt !== undefined) {
      nextRules.push(clonedRule);
      continue;
    }

    const start = rule.lastPostPeriod ?? periodBefore(currentPeriod);
    const duePeriods = missingPeriods(rule, start, currentPeriod, now);

    for (const period of duePeriods) {
      if (alreadyPosted(combinedActivities, rule.id, period)) {
        continue;
      }

      const activity: Activity = {
        id: idFactory(),
        type: rule.type,
        amountCents: rule.amountCents,
        currency: rule.currency,
        dateTime: dueDateTime(rule, period),
        tags: [],
        source: "recurring",
        sourceRuleId: rule.id,
        period,
        memo: `Auto-posted: ${rule.name}`,
        createdAt: auditTimestamp,
        updatedAt: auditTimestamp,
      };

      posted.push(activity);
      combinedActivities.push(activity);
    }

    if (duePeriods.length > 0) {
      const latestDuePeriod = duePeriods[duePeriods.length - 1] as string;
      clonedRule.lastPostPeriod = latestDuePeriod;
      clonedRule.updatedAt = auditTimestamp;
      updatedRules.push(clonedRule);
    }

    nextRules.push(clonedRule);
  }

  return {
    posted,
    updatedRules,
    rules: nextRules,
  };
}
