import { describe, expect, it } from "vitest";
import { runRecurringEngine } from "./engine";
import { computeAvailableFunds } from "./funds";
import {
  activityPeriod,
  searchActivities,
  summarizeByPeriod,
  summarizeByTag,
} from "./insights";
import type { Activity, BudgetBackup } from "./types";
import { validateBackupPayload } from "./validate";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-1",
    type: "expense",
    amountCents: 1000,
    currency: "USD",
    dateTime: "2026-06-15T12:00:00.000Z",
    tags: ["food"],
    source: "manual",
    createdAt: "2026-06-15T12:00:00.000Z",
    updatedAt: "2026-06-15T12:00:00.000Z",
    ...overrides,
  };
}

/** A 5-year dataset spanning 2022..2026 across several tags and types. */
function makeFiveYearDataset(): Activity[] {
  const out: Activity[] = [];
  let id = 0;
  const push = (a: Activity) => {
    id += 1;
    out.push({ ...a, id: `act-${id}` });
  };

  // 2022
  push(
    makeActivity({
      type: "income",
      amountCents: 40000,
      dateTime: "2022-01-05T12:00:00.000Z",
      tags: ["salary"],
    }),
  );
  push(
    makeActivity({
      type: "expense",
      amountCents: 15000,
      dateTime: "2022-01-20T12:00:00.000Z",
      tags: ["housing", "rent"],
    }),
  );
  // 2023
  push(
    makeActivity({
      type: "income",
      amountCents: 42000,
      dateTime: "2023-03-10T12:00:00.000Z",
      tags: ["salary"],
    }),
  );
  push(
    makeActivity({
      type: "deposit",
      amountCents: 900,
      dateTime: "2023-03-11T12:00:00.000Z",
      tags: [],
    }),
  );
  push(
    makeActivity({
      type: "expense",
      amountCents: 3200,
      dateTime: "2023-07-01T12:00:00.000Z",
      tags: ["food"],
    }),
  );
  // 2024
  push(
    makeActivity({
      type: "income",
      amountCents: 45000,
      dateTime: "2024-05-15T12:00:00.000Z",
      tags: ["salary"],
    }),
  );
  push(
    makeActivity({
      type: "expense",
      amountCents: 8000,
      dateTime: "2024-05-20T12:00:00.000Z",
      tags: ["travel", "food"],
    }),
  );
  // 2025
  push(
    makeActivity({
      type: "income",
      amountCents: 48000,
      dateTime: "2025-09-01T12:00:00.000Z",
      tags: ["salary"],
    }),
  );
  push(
    makeActivity({
      type: "expense",
      amountCents: 12000,
      dateTime: "2025-09-05T12:00:00.000Z",
      tags: ["housing"],
    }),
  );
  // 2026
  push(
    makeActivity({
      type: "income",
      amountCents: 50000,
      dateTime: "2026-11-01T12:00:00.000Z",
      tags: ["salary"],
      source: "recurring",
      sourceRuleId: "rule-salary",
      period: "2026-11",
    }),
  );
  push(
    makeActivity({
      type: "expense",
      amountCents: 20000,
      dateTime: "2026-11-15T12:00:00.000Z",
      tags: ["housing"],
    }),
  );
  push(
    makeActivity({
      type: "expense",
      amountCents: 600,
      dateTime: "2026-11-16T12:00:00.000Z",
      tags: ["food"],
    }),
  );

  return out;
}

describe("searchActivities", () => {
  it("returns all items for an empty filter {}", () => {
    const all = makeFiveYearDataset();
    expect(searchActivities(all, {})).toHaveLength(all.length);
    expect(searchActivities(all, {})).toEqual(all);
  });

  it("filters by `since` (inclusive lower bound)", () => {
    const a = makeActivity({ dateTime: "2026-01-01T00:00:00.000Z" });
    const b = makeActivity({ id: "b", dateTime: "2025-12-31T23:59:59.000Z" });
    const c = makeActivity({ id: "c", dateTime: "2026-01-01T00:00:01.000Z" });
    const res = searchActivities([a, b, c], {
      since: "2026-01-01T00:00:00.000Z",
    });
    // `a` is exactly at the bound (inclusive), `c` after, `b` before (excluded)
    expect(res.map((x) => x.id)).toEqual(["act-1", "c"]);
  });

  it("filters by `until` (exclusive upper bound)", () => {
    const a = makeActivity({ dateTime: "2026-12-01T00:00:00.000Z" });
    const b = makeActivity({ id: "b", dateTime: "2026-11-30T23:59:59.000Z" });
    const c = makeActivity({ id: "c", dateTime: "2026-12-01T00:00:01.000Z" });
    const res = searchActivities([a, b, c], {
      until: "2026-12-01T00:00:00.000Z",
    });
    // `b` before bound (included), `a` exactly at bound (exclusive, excluded)
    expect(res.map((x) => x.id)).toEqual(["b"]);
  });

  it("filters by `tag` (activity.tags must include it)", () => {
    const a = makeActivity({ tags: ["food", "dining"] });
    const b = makeActivity({ id: "b", tags: ["travel"] });
    const c = makeActivity({ id: "c", tags: [] });
    const res = searchActivities([a, b, c], { tag: "food" });
    expect(res.map((x) => x.id)).toEqual(["act-1"]);
  });

  it("filters by `type`", () => {
    const a = makeActivity({ type: "income", tags: [] });
    const b = makeActivity({ id: "b", type: "expense", tags: [] });
    const c = makeActivity({ id: "c", type: "deposit", tags: [] });
    expect(
      searchActivities([a, b, c], { type: "income" }).map((x) => x.id),
    ).toEqual(["act-1"]);
    expect(
      searchActivities([a, b, c], { type: "expense" }).map((x) => x.id),
    ).toEqual(["b"]);
  });

  it("intersects all 4 predicates (since inclusive, until exclusive, tag, type)", () => {
    const inRange = makeActivity({
      type: "expense",
      dateTime: "2026-06-15T12:00:00.000Z",
      tags: ["food"],
    });
    const wrongType = makeActivity({
      id: "t",
      type: "income",
      dateTime: "2026-06-15T12:00:00.000Z",
      tags: ["food"],
    });
    const wrongTag = makeActivity({
      id: "g",
      type: "expense",
      dateTime: "2026-06-15T12:00:00.000Z",
      tags: ["travel"],
    });
    const before = makeActivity({
      id: "b",
      type: "expense",
      dateTime: "2025-05-15T12:00:00.000Z",
      tags: ["food"],
    });
    const atBound = makeActivity({
      id: "n",
      type: "expense",
      dateTime: "2026-12-01T00:00:00.000Z",
      tags: ["food"],
    });
    const res = searchActivities(
      [inRange, wrongType, wrongTag, before, atBound],
      {
        since: "2026-01-01T00:00:00.000Z",
        until: "2026-12-01T00:00:00.000Z",
        tag: "food",
        type: "expense",
      },
    );
    expect(res.map((x) => x.id)).toEqual(["act-1"]);
  });

  it("handles a multi-year (5-year) window correctly", () => {
    const all = makeFiveYearDataset();
    const in2024 = searchActivities(all, {
      since: "2024-01-01T00:00:00.000Z",
      until: "2025-01-01T00:00:00.000Z",
    });
    expect(in2024).toHaveLength(2);
    expect(in2024.every((a) => a.dateTime.startsWith("2024-"))).toBe(true);

    // Full 5-year window returns everything
    const all5y = searchActivities(all, {
      since: "2022-01-01T00:00:00.000Z",
      until: "2027-01-01T00:00:00.000Z",
    });
    expect(all5y).toHaveLength(all.length);
  });
});

describe("summarizeByTag", () => {
  it("returns [] for untagged and empty inputs", () => {
    expect(summarizeByTag([])).toEqual([]);
    expect(summarizeByTag([makeActivity({ tags: [] })])).toEqual([]);
  });

  it("rolls up a single-tag expense into totalOutCents", () => {
    const res = summarizeByTag([
      makeActivity({ type: "expense", tags: ["food"], amountCents: 1200 }),
    ]);
    expect(res).toEqual([
      { tag: "food", totalInCents: 0, totalOutCents: 1200 },
    ]);
  });

  it("rolls up income and deposit into totalInCents and expense into totalOutCents", () => {
    const res = summarizeByTag([
      makeActivity({ type: "income", tags: ["salary"], amountCents: 1000 }),
      makeActivity({ type: "deposit", tags: ["salary"], amountCents: 400 }),
      makeActivity({ type: "expense", tags: ["salary"], amountCents: 300 }),
    ]);
    expect(res).toEqual([
      { tag: "salary", totalInCents: 1400, totalOutCents: 300 },
    ]);
  });

  it("contributes a multi-tag activity's cents to each of its tags", () => {
    const res = summarizeByTag([
      makeActivity({
        type: "expense",
        tags: ["housing", "rent"],
        amountCents: 5000,
      }),
    ]);
    expect(res).toEqual([
      { tag: "housing", totalInCents: 0, totalOutCents: 5000 },
      { tag: "rent", totalInCents: 0, totalOutCents: 5000 },
    ]);
  });

  it("sorts tags alphabetically (localeCompare) and sums across mixed types", () => {
    const res = summarizeByTag([
      makeActivity({ type: "expense", tags: ["zeta"], amountCents: 100 }),
      makeActivity({ type: "income", tags: ["alpha"], amountCents: 200 }),
      makeActivity({ type: "expense", tags: ["beta"], amountCents: 50 }),
      makeActivity({ type: "income", tags: ["alpha"], amountCents: 300 }),
    ]);
    expect(res.map((s) => s.tag)).toEqual(["alpha", "beta", "zeta"]);
    expect(res[0]).toEqual({
      tag: "alpha",
      totalInCents: 500,
      totalOutCents: 0,
    });
  });

  it("excludes soft-deleted (deletedAt) activities from the rollup", () => {
    const res = summarizeByTag([
      makeActivity({ type: "expense", tags: ["food"], amountCents: 100 }),
      makeActivity({
        id: "x",
        type: "expense",
        tags: ["food"],
        amountCents: 9999,
        deletedAt: "2026-11-02T00:00:00.000Z",
      }),
    ]);
    expect(res).toEqual([{ tag: "food", totalInCents: 0, totalOutCents: 100 }]);
  });

  it("composes with searchActivities: summarizeByTag(searchActivities(...))", () => {
    const all = makeFiveYearDataset();
    const res = summarizeByTag(
      searchActivities(all, {
        since: "2024-01-01T00:00:00.000Z",
        until: "2025-01-01T00:00:00.000Z",
      }),
    );
    expect(res).toEqual([
      { tag: "food", totalInCents: 0, totalOutCents: 8000 },
      { tag: "salary", totalInCents: 45000, totalOutCents: 0 },
      { tag: "travel", totalInCents: 0, totalOutCents: 8000 },
    ]);
  });
});

describe("OQ-2 period attribution (activityPeriod & summarizeByPeriod)", () => {
  it("attributes a recurring activity to its Activity.period, not its dateTime", () => {
    const recurring = makeActivity({
      type: "income",
      source: "recurring",
      sourceRuleId: "rule-salary",
      period: "2026-11",
      // Even if dateTime were (hypothetically) in an adjacent month, period wins
      dateTime: "2026-11-01T12:00:00.000Z",
    });
    expect(activityPeriod(recurring)).toBe("2026-11");
  });

  it("buckets a non-recurring activity by the UTC month of its dateTime", () => {
    const manual = makeActivity({
      type: "expense",
      dateTime: "2026-11-30T12:00:00.000Z",
      tags: ["food"],
    });
    expect(activityPeriod(manual)).toBe("2026-11");
    // A 1st-of-month manual activity is attributed by dateTime, not a period field
    const firstOfMonth = makeActivity({
      id: "f",
      dateTime: "2026-12-01T00:00:00.000Z",
      tags: [],
    });
    expect(activityPeriod(firstOfMonth)).toBe("2026-12");
  });

  it("keeps a recurring item in its Activity.period even when dateTime is in an adjacent month (timezone/edit safety)", () => {
    const recurring = makeActivity({
      type: "expense",
      source: "recurring",
      sourceRuleId: "rule-rent",
      period: "2026-12",
      // User edited the timestamp to an earlier month — period attribution still holds
      dateTime: "2026-11-15T12:00:00.000Z",
      tags: ["housing"],
    });
    const manual = makeActivity({
      id: "m",
      type: "expense",
      dateTime: "2026-11-15T12:00:00.000Z",
      tags: ["food"],
    });
    const res = summarizeByPeriod([recurring, manual]);
    expect(res).toHaveLength(2);
    expect(res.map((p) => p.period)).toEqual(["2026-11", "2026-12"]);
    const nov = res.find((p) => p.period === "2026-11");
    const dec = res.find((p) => p.period === "2026-12");
    expect(nov?.totalOutCents).toBe(manual.amountCents);
    expect(dec?.totalOutCents).toBe(recurring.amountCents);
    expect(nov?.tags).toEqual([
      { tag: "food", totalInCents: 0, totalOutCents: manual.amountCents },
    ]);
    expect(dec?.tags).toEqual([
      {
        tag: "housing",
        totalInCents: 0,
        totalOutCents: recurring.amountCents,
      },
    ]);
  });

  it("returns [] for empty input and excludes deleted activities", () => {
    expect(summarizeByPeriod([])).toEqual([]);
    expect(
      summarizeByPeriod([
        makeActivity({
          dateTime: "2026-11-01T00:00:00.000Z",
          deletedAt: "2026-11-02T00:00:00.000Z",
        }),
      ]),
    ).toEqual([]);
  });
});

describe("end-to-end pure src/core/ composition (#238)", () => {
  it("runs validate -> runRecurringEngine -> computeAvailableFunds -> searchActivities -> summarizeByTag", () => {
    // 1. Validate an untrusted backup payload (validate.ts)
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      exportedAt: "2026-11-15T12:00:00.000Z",
      rules: [
        {
          id: "rule-salary",
          name: "Monthly Salary",
          type: "income",
          amountCents: 500_000,
          currency: "USD",
          schedule: { cadence: "monthly", dayOfMonth: 1 },
          active: true,
          lastPostPeriod: "2026-10",
          createdAt: "2026-10-01T12:00:00.000Z",
          updatedAt: "2026-10-01T12:00:00.000Z",
        },
      ],
      activities: [
        {
          id: "act-manual-expense",
          type: "expense",
          amountCents: 12000,
          currency: "USD",
          dateTime: "2026-11-05T12:00:00.000Z",
          tags: ["housing"],
          source: "manual",
          createdAt: "2026-11-05T12:00:00.000Z",
          updatedAt: "2026-11-05T12:00:00.000Z",
        },
      ],
    });
    const backup: BudgetBackup = validateBackupPayload(rawJson);
    expect(backup.activities).toHaveLength(1);
    expect(backup.rules).toHaveLength(1);

    // 2. Run the recurring engine to materialize the Nov 2026 salary (engine.ts)
    const result = runRecurringEngine({
      rules: backup.rules,
      activities: backup.activities,
      now: new Date("2026-11-15T12:00:00.000Z"),
      idFactory: () => "rule-salary-2026-11",
      timestamp: "2026-11-15T12:00:00.000Z",
    });
    expect(result.posted).toHaveLength(1);
    const postedActivity = result.posted[0];
    expect(postedActivity?.type).toBe("income");
    expect(postedActivity?.period).toBe("2026-11");
    const combined: Activity[] = [...backup.activities, ...result.posted];

    // 3. Derive Available Funds from the combined log (funds.ts)
    const funds = computeAvailableFunds(combined);
    expect(funds).toBe(500_000 - 12_000);
    expect(Number.isSafeInteger(funds)).toBe(true);

    // 4. Search the Nov 2026 window (insights.ts)
    const nov = searchActivities(combined, {
      since: "2026-11-01T00:00:00.000Z",
      until: "2026-12-01T00:00:00.000Z",
    });
    expect(nov).toHaveLength(2);

    // 5. Roll up by tag (insights.ts)
    const tags = summarizeByTag(nov);
    expect(tags).toEqual([
      { tag: "housing", totalInCents: 0, totalOutCents: 12_000 },
    ]);

    // 6. Period rollup (OQ-2) — the recurring salary is attributed to its
    //    Activity.period ("2026-11") rather than its dateTime-slice.
    const periods = summarizeByPeriod(combined);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.period).toBe("2026-11");
    expect(periods[0]?.totalInCents).toBe(500_000);
    expect(periods[0]?.totalOutCents).toBe(12_000);
  });
});
