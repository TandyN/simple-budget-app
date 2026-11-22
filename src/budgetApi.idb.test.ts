import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createBudgetApi } from "./budgetApi";
import { IndexedDbAdapter } from "./storage/indexeddb";

/**
 * Integration tests wiring the **public** `createBudgetApi` to the **real**
 * `IndexedDbAdapter` (not the test-only `InMemoryAdapter`), closing the
 * "all tests pass, integration broken" hole: the previously-uncovered
 * `IndexedDbAdapter.save` / `delete` / `query` CRUD path (the production
 * persistence seam) is now exercised end-to-end through the public API surface.
 *
 * Uses `fake-indexeddb` (a devDependency) injected via the adapter's
 * `idbFactory` constructor argument — no DOM, no Node globals, zero production
 * dependencies (`project-plan/dependency-strategy.md`).
 *
 * The canonical flow (`project-plan/portability.md → The public API`):
 *
 * ```ts
 * const budget = createBudgetApi({ adapter: new IndexedDbAdapter() });
 * await budget.init();
 * await budget.addRule({ name: "Salary", type: "income", amountCents: 500000,
 *                        schedule: { cadence: "monthly", dayOfMonth: 1 } });
 * await budget.runRecurringEngine();   // posts the due period
 * const funds = await budget.getAvailableFunds(); // derived, integer cents
 * ```
 *
 * `createBudgetApi` is exercised exactly as a front-end would: a deterministic
 * id factory and clock (mirroring `src/budgetApi.test.ts`) make assertions on
 * the system-generated `id` / `createdAt` / `updatedAt` stable, while every
 * read-back goes through the real IndexedDB object stores (not a JS Map).
 */

/**
 * Deterministic clock: starts at `startIso` and advances one second per call,
 * so `createdAt` and a subsequent `updatedAt` are distinct and ordered.
 */
function makeClock(startIso: string): () => Date {
  let ms = Date.parse(startIso);
  return () => {
    ms += 1_000;
    return new Date(ms);
  };
}

/**
 * Build a public `createBudgetApi` over the **real** `IndexedDbAdapter`, each
 * call backed by a fresh, isolated `IDBFactory` (a clean in-memory namespace
 * per test — no state leaks between tests, matching the sibling `fake-indexeddb`
 * pattern in `src/storage/indexeddb.test.ts`).
 */
function makeIdbApi() {
  const adapter = new IndexedDbAdapter(new IDBFactory());
  const idCounter = { n: 0 };
  const idFactory = () => {
    idCounter.n += 1;
    return `id-${idCounter.n}`;
  };
  const clock = makeClock("2026-11-20T00:00:00.000Z");
  const api = createBudgetApi({ adapter, idFactory, now: clock });
  return { adapter, idFactory, clock, api };
}

describe("createBudgetApi × IndexedDbAdapter — canonical flow (#266)", () => {
  it("init → addRule → runRecurringEngine → listActivities → getAvailableFunds, end-to-end against real IndexedDB", async () => {
    const { api } = makeIdbApi();

    // 1. init() opens the real adapter store (idempotent — a second call
    //    resolves immediately without re-running onupgradeneeded).
    await api.init();
    await api.init();
    await expect(api.listRules()).resolves.toEqual([]);
    await expect(api.listActivities()).resolves.toEqual([]);

    // 2. addRule persists through the real `IndexedDbAdapter.save` and reads
    //    back through the real `query`.
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });
    expect(rule.id).toBe("id-1");
    const listedRules = await api.listRules();
    expect(listedRules).toEqual([rule]);
    expect(listedRules[0]?.name).toBe("Salary");
    expect(listedRules[0]?.amountCents).toBe(500_000);

    // 3. runRecurringEngine posts the due period (real `query` + real `save`
    //    for both the posted activity and the advanced rule).
    const now = new Date("2026-11-20T00:00:00.000Z");
    const { posted } = await api.runRecurringEngine(now);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.source).toBe("recurring");
    expect(posted[0]?.sourceRuleId).toBe(rule.id);
    expect(posted[0]?.period).toBe("2026-11");
    expect(posted[0]?.dateTime).toBe("2026-11-01T12:00:00.000Z");

    // 4. listActivities reads the posted activity back from real IndexedDB.
    const activities = await api.listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]).toEqual(posted[0]);
    expect(activities[0]?.sourceRuleId).toBe(rule.id);

    // 5. getAvailableFunds derives the integer-cents value from the
    //    persisted activity (500_000 income → 500_000 available).
    await expect(api.getAvailableFunds()).resolves.toBe(500_000);

    // The advanced rule's lastPostPeriod is persisted through the real save.
    const afterRules = await api.listRules();
    expect(afterRules[0]?.lastPostPeriod).toBe("2026-11");

    // Idempotent: a second run at the same `now` posts nothing new.
    const second = await api.runRecurringEngine(now);
    expect(second.posted).toEqual([]);
    expect((await api.listActivities()).length).toBe(1);
  });
});

describe("createBudgetApi × IndexedDbAdapter — rule CRUD (#266)", () => {
  it("addRule persists and reads back through the real adapter", async () => {
    const { api } = makeIdbApi();
    await api.init();

    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });
    expect(rule.id).toBe("id-1");
    expect(rule.active).toBe(true);
    expect(rule.lastPostPeriod).toBeNull();
    expect(rule.createdAt).toBe("2026-11-20T00:00:01.000Z");

    const listed = await api.listRules();
    expect(listed).toEqual([rule]);
  });

  it("editRule round-trips through real IndexedDB (read-back reflects the write)", async () => {
    const { api } = makeIdbApi();
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

    // Read-back through the real adapter reflects the write.
    const listed = await api.listRules();
    expect(listed).toEqual([edited]);
  });

  it("editRule rejects unknown ids (no stored record touched)", async () => {
    const { api } = makeIdbApi();
    await api.init();
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 500_000,
    });

    await expect(api.editRule("nope", { name: "X" })).rejects.toThrow(
      /no rule with id "nope"/,
    );
    const listed = await api.listRules();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(rule);
  });

  it("setRuleActive toggles `active` and round-trips through real IndexedDB", async () => {
    const { api } = makeIdbApi();
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

    const listed = await api.listRules();
    expect(listed[0]?.active).toBe(true); // read-back reflects the last write
  });

  it("deleteRule removes the rule (read-back empty); idempotent for unknown id", async () => {
    const { api } = makeIdbApi();
    await api.init();
    const rule = await api.addRule({
      name: "Salary",
      type: "income",
      amountCents: 1_000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });

    // Post an activity so we can assert it survives rule deletion.
    await api.runRecurringEngine(new Date("2026-11-20T00:00:00.000Z"));
    expect((await api.listActivities()).length).toBe(1);

    await api.deleteRule(rule.id);
    await api.deleteRule(rule.id); // idempotent
    await api.deleteRule("no-such-rule"); // idempotent for unknown id

    // Read-back through the real adapter: the rule is gone, the posted
    // activity survives.
    await expect(api.listRules()).resolves.toEqual([]);
    const activities = await api.listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]?.sourceRuleId).toBe(rule.id);
  });
});

describe("createBudgetApi × IndexedDbAdapter — activity CRUD (#266)", () => {
  it("addActivity persists and reads back through the real adapter", async () => {
    const { api } = makeIdbApi();
    await api.init();

    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4200,
      dateTime: "2026-11-15T09:30:00.000Z",
      tags: ["food"],
      memo: "Lunch",
    });

    expect(activity.id).toBe("id-1");
    expect(activity.type).toBe("expense");
    expect(activity.amountCents).toBe(4200);
    expect(activity.tags).toEqual(["food"]);
    expect(activity.memo).toBe("Lunch");
    expect(activity.source).toBe("manual");
    expect(activity.sourceRuleId).toBeUndefined();
    expect(activity.period).toBeUndefined();

    const listed = await api.listActivities();
    expect(listed).toEqual([activity]);
  });

  it("editActivity round-trips through real IndexedDB (read-back reflects the write)", async () => {
    const { api } = makeIdbApi();
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

    // Read-back through the real adapter reflects the write.
    const listed = await api.listActivities();
    expect(listed).toEqual([edited]);
  });

  it("editActivity rejects unknown ids (no stored record touched)", async () => {
    const { api } = makeIdbApi();
    await api.init();
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4200,
    });

    await expect(api.editActivity("nope", { memo: "X" })).rejects.toThrow(
      /no activity with id "nope"/,
    );
    const listed = await api.listActivities();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(activity);
  });

  it("deleteActivity removes the record (read-back empty); idempotent for unknown id", async () => {
    const { api } = makeIdbApi();
    await api.init();
    const activity = await api.addActivity({
      type: "expense",
      amountCents: 4200,
    });

    await api.deleteActivity(activity.id);
    await api.deleteActivity(activity.id); // idempotent
    await api.deleteActivity("no-such-activity"); // idempotent for unknown id

    await expect(api.listActivities()).resolves.toEqual([]);
    await expect(api.getAvailableFunds()).resolves.toBe(0);
  });
});
