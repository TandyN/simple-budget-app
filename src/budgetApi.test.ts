import { describe, expect, it } from "vitest";
import { createBudgetApi } from "./budgetApi";
import type { Activity, RecurringRule } from "./core/types";
import { MAX_BACKUP_BYTES } from "./core/validate";
import { InMemoryAdapter } from "./storage/memory";

/**
 * `createBudgetApi` (V1: core CRUD + lifecycle, #247) tested against
 * `InMemoryAdapter` with a deterministic id factory and clock so assertions on
 * generated `id` / `createdAt` / `updatedAt` are stable.
 *
 * `project-plan/portability.md → The public API`: the front-end calls exactly
 * this surface; `init()` opens the store (idempotent) and does NOT auto-run
 * the engine or call `persist()`.
 */

interface TestClock {
  (): Date;
  /** The ISO-8601 UTC timestamp the next `clock()` call will produce. */
  readonly next: string;
}

/**
 * Deterministic clock: starts at `startIso` and advances one second per call,
 * so `createdAt` and a subsequent `updatedAt` are distinct and ordered.
 */
function makeClock(startIso: string): TestClock {
  let ms = Date.parse(startIso);
  const clock = (() => {
    ms += 1_000;
    return new Date(ms);
  }) as unknown as TestClock;
  Object.defineProperty(clock, "next", {
    get: () => new Date(ms + 1_000).toISOString(),
  });
  return clock;
}

function makeApi() {
  const adapter = new InMemoryAdapter();
  const idCounter = { n: 0 };
  const idFactory = () => {
    idCounter.n += 1;
    return `id-${idCounter.n}`;
  };
  const clock = makeClock("2026-11-20T00:00:00.000Z");
  const api = createBudgetApi({ adapter, idFactory, now: clock });
  return { adapter, idCounter, clock, api };
}

describe("createBudgetApi — lifecycle", () => {
  it("init() opens the store and is idempotent", async () => {
    const { api } = makeApi();
    await api.init();
    await expect(api.init()).resolves.toBeUndefined();
    await expect(api.listRules()).resolves.toEqual([]);
    await expect(api.listActivities()).resolves.toEqual([]);
  });

  it("init() does NOT auto-run the recurring engine or call persist()", async () => {
    const adapter = new InMemoryAdapter();
    const api = createBudgetApi({ adapter });
    // Seed a rule the engine would post for if it ran during init.
    const rule: RecurringRule = {
      id: "seed-rule",
      name: "Seed",
      type: "income",
      amountCents: 100,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
      lastPostPeriod: null,
      createdAt: "2026-11-01T12:00:00.000Z",
      updatedAt: "2026-11-01T12:00:00.000Z",
    };
    await adapter.save("rules", rule);
    await api.init();
    // The engine did not run: no auto-posted activities, rule un-advanced.
    await expect(api.listActivities()).resolves.toEqual([]);
    const rules = await api.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.lastPostPeriod).toBeNull();
  });

  it("rejects adapter use before init() with a clear error", async () => {
    const { api } = makeApi();
    await expect(api.listRules()).rejects.toThrow(/call init\(\)/);
    await expect(
      api.addRule({
        name: "X",
        type: "income",
        amountCents: 1,
      }),
    ).rejects.toThrow(/call init\(\)/);
    await expect(api.getAvailableFunds()).rejects.toThrow(/call init\(\)/);
    await expect(api.runRecurringEngine()).rejects.toThrow(/call init\(\)/);
  });
});

describe("createBudgetApi — rule CRUD round-trips", () => {
  it("addRule validates, generates system fields, and persists", async () => {
    const { api } = makeApi();
    await api.init();

    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });

    expect(rule.id).toBe("id-1");
    expect(rule.name).toBe("Salary");
    expect(rule.type).toBe("income");
    expect(rule.amountCents).toBe(500_000);
    expect(rule.currency).toBe("USD");
    expect(rule.schedule).toEqual({ cadence: "monthly", dayOfMonth: 1 });
    expect(rule.active).toBe(true);
    expect(rule.lastPostPeriod).toBeNull();
    expect(rule.createdAt).toBe("2026-11-20T00:00:01.000Z");
    expect(rule.updatedAt).toBe("2026-11-20T00:00:01.000Z");

    const listed = await api.listRules();
    expect(listed).toEqual([rule]);
  });

  it("addRule applies defaults (USD / day-1 monthly / active) and rejects invalid input", async () => {
    const { api } = makeApi();
    await api.init();

    const rule = await api.addRule({
      name: "Rent",
      type: "expense",
      amountCents: 1_200_00,
    });
    expect(rule.currency).toBe("USD");
    expect(rule.schedule).toEqual({ cadence: "monthly", dayOfMonth: 1 });
    expect(rule.active).toBe(true);

    await expect(
      api.addRule({ name: "Bad", type: "income", amountCents: 0 }),
    ).rejects.toThrow(/amountCents/);
    await expect(
      api.addRule({ name: "Bad", type: "deposit" as never, amountCents: 1 }),
    ).rejects.toThrow(/must be "income" or "expense"/);
    await expect(
      api.addRule({ name: "", type: "income", amountCents: 1 }),
    ).rejects.toThrow(/name/);
    // No rule was persisted by the rejected adds.
    const listed = await api.listRules();
    expect(listed).toHaveLength(1);
  });

  it("editRule merges user-editable fields and bumps updatedAt", async () => {
    const { api } = makeApi();
    await api.init();
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
    });

    const edited = await api.editRule(rule.id, {
      name: "Salary (adjusted)",
      amountCents: 520_000,
      schedule: { cadence: "monthly", dayOfMonth: 15 },
    });

    expect(edited.id).toBe(rule.id);
    expect(edited.name).toBe("Salary (adjusted)");
    expect(edited.amountCents).toBe(520_000);
    expect(edited.schedule).toEqual({ cadence: "monthly", dayOfMonth: 15 });
    expect(edited.type).toBe("income"); // untouched
    expect(edited.createdAt).toBe(rule.createdAt); // preserved
    expect(Date.parse(edited.updatedAt)).toBeGreaterThan(
      Date.parse(rule.updatedAt),
    );

    const listed = await api.listRules();
    expect(listed).toEqual([edited]);
  });

  it("editRule rejects unknown ids and invalid patches (stored record untouched)", async () => {
    const { api } = makeApi();
    await api.init();
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
    });

    await expect(api.editRule("nope", { name: "X" })).rejects.toThrow(
      /no rule with id "nope"/,
    );
    await expect(api.editRule(rule.id, { amountCents: -5 })).rejects.toThrow(
      /amountCents/,
    );

    const listed = await api.listRules();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(rule);
  });

  it("setRuleActive toggles `active` and bumps updatedAt; rejects unknown ids", async () => {
    const { api } = makeApi();
    await api.init();
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
    });

    const paused = await api.setRuleActive(rule.id, false);
    expect(paused.active).toBe(false);
    expect(Date.parse(paused.updatedAt)).toBeGreaterThan(
      Date.parse(rule.updatedAt),
    );

    const resumed = await api.setRuleActive(rule.id, true);
    expect(resumed.active).toBe(true);
    expect(Date.parse(resumed.updatedAt)).toBeGreaterThan(
      Date.parse(paused.updatedAt),
    );

    await expect(api.setRuleActive("nope", true)).rejects.toThrow(
      /no rule with id "nope"/,
    );
  });

  it("deleteRule removes the rule (idempotent) but NOT its posted activities", async () => {
    const { api } = makeApi();
    await api.init();
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 1_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });
    const run1 = await api.runRecurringEngine(
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(run1.posted).toHaveLength(1);

    await api.deleteRule(rule.id);
    await api.deleteRule(rule.id); // idempotent

    await expect(api.listRules()).resolves.toEqual([]);
    const activities = await api.listActivities();
    expect(activities).toHaveLength(1); // posted activity survives rule deletion
    expect(activities[0]?.sourceRuleId).toBe(rule.id);
  });
});

describe("createBudgetApi — activity CRUD round-trips", () => {
  it("addActivity validates, generates system fields, and sets source to manual", async () => {
    const { api } = makeApi();
    await api.init();

    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4200,
      currency: "USD",
      dateTime: "2026-11-15T09:30:00.000Z",
      tags: ["food"],
      memo: "Lunch",
    });

    expect(activity.id).toBe("id-1");
    expect(activity.type).toBe("expense");
    expect(activity.amountCents).toBe(4200);
    expect(activity.currency).toBe("USD");
    expect(activity.dateTime).toBe("2026-11-15T09:30:00.000Z");
    expect(activity.tags).toEqual(["food"]);
    expect(activity.memo).toBe("Lunch");
    expect(activity.source).toBe("manual");
    expect(activity.sourceRuleId).toBeUndefined();
    expect(activity.period).toBeUndefined();
    expect(activity.createdAt).toBe("2026-11-20T00:00:01.000Z");
    expect(activity.updatedAt).toBe("2026-11-20T00:00:01.000Z");

    const listed = await api.listActivities();
    expect(listed).toEqual([activity]);
  });

  it("addActivity applies defaults (USD / now / no tags) and rejects invalid input", async () => {
    const { api } = makeApi();
    await api.init();

    const activity = await api.addActivity({
      type: "deposit",
      amountCents: 100_00,
    });
    expect(activity.currency).toBe("USD");
    expect(activity.tags).toEqual([]);
    expect(activity.dateTime).toBe("2026-11-20T00:00:01.000Z");
    expect(activity.memo).toBeUndefined();

    await expect(
      api.addActivity({ type: "expense", amountCents: 0 }),
    ).rejects.toThrow(/amountCents/);
    await expect(
      api.addActivity({
        type: "expense",
        amountCents: 1,
        dateTime: "not-a-date",
      }),
    ).rejects.toThrow(/dateTime/);

    const listed = await api.listActivities();
    expect(listed).toHaveLength(1);
  });

  it("editActivity merges user-editable fields and bumps updatedAt", async () => {
    const { api } = makeApi();
    await api.init();
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4200,
      tags: ["food"],
    });

    const edited = await api.editActivity(activity.id, {
      amountCents: 5100,
      tags: ["food", "dinner"],
      memo: "edited",
      type: "expense",
    });

    expect(edited.id).toBe(activity.id);
    expect(edited.amountCents).toBe(5100);
    expect(edited.tags).toEqual(["food", "dinner"]);
    expect(edited.memo).toBe("edited");
    expect(edited.source).toBe("manual"); // provenance untouched
    expect(edited.createdAt).toBe(activity.createdAt); // preserved
    expect(Date.parse(edited.updatedAt)).toBeGreaterThan(
      Date.parse(activity.updatedAt),
    );

    const listed = await api.listActivities();
    expect(listed).toEqual([edited]);
  });

  it("editActivity rejects unknown ids and invalid patches (stored record untouched)", async () => {
    const { api } = makeApi();
    await api.init();
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4200,
    });

    await expect(api.editActivity("nope", { memo: "X" })).rejects.toThrow(
      /no activity with id "nope"/,
    );
    await expect(
      api.editActivity(activity.id, { amountCents: -1 }),
    ).rejects.toThrow(/amountCents/);
    await expect(
      api.editActivity(activity.id, { type: "transfer" as never }),
    ).rejects.toThrow(/must be "income", "expense", or "deposit"/);

    const listed = await api.listActivities();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(activity);
  });

  it("deleteActivity removes the record (idempotent)", async () => {
    const { api } = makeApi();
    await api.init();
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4200,
    });

    await api.deleteActivity(activity.id);
    await api.deleteActivity(activity.id); // idempotent

    await expect(api.listActivities()).resolves.toEqual([]);
    await expect(api.getAvailableFunds()).resolves.toBe(0);
  });
});

describe("createBudgetApi — listActivities(filter?) predicates", () => {
  async function seedActivities() {
    const { api } = makeApi();
    await api.init();
    await api.addActivity({
      type: "income",
      amountCents: 500_00,
      dateTime: "2026-11-01T12:00:00.000Z",
      tags: ["salary"],
    });
    await api.addActivity({
      type: "expense",
      amountCents: 1_000,
      dateTime: "2026-11-15T09:00:00.000Z",
      tags: ["food"],
    });
    await api.addActivity({
      type: "expense",
      amountCents: 2_500,
      dateTime: "2026-12-01T09:00:00.000Z",
      tags: ["food", "rent"],
    });
    return api;
  }

  it("lists all activities unbounded when no filter is given", async () => {
    const api = await seedActivities();
    await expect(api.listActivities()).resolves.toHaveLength(3);
  });

  it("applies the since predicate (inclusive lower bound)", async () => {
    const api = await seedActivities();
    const result = await api.listActivities({
      since: "2026-11-01T12:00:00.000Z",
    });
    expect(result).toHaveLength(3);

    const strict = await api.listActivities({
      since: "2026-11-01T12:00:01.000Z",
    });
    expect(strict).toHaveLength(2); // the 1st-of-November activity excluded
  });

  it("applies the until predicate (exclusive upper bound)", async () => {
    const api = await seedActivities();
    const result = await api.listActivities({
      until: "2026-11-15T09:00:00.000Z",
    });
    expect(result).toHaveLength(1); // only the 1st-of-November income

    const inclusive = await api.listActivities({
      until: "2026-12-01T00:00:00.000Z",
    });
    expect(inclusive).toHaveLength(2); // the 1st-of-December expense excluded
  });

  it("applies the tag and type predicates, and intersected predicates", async () => {
    const api = await seedActivities();

    const tagged = await api.listActivities({ tag: "food" });
    expect(tagged).toHaveLength(2);

    const typed = await api.listActivities({ type: "expense" });
    expect(typed).toHaveLength(2);

    const intersected = await api.listActivities({
      since: "2026-11-10T00:00:00.000Z",
      until: "2026-12-01T00:00:00.000Z",
      tag: "food",
      type: "expense",
    });
    expect(intersected).toHaveLength(1);
    expect(intersected[0]?.tags).toContain("food");
  });
});

describe("createBudgetApi — insights surface", () => {
  it("searchActivities delegates to the pure core filter", async () => {
    const { api } = makeApi();
    await api.init();
    await api.addActivity({
      type: "income",
      amountCents: 100,
      dateTime: "2026-11-01T12:00:00.000Z",
      tags: ["a"],
    });
    await api.addActivity({
      type: "expense",
      amountCents: 200,
      dateTime: "2026-11-02T12:00:00.000Z",
      tags: ["b"],
    });

    const result = await api.searchActivities({
      since: "2026-11-02T00:00:00.000Z",
      type: "expense",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.tags).toEqual(["b"]);
  });

  it("summarizeByTag rolls up money in / out per tag (integer cents)", async () => {
    const { api } = makeApi();
    await api.init();
    const a1 = await api.addActivity({
      type: "income",
      amountCents: 300,
      tags: ["salary"],
    });
    const a2 = await api.addActivity({
      type: "expense",
      amountCents: 50,
      tags: ["salary", "food"],
    });

    const summaries = await api.summarizeByTag([a1, a2]);
    expect(summaries).toEqual([
      { tag: "food", totalInCents: 0, totalOutCents: 50 },
      { tag: "salary", totalInCents: 300, totalOutCents: 50 },
    ]);
  });
});

describe("createBudgetApi — getAvailableFunds", () => {
  it("reflects the derived integer-cents value (income + deposit in, expense out)", async () => {
    const { api } = makeApi();
    await api.init();
    await expect(api.getAvailableFunds()).resolves.toBe(0); // empty

    await api.addActivity({ type: "income", amountCents: 50_000 });
    await api.addActivity({ type: "deposit", amountCents: 10_000 });
    await api.addActivity({ type: "expense", amountCents: 12_300 });
    await expect(api.getAvailableFunds()).resolves.toBe(47_700);

    // Editing and deleting activities updates the derived value.
    const activities = await api.listActivities();
    const expense = activities.find((a) => a.type === "expense");
    if (expense !== undefined) {
      await api.editActivity(expense.id, { amountCents: 22_300 });
    }
    await expect(api.getAvailableFunds()).resolves.toBe(37_700);

    await api.deleteActivity(expense?.id ?? "missing");
    await expect(api.getAvailableFunds()).resolves.toBe(60_000);
  });

  it("returns a negative value when expenses exceed income + deposits", async () => {
    const { api } = makeApi();
    await api.init();
    await api.addActivity({ type: "income", amountCents: 100 });
    await api.addActivity({ type: "expense", amountCents: 250 });
    await expect(api.getAvailableFunds()).resolves.toBe(-150);
  });
});

describe("createBudgetApi — runRecurringEngine", () => {
  it("posts due periods and persists posted activities + advanced rules", async () => {
    const { api } = makeApi();
    await api.init();
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });

    const now = new Date("2026-11-20T00:00:00.000Z");
    const { posted } = await api.runRecurringEngine(now);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.id).toBe("id-2");
    expect(posted[0]?.source).toBe("recurring");
    expect(posted[0]?.sourceRuleId).toBe(rule.id);
    expect(posted[0]?.period).toBe("2026-11");
    expect(posted[0]?.dateTime).toBe("2026-11-01T12:00:00.000Z");

    const rules = await api.listRules();
    expect(rules[0]?.lastPostPeriod).toBe("2026-11");
    const activities = await api.listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]?.id).toBe("id-2");
    expect(activities[0]?.sourceRuleId).toBe(rule.id);
  });

  it("forwards injected idFactory and now clock to the core engine for deterministic posted activity IDs (#262)", async () => {
    const adapter = new InMemoryAdapter();
    let seq = 0;
    const idFactory = () => {
      seq += 1;
      return `det-id-${seq}`;
    };
    const clock = makeClock("2026-11-20T00:00:00.000Z");
    const api = createBudgetApi({ adapter, idFactory, now: clock });
    await api.init();

    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });
    expect(rule.id).toBe("det-id-1");

    // Calling runRecurringEngine() without `now` forwards the injected `clock`
    // (`2026-11-20T00:00:02.000Z`) and `idFactory` (`"det-id-2"`).
    const firstRun = await api.runRecurringEngine();
    expect(firstRun.posted).toHaveLength(1);
    expect(firstRun.posted[0]?.id).toBe("det-id-2");
    expect(firstRun.posted[0]?.period).toBe("2026-11");
    expect(firstRun.posted[0]?.createdAt).toBe("2026-11-20T00:00:02.000Z");
    expect(firstRun.posted[0]?.updatedAt).toBe("2026-11-20T00:00:02.000Z");

    // Calling runRecurringEngine(explicitNow) across two due months uses the
    // explicit `now` and assigns deterministic IDs ("det-id-3", "det-id-4").
    const secondRun = await api.runRecurringEngine(
      new Date("2027-01-20T00:00:00.000Z"),
    );
    expect(
      secondRun.posted.map((a) => ({ id: a.id, period: a.period })),
    ).toEqual([
      { id: "det-id-3", period: "2026-12" },
      { id: "det-id-4", period: "2027-01" },
    ]);

    const storedActivities = await api.listActivities();
    expect(storedActivities.map((a) => a.id)).toEqual([
      "det-id-2",
      "det-id-3",
      "det-id-4",
    ]);
  });

  it("is idempotent: a second call at the same now posts nothing new", async () => {
    const { api } = makeApi();
    await api.init();
    await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });

    const now = new Date("2026-11-20T00:00:00.000Z");
    const first = await api.runRecurringEngine(now);
    expect(first.posted).toHaveLength(1);
    const countAfterFirst = (await api.listActivities()).length;
    const rulesAfterFirst = await api.listRules();

    const second = await api.runRecurringEngine(now);
    expect(second.posted).toEqual([]);
    expect((await api.listActivities()).length).toBe(countAfterFirst);
    const rulesAfterSecond = await api.listRules();
    expect(rulesAfterSecond).toEqual(rulesAfterFirst); // no further advance
  });

  it("skips inactive rules (no posting, no lastPostPeriod advance)", async () => {
    const { api } = makeApi();
    await api.init();
    const rule = await api.addRule({
      name: "Rent",
      type: "expense",
      amountCents: 1_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });
    await api.setRuleActive(rule.id, false);

    const now = new Date("2026-11-20T00:00:00.000Z");
    const { posted } = await api.runRecurringEngine(now);
    expect(posted).toEqual([]);
    await expect(api.listActivities()).resolves.toEqual([]);
    const rules = await api.listRules();
    expect(rules[0]?.lastPostPeriod).toBeNull();
  });
});

describe("createBudgetApi — V2 backup surface (#258)", () => {
  /** A valid `RecurringRule` entity for constructing backup payloads. */
  function mkRule(id: string, name = "Imported Rule"): RecurringRule {
    return {
      id,
      name,
      type: "income",
      amountCents: 100,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
      lastPostPeriod: null,
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z",
    };
  }

  /** A valid `Activity` entity for constructing backup payloads. */
  function mkActivity(
    id: string,
    type: "income" | "expense" | "deposit" = "expense",
  ): Activity {
    return {
      id,
      type,
      amountCents: 100,
      currency: "USD",
      dateTime: "2026-10-15T09:00:00.000Z",
      tags: [],
      source: "manual",
      createdAt: "2026-10-15T09:00:00.000Z",
      updatedAt: "2026-10-15T09:00:00.000Z",
    };
  }

  it("exportBackup() returns the versioned envelope and records lastBackupAt", async () => {
    const FIXED_ISO = "2026-11-21T12:00:00.000Z";
    const adapter = new InMemoryAdapter();
    const clock = (() => new Date(FIXED_ISO)) as () => Date;
    const api = createBudgetApi({ adapter, now: clock });
    await api.init();

    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
    });
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4_200,
    });

    const backup = await api.exportBackup();

    expect(backup.schemaVersion).toBe(1);
    expect(backup.exportedAt).toBe(FIXED_ISO);
    expect(backup.rules).toEqual([rule]);
    expect(backup.activities).toEqual([activity]);
    // getLastBackupAt() reads back the same ISO timestamp (not null).
    await expect(api.getLastBackupAt()).resolves.toBe(FIXED_ISO);
  });

  it("getLastBackupAt() returns null when never backed up", async () => {
    const { api } = makeApi();
    await api.init();
    await expect(api.getLastBackupAt()).resolves.toBeNull();
  });

  it("importBackup() rejects corrupt JSON while prior stored data stays 100% intact", async () => {
    const { api } = makeApi();
    await api.init();

    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
    });
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4_200,
    });

    const beforeRules = await api.listRules();
    const beforeActivities = await api.listActivities();
    const beforeFunds = await api.getAvailableFunds();
    const beforeLastBackup = await api.getLastBackupAt();

    await expect(api.importBackup("{not valid json")).rejects.toThrow(
      /Invalid backup payload JSON/,
    );

    // Prior data is unchanged (100% intact).
    await expect(api.listRules()).resolves.toEqual(beforeRules);
    await expect(api.listActivities()).resolves.toEqual(beforeActivities);
    await expect(api.getAvailableFunds()).resolves.toBe(beforeFunds);
    await expect(api.getLastBackupAt()).resolves.toBe(beforeLastBackup);
    // The failed import did not touch the rule or activity.
    expect((await api.listRules())[0]?.id).toBe(rule.id);
    expect((await api.listActivities())[0]?.id).toBe(activity.id);
  });

  it("importBackup() rejects an oversized (>10 MB) payload while prior stored data stays 100% intact", async () => {
    const { api } = makeApi();
    await api.init();

    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
    });
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4_200,
    });

    const beforeRules = await api.listRules();
    const beforeActivities = await api.listActivities();
    const beforeFunds = await api.getAvailableFunds();

    // The byte-ceiling check runs before any other validation in
    // `validateBackupPayload`, so a raw string exceeding 10 MB triggers the
    // size rejection regardless of its JSON shape.
    const oversizedJson = `"${"x".repeat(MAX_BACKUP_BYTES + 1)}"`;
    expect(new TextEncoder().encode(oversizedJson).byteLength).toBeGreaterThan(
      MAX_BACKUP_BYTES,
    );

    await expect(api.importBackup(oversizedJson)).rejects.toThrow(
      /exceeds 10 MB ceiling/,
    );

    await expect(api.listRules()).resolves.toEqual(beforeRules);
    await expect(api.listActivities()).resolves.toEqual(beforeActivities);
    await expect(api.getAvailableFunds()).resolves.toBe(beforeFunds);
    expect((await api.listRules())[0]?.id).toBe(rule.id);
    expect((await api.listActivities())[0]?.id).toBe(activity.id);
  });

  it("importBackup() rejects a prototype-polluting (__proto__) payload while prior stored data stays 100% intact", async () => {
    const { api } = makeApi();
    await api.init();

    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
    });
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4_200,
    });

    const beforeRules = await api.listRules();
    const beforeActivities = await api.listActivities();
    const beforeFunds = await api.getAvailableFunds();

    // A JSON string with a `__proto__` key at an activity level.
    const pollutedJson =
      '{"schemaVersion":1,"exportedAt":"2026-11-21T12:00:00.000Z","rules":[],"activities":[{"__proto__":{"polluted":true}}]}';
    expect(
      new TextEncoder().encode(pollutedJson).byteLength,
    ).toBeLessThanOrEqual(10 * 1024 * 1024);

    await expect(api.importBackup(pollutedJson)).rejects.toThrow(
      /Forbidden prototype-pollution key/,
    );

    await expect(api.listRules()).resolves.toEqual(beforeRules);
    await expect(api.listActivities()).resolves.toEqual(beforeActivities);
    await expect(api.getAvailableFunds()).resolves.toBe(beforeFunds);
    expect((await api.listRules())[0]?.id).toBe(rule.id);
    expect((await api.listActivities())[0]?.id).toBe(activity.id);
  });

  it("importBackup() with a valid payload replaces both collections and returns the correct counts", async () => {
    const { api } = makeApi();
    await api.init();

    // Seed prior data that will be replaced.
    await api.addRule({ name: "Old Rule", type: "income", amountCents: 100 });
    await api.addActivity({ type: "expense", amountCents: 200 });

    // Build a valid backup with distinct rules and activities.
    const importedRule1 = mkRule("imported-rule-1", "Imported Rule 1");
    const importedRule2 = mkRule("imported-rule-2", "Imported Rule 2");
    const importedActivity1 = mkActivity("imported-activity-1", "income");
    const importedActivity2 = mkActivity("imported-activity-2");
    const backupJson = JSON.stringify({
      schemaVersion: 1,
      exportedAt: "2026-11-21T12:00:00.000Z",
      rules: [importedRule1, importedRule2],
      activities: [importedActivity1, importedActivity2],
    });

    const result = await api.importBackup(backupJson);
    expect(result.rulesCount).toBe(2);
    expect(result.activitiesCount).toBe(2);

    // The prior data is gone; only the imported records remain.
    const rules = await api.listRules();
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id)).toEqual([
      "imported-rule-1",
      "imported-rule-2",
    ]);

    const activities = await api.listActivities();
    expect(activities).toHaveLength(2);
    expect(activities.map((a) => a.id)).toEqual([
      "imported-activity-1",
      "imported-activity-2",
    ]);

    // Available Funds reflects only the imported activities (1 income + 1 expense).
    await expect(api.getAvailableFunds()).resolves.toBe(0); // both 100 cents cancel
  });
});
