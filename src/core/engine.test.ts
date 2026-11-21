import { describe, expect, it } from "vitest";
import {
  alreadyPosted,
  dueDateTime,
  missingPeriods,
  parseYM,
  periodBefore,
  periodOfDate,
  runRecurringEngine,
} from "./engine";
import type { Activity, RecurringRule } from "./types";

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "rule-salary",
    name: "Salary",
    type: "income",
    amountCents: 500_000,
    currency: "USD",
    schedule: {
      cadence: "monthly",
      dayOfMonth: 1,
    },
    active: true,
    lastPostPeriod: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("period helpers (parseYM, periodOfDate, periodBefore)", () => {
  it("parses valid YYYY-MM strings and rejects invalid periods", () => {
    expect(parseYM("2026-01")).toEqual([2026, 1]);
    expect(parseYM("2026-11")).toEqual([2026, 11]);
    expect(parseYM("2026-12")).toEqual([2026, 12]);

    expect(() => parseYM("2026-00")).toThrow(/month must be between 01 and 12/);
    expect(() => parseYM("2026-13")).toThrow(/month must be between 01 and 12/);
    expect(() => parseYM("invalid")).toThrow(/must match YYYY-MM/);
  });

  it("extracts UTC YYYY-MM from Date and rejects invalid Date instances", () => {
    expect(periodOfDate(new Date("2026-11-05T00:00:00.000Z"))).toBe("2026-11");
    expect(periodOfDate(new Date("2026-01-01T23:59:59.999Z"))).toBe("2026-01");

    expect(() => periodOfDate(new Date("invalid"))).toThrow(
      /Invalid now: must be a valid Date instance/,
    );
    expect(() => periodOfDate("2026-11" as unknown as Date)).toThrow(
      /Invalid now: must be a valid Date instance/,
    );
  });

  it("computes the previous month period across regular months and January year boundaries", () => {
    expect(periodBefore("2026-11")).toBe("2026-10");
    expect(periodBefore("2026-02")).toBe("2026-01");
    expect(periodBefore("2026-01")).toBe("2025-12");
    expect(periodBefore("2000-01")).toBe("1999-12");
  });
});

describe("short-month Date.UTC clamping & fixed 12:00:00Z due instant (dueDateTime & missingPeriods)", () => {
  it("clamps dayOfMonth = 29, 30, and 31 in non-leap February (2026-02 -> 2026-02-28T12:00:00.000Z)", () => {
    for (const dayOfMonth of [29, 30, 31]) {
      const rule = makeRule({
        schedule: { cadence: "monthly", dayOfMonth },
      });
      expect(dueDateTime(rule, "2026-02")).toBe("2026-02-28T12:00:00.000Z");
    }
  });

  it("clamps dayOfMonth = 29, 30, and 31 in leap February (2024-02 -> 2024-02-29T12:00:00.000Z)", () => {
    for (const dayOfMonth of [29, 30, 31]) {
      const rule = makeRule({
        schedule: { cadence: "monthly", dayOfMonth },
      });
      expect(dueDateTime(rule, "2024-02")).toBe("2024-02-29T12:00:00.000Z");
    }
  });

  it("handles century leap year (2000-02 -> Feb 29) and century non-leap year (2100-02 -> Feb 28)", () => {
    const rule31 = makeRule({
      schedule: { cadence: "monthly", dayOfMonth: 31 },
    });
    expect(dueDateTime(rule31, "2000-02")).toBe("2000-02-29T12:00:00.000Z");
    expect(dueDateTime(rule31, "2100-02")).toBe("2100-02-28T12:00:00.000Z");
  });

  it("clamps dayOfMonth = 31 in 30-day months (Apr, Jun, Sep, Nov) and preserves 31 in 31-day months", () => {
    const rule31 = makeRule({
      schedule: { cadence: "monthly", dayOfMonth: 31 },
    });

    expect(dueDateTime(rule31, "2026-04")).toBe("2026-04-30T12:00:00.000Z");
    expect(dueDateTime(rule31, "2026-06")).toBe("2026-06-30T12:00:00.000Z");
    expect(dueDateTime(rule31, "2026-09")).toBe("2026-09-30T12:00:00.000Z");
    expect(dueDateTime(rule31, "2026-11")).toBe("2026-11-30T12:00:00.000Z");

    // 31-day months remain on the 31st at 12:00:00Z
    expect(dueDateTime(rule31, "2026-01")).toBe("2026-01-31T12:00:00.000Z");
    expect(dueDateTime(rule31, "2026-03")).toBe("2026-03-31T12:00:00.000Z");
    expect(dueDateTime(rule31, "2026-12")).toBe("2026-12-31T12:00:00.000Z");
  });

  it("evaluates missingPeriods against the exact 12:00:00Z clamped due instant (before, at, and after)", () => {
    const rule31 = makeRule({
      schedule: { cadence: "monthly", dayOfMonth: 31 },
    });

    // 1 ms before clamped Feb 28 12:00:00Z -> not due yet
    expect(
      missingPeriods(
        rule31,
        "2026-01",
        "2026-02",
        new Date("2026-02-28T11:59:59.999Z"),
      ),
    ).toEqual([]);

    // Exact clamped Feb 28 12:00:00.000Z -> due
    expect(
      missingPeriods(
        rule31,
        "2026-01",
        "2026-02",
        new Date("2026-02-28T12:00:00.000Z"),
      ),
    ).toEqual(["2026-02"]);

    // After clamped Feb 28 12:00:00.000Z -> due
    expect(
      missingPeriods(
        rule31,
        "2026-01",
        "2026-02",
        new Date("2026-02-28T18:00:00.000Z"),
      ),
    ).toEqual(["2026-02"]);
  });

  it("returns empty array when startExclusive >= endInclusive and rejects invalid now Date", () => {
    const rule = makeRule();
    const now = new Date("2026-11-05T12:00:00.000Z");

    expect(missingPeriods(rule, "2026-11", "2026-11", now)).toEqual([]);
    expect(missingPeriods(rule, "2026-12", "2026-11", now)).toEqual([]);

    expect(() =>
      missingPeriods(rule, "2026-10", "2026-11", new Date("not-a-date")),
    ).toThrow(/Invalid now: must be a valid Date instance/);
  });
});

describe("alreadyPosted idempotency guard", () => {
  const sampleActivities: Activity[] = [
    {
      id: "act-recurring-1",
      type: "income",
      amountCents: 500_000,
      currency: "USD",
      dateTime: "2026-11-01T12:00:00.000Z",
      tags: [],
      source: "recurring",
      sourceRuleId: "rule-salary",
      period: "2026-11",
      memo: "Auto-posted: Salary",
      createdAt: "2026-11-01T12:00:00.000Z",
      updatedAt: "2026-11-01T12:00:00.000Z",
    },
    {
      id: "act-manual-1",
      type: "expense",
      amountCents: 2500,
      currency: "USD",
      dateTime: "2026-11-02T12:00:00.000Z",
      tags: ["food"],
      source: "manual",
      createdAt: "2026-11-02T12:00:00.000Z",
      updatedAt: "2026-11-02T12:00:00.000Z",
    },
    {
      id: "act-tombstoned",
      type: "income",
      amountCents: 500_000,
      currency: "USD",
      dateTime: "2026-10-01T12:00:00.000Z",
      tags: [],
      source: "recurring",
      sourceRuleId: "rule-salary",
      period: "2026-10",
      deletedAt: "2026-10-02T00:00:00.000Z",
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    },
  ];

  it("returns true only for active recurring activities matching (sourceRuleId, period)", () => {
    expect(alreadyPosted(sampleActivities, "rule-salary", "2026-11")).toBe(
      true,
    );
    expect(alreadyPosted(sampleActivities, "rule-salary", "2026-12")).toBe(
      false,
    );
    expect(alreadyPosted(sampleActivities, "other-rule", "2026-11")).toBe(
      false,
    );
    // Soft-deleted tombstoned activity does not count as active posted
    expect(alreadyPosted(sampleActivities, "rule-salary", "2026-10")).toBe(
      false,
    );
  });
});

describe("runRecurringEngine end-to-end lifecycle & invariants", () => {
  it("handles first launch (lastPostPeriod: null) when due instant has passed", () => {
    const ruleA = makeRule({
      id: "rA",
      name: "Salary",
      type: "income",
      amountCents: 500_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      lastPostPeriod: null,
    });
    const ruleB = makeRule({
      id: "rB",
      name: "Rent",
      type: "expense",
      amountCents: 150_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      lastPostPeriod: null,
    });

    let seq = 0;
    const now = new Date("2026-11-05T15:30:00.000Z");
    const result = runRecurringEngine({
      rules: [ruleA, ruleB],
      activities: [],
      now,
      idFactory: () => `gen-${++seq}`,
    });

    expect(result.posted).toEqual([
      {
        id: "gen-1",
        type: "income",
        amountCents: 500_000,
        currency: "USD",
        dateTime: "2026-11-01T12:00:00.000Z",
        tags: [],
        source: "recurring",
        sourceRuleId: "rA",
        period: "2026-11",
        memo: "Auto-posted: Salary",
        createdAt: "2026-11-05T15:30:00.000Z",
        updatedAt: "2026-11-05T15:30:00.000Z",
      },
      {
        id: "gen-2",
        type: "expense",
        amountCents: 150_000,
        currency: "USD",
        dateTime: "2026-11-01T12:00:00.000Z",
        tags: [],
        source: "recurring",
        sourceRuleId: "rB",
        period: "2026-11",
        memo: "Auto-posted: Rent",
        createdAt: "2026-11-05T15:30:00.000Z",
        updatedAt: "2026-11-05T15:30:00.000Z",
      },
    ]);

    expect(result.updatedRules).toHaveLength(2);
    expect(result.updatedRules[0]?.lastPostPeriod).toBe("2026-11");
    expect(result.updatedRules[1]?.lastPostPeriod).toBe("2026-11");
    expect(result.rules.map((r) => r.lastPostPeriod)).toEqual([
      "2026-11",
      "2026-11",
    ]);

    // Caller input rules are never mutated in place
    expect(ruleA.lastPostPeriod).toBeNull();
    expect(ruleB.lastPostPeriod).toBeNull();
  });

  it("does not post or advance lastPostPeriod on early-month first launch before due instant", () => {
    const midMonthRule = makeRule({
      id: "r-mid",
      name: "Mid-Month Subscription",
      type: "expense",
      amountCents: 2_999,
      schedule: { cadence: "monthly", dayOfMonth: 15 },
      lastPostPeriod: null,
    });

    // Run on Nov 5 (before Nov 15 12:00:00Z)
    const earlyResult = runRecurringEngine({
      rules: [midMonthRule],
      activities: [],
      now: new Date("2026-11-05T18:00:00.000Z"),
    });

    expect(earlyResult.posted).toEqual([]);
    expect(earlyResult.updatedRules).toEqual([]);
    expect(earlyResult.rules[0]?.lastPostPeriod).toBeNull();

    // Also test same day Nov 15 but before 12:00:00Z (e.g. 11:59:59Z)
    const morningResult = runRecurringEngine({
      rules: earlyResult.rules,
      activities: [],
      now: new Date("2026-11-15T11:59:59.000Z"),
    });

    expect(morningResult.posted).toEqual([]);
    expect(morningResult.updatedRules).toEqual([]);
    expect(morningResult.rules[0]?.lastPostPeriod).toBeNull();

    // Once Nov 15 12:00:00Z arrives, it posts for 2026-11
    const dueResult = runRecurringEngine({
      rules: morningResult.rules,
      activities: [],
      now: new Date("2026-11-15T12:00:00.000Z"),
      idFactory: () => "mid-1",
    });

    expect(dueResult.posted).toHaveLength(1);
    expect(dueResult.posted[0]?.period).toBe("2026-11");
    expect(dueResult.posted[0]?.dateTime).toBe("2026-11-15T12:00:00.000Z");
    expect(dueResult.rules[0]?.lastPostPeriod).toBe("2026-11");
  });

  it("is idempotent across repeated runs on the same day and when lastPostPeriod is stale/null", () => {
    const rule = makeRule({ id: "rA", lastPostPeriod: null });
    const now = new Date("2026-11-05T12:00:00.000Z");

    // Run 1
    const run1 = runRecurringEngine({
      rules: [rule],
      activities: [],
      now,
      idFactory: () => "act-nov",
    });
    expect(run1.posted).toHaveLength(1);

    // Run 2 on the same day with updated rules & activities -> no-op
    const run2 = runRecurringEngine({
      rules: run1.rules,
      activities: run1.posted,
      now,
      idFactory: () => "should-not-be-used",
    });
    expect(run2.posted).toEqual([]);
    expect(run2.updatedRules).toEqual([]);
    expect(run2.rules[0]?.lastPostPeriod).toBe("2026-11");

    // Even if rule.lastPostPeriod was lost/stale (still null), alreadyPosted prevents duplicate posting
    // while advancing the stale high-water mark to "2026-11"
    const staleRuleRun = runRecurringEngine({
      rules: [rule], // lastPostPeriod is still null
      activities: run1.posted,
      now,
      idFactory: () => "should-not-be-used",
    });
    expect(staleRuleRun.posted).toEqual([]);
    expect(staleRuleRun.updatedRules).toHaveLength(1);
    expect(staleRuleRun.rules[0]?.lastPostPeriod).toBe("2026-11");
  });

  it("prevents duplicate posting if the same rule ID appears twice in a single run", () => {
    const rule = makeRule({ id: "dup-rule", lastPostPeriod: null });
    const now = new Date("2026-11-05T12:00:00.000Z");

    const res = runRecurringEngine({
      rules: [rule, rule],
      activities: [],
      now,
    });

    expect(res.posted).toHaveLength(1);
    expect(res.posted[0]?.sourceRuleId).toBe("dup-rule");
    expect(res.posted[0]?.period).toBe("2026-11");
  });

  it("catches up across multiple months and year boundaries (2025-11 -> 2026-02) with short-month clamping", () => {
    const rule31 = makeRule({
      id: "r-eom",
      name: "End-of-Month Bill",
      type: "expense",
      amountCents: 45_000,
      schedule: { cadence: "monthly", dayOfMonth: 31 },
      lastPostPeriod: "2025-10",
    });

    let seq = 0;
    const now = new Date("2026-02-28T15:00:00.000Z");
    const result = runRecurringEngine({
      rules: [rule31],
      activities: [],
      now,
      idFactory: () => `eom-${++seq}`,
    });

    expect(
      result.posted.map((a) => ({ period: a.period, dt: a.dateTime })),
    ).toEqual([
      { period: "2025-11", dt: "2025-11-30T12:00:00.000Z" },
      { period: "2025-12", dt: "2025-12-31T12:00:00.000Z" },
      { period: "2026-01", dt: "2026-01-31T12:00:00.000Z" },
      { period: "2026-02", dt: "2026-02-28T12:00:00.000Z" },
    ]);
    expect(result.rules[0]?.lastPostPeriod).toBe("2026-02");
  });

  it("advances lastPostPeriod only to the last due period when current month is not yet due during multi-month catch-up", () => {
    const rule20 = makeRule({
      id: "r-20",
      name: "20th Utility",
      type: "expense",
      amountCents: 12_000,
      schedule: { cadence: "monthly", dayOfMonth: 20 },
      lastPostPeriod: "2025-11",
    });

    // Run on 2026-02-10: Dec 2025 and Jan 2026 are due, but Feb 20, 2026 is not yet due
    const result = runRecurringEngine({
      rules: [rule20],
      activities: [],
      now: new Date("2026-02-10T12:00:00.000Z"),
    });

    expect(result.posted.map((a) => a.period)).toEqual(["2025-12", "2026-01"]);
    // High-water mark must stop at "2026-01", NOT "2026-02"
    expect(result.rules[0]?.lastPostPeriod).toBe("2026-01");
  });

  it("preserves already-posted activities when a rule is edited (change-without-losing-history)", () => {
    const rentRule = makeRule({
      id: "r-rent",
      name: "Rent",
      type: "expense",
      amountCents: 150_000,
      lastPostPeriod: null,
    });

    // Nov 2026 run posts 150_000
    const novRun = runRecurringEngine({
      rules: [rentRule],
      activities: [],
      now: new Date("2026-11-05T12:00:00.000Z"),
      idFactory: () => "rent-nov",
    });
    expect(novRun.posted[0]?.amountCents).toBe(150_000);

    // User edits Rent rule amountCents from 150_000 -> 180_000 on Nov 10
    const editedRentRule: RecurringRule = {
      ...(novRun.rules[0] as RecurringRule),
      amountCents: 180_000,
      updatedAt: "2026-11-10T10:00:00.000Z",
    };

    // Dec 2026 run posts 180_000 for 2026-12 while 2026-11 activity stays 150_000
    const decRun = runRecurringEngine({
      rules: [editedRentRule],
      activities: novRun.posted,
      now: new Date("2026-12-02T12:00:00.000Z"),
      idFactory: () => "rent-dec",
    });

    expect(novRun.posted[0]?.amountCents).toBe(150_000);
    expect(decRun.posted).toHaveLength(1);
    expect(decRun.posted[0]?.period).toBe("2026-12");
    expect(decRun.posted[0]?.amountCents).toBe(180_000);
  });

  it("skips inactive (active: false) and soft-deleted rules, and back-fills skipped due periods on re-enable", () => {
    const activeRule = makeRule({
      id: "rA",
      name: "Salary",
      lastPostPeriod: "2026-11",
      active: false, // paused after 2026-11
    });
    const deletedRule = makeRule({
      id: "r-deleted",
      name: "Deleted Rule",
      lastPostPeriod: "2026-11",
      active: true,
      deletedAt: "2026-11-15T00:00:00.000Z",
    });

    // Run in Jan 2027 while rA is paused and r-deleted is tombstoned -> zero postings
    const pausedRun = runRecurringEngine({
      rules: [activeRule, deletedRule],
      activities: [],
      now: new Date("2027-01-10T12:00:00.000Z"),
    });

    expect(pausedRun.posted).toEqual([]);
    expect(pausedRun.updatedRules).toEqual([]);
    expect(pausedRun.rules[0]?.lastPostPeriod).toBe("2026-11");
    expect(pausedRun.rules[1]?.lastPostPeriod).toBe("2026-11");

    // User re-enables rA on 2027-02-03 -> back-fills 2026-12, 2027-01, 2027-02
    const reenabledRule: RecurringRule = {
      ...(pausedRun.rules[0] as RecurringRule),
      active: true,
    };

    const backfillRun = runRecurringEngine({
      rules: [reenabledRule],
      activities: [],
      now: new Date("2027-02-03T12:00:00.000Z"),
    });

    expect(backfillRun.posted.map((a) => a.period)).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(backfillRun.rules[0]?.lastPostPeriod).toBe("2027-02");
  });

  it("never resurrects a user-deleted recurring activity because rule.lastPostPeriod remains advanced", () => {
    const rentRule = makeRule({
      id: "r-rent",
      name: "Rent",
      type: "expense",
      amountCents: 150_000,
      lastPostPeriod: null,
    });

    // Post 2026-11
    const novRun = runRecurringEngine({
      rules: [rentRule],
      activities: [],
      now: new Date("2026-11-05T12:00:00.000Z"),
    });
    expect(novRun.posted).toHaveLength(1);
    expect(novRun.rules[0]?.lastPostPeriod).toBe("2026-11");

    // User hard-deletes the 2026-11 activity (activities log is now empty [])
    // Subsequent run in 2026-11 does NOT re-post 2026-11
    const sameMonthAfterDelete = runRecurringEngine({
      rules: novRun.rules,
      activities: [],
      now: new Date("2026-11-20T12:00:00.000Z"),
    });
    expect(sameMonthAfterDelete.posted).toEqual([]);

    // Next month (2026-12) posts ONLY 2026-12 and does not resurrect 2026-11
    const decAfterDelete = runRecurringEngine({
      rules: novRun.rules,
      activities: [],
      now: new Date("2026-12-05T12:00:00.000Z"),
    });
    expect(decAfterDelete.posted.map((a) => a.period)).toEqual(["2026-12"]);
  });

  it("defaults now to new Date() and validates now parameter", () => {
    const rule = makeRule({ lastPostPeriod: "9999-12" });
    const res = runRecurringEngine({
      rules: [rule],
      activities: [],
    });
    expect(res.posted).toEqual([]);

    expect(() =>
      runRecurringEngine({
        rules: [rule],
        activities: [],
        now: new Date("invalid"),
      }),
    ).toThrow(/Invalid now: must be a valid Date instance/);
  });
});
