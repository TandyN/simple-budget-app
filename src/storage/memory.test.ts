import { describe, expect, it } from "vitest";
import type { Activity, RecurringRule } from "../core/types";
import type { EntityKey, StorageAdapter } from "./adapter";
import { InMemoryAdapter } from "./memory";

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "rule-1",
    name: "Salary",
    type: "income",
    amountCents: 500_000,
    currency: "USD",
    schedule: { cadence: "monthly", dayOfMonth: 1 },
    active: true,
    lastPostPeriod: null,
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-1",
    type: "expense",
    amountCents: 1_000,
    currency: "USD",
    dateTime: "2026-11-01T12:00:00.000Z",
    tags: ["food"],
    source: "manual",
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("InMemoryAdapter — lifecycle", () => {
  it("open() resolves immediately and is idempotent", async () => {
    const adapter = new InMemoryAdapter();
    await expect(adapter.open()).resolves.toBeUndefined();
    await expect(adapter.open()).resolves.toBeUndefined();
  });

  it("starts empty for both entity collections and meta", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.open();
    await expect(adapter.query("rules")).resolves.toEqual([]);
    await expect(adapter.query("activities")).resolves.toEqual([]);
    await expect(adapter.getMeta("lastBackupAt")).resolves.toBeNull();
  });

  it("is a StorageAdapter implementation (structural conformance)", () => {
    const adapter: StorageAdapter = new InMemoryAdapter();
    expect(typeof adapter.open).toBe("function");
    expect(typeof adapter.save).toBe("function");
    expect(typeof adapter.delete).toBe("function");
    expect(typeof adapter.query).toBe("function");
    expect(typeof adapter.replaceAll).toBe("function");
    expect(typeof adapter.getMeta).toBe("function");
    expect(typeof adapter.setMeta).toBe("function");
  });
});

describe("InMemoryAdapter — save / query / delete", () => {
  it("saves a rule and queries it back", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.open();
    await adapter.save("rules", makeRule());
    await expect(adapter.query("rules")).resolves.toEqual([makeRule()]);
  });

  it("saves an activity and queries it back", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.open();
    await adapter.save("activities", makeActivity());
    await expect(adapter.query("activities")).resolves.toEqual([
      makeActivity(),
    ]);
  });

  it("upserts: saving the same id twice keeps one record with the latest value", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.open();
    await adapter.save("rules", makeRule({ name: "Salary" }));
    await adapter.save("rules", makeRule({ name: "Pay" }));
    const rules = await adapter.query("rules");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe("Pay");
  });

  it("stores independent copies: mutating the caller's object after save does not alter stored state", async () => {
    const adapter = new InMemoryAdapter();
    const rule = makeRule({ name: "Salary" });
    await adapter.save("rules", rule);
    rule.name = "MUTATED";
    const rules = await adapter.query("rules");
    expect(rules[0]?.name).toBe("Salary");
  });

  it("returns fresh copies from query: mutating a result does not alter stored state", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.save("rules", makeRule());
    const first = await adapter.query("rules");
    if (first[0] !== undefined) {
      first[0].name = "MUTATED";
    }
    const second = await adapter.query("rules");
    expect(second[0]?.name).toBe("Salary");
  });

  it("filters by a QueryPredicate ({ field, eq })", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.save(
      "activities",
      makeActivity({ id: "a1", source: "recurring", sourceRuleId: "r1" }),
    );
    await adapter.save(
      "activities",
      makeActivity({ id: "a2", source: "manual" }),
    );
    await adapter.save(
      "activities",
      makeActivity({
        id: "a3",
        source: "recurring",
        sourceRuleId: "r1",
        type: "income",
      }),
    );

    const byRule = await adapter.query("activities", {
      field: "sourceRuleId",
      eq: "r1",
    });
    expect(byRule.map((a) => a.id)).toEqual(["a1", "a3"]);

    const manual = await adapter.query("activities", {
      field: "source",
      eq: "manual",
    });
    expect(manual.map((a) => a.id)).toEqual(["a2"]);
  });

  it("returns an empty array when no record matches the predicate", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.save("activities", makeActivity());
    await expect(
      adapter.query("activities", { field: "type", eq: "deposit" }),
    ).resolves.toEqual([]);
  });

  it("deletes a saved record by id", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.save("rules", makeRule());
    await adapter.delete("rules", "rule-1");
    await expect(adapter.query("rules")).resolves.toEqual([]);
  });

  it("delete() is idempotent: deleting an unknown id resolves cleanly", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.save("activities", makeActivity());
    await expect(adapter.delete("activities", "nope")).resolves.toBeUndefined();
    // Existing records are untouched.
    await expect(adapter.query("activities")).resolves.toEqual([
      makeActivity(),
    ]);
  });

  it("rejects a save whose record has no non-empty string id", async () => {
    const adapter = new InMemoryAdapter();
    const bad = { ...makeRule(), id: "" };
    await expect(adapter.save("rules", bad)).rejects.toThrow(
      /non-empty string "id"/,
    );
    // The store is untouched.
    await expect(adapter.query("rules")).resolves.toEqual([]);
  });

  it("rejects for an unknown object store on save/delete/query (defensive)", async () => {
    const adapter = new InMemoryAdapter();
    const bogus = "bogus" as EntityKey;
    await expect(adapter.save(bogus, makeRule())).rejects.toThrow(
      /unknown object store/,
    );
    await expect(adapter.delete(bogus, "x")).rejects.toThrow(
      /unknown object store/,
    );
    await expect(adapter.query(bogus)).rejects.toThrow(/unknown object store/);
  });
});

describe("InMemoryAdapter — meta", () => {
  it("getMeta() returns null for an absent key", async () => {
    const adapter = new InMemoryAdapter();
    await expect(adapter.getMeta("lastBackupAt")).resolves.toBeNull();
  });

  it("setMeta() then getMeta() round-trips a value", async () => {
    const adapter = new InMemoryAdapter();
    const ts = "2026-11-19T00:00:00.000Z";
    await adapter.setMeta("lastBackupAt", ts);
    await expect(adapter.getMeta("lastBackupAt")).resolves.toBe(ts);
  });

  it("setMeta() upserts: a later write to the same key replaces the value", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.setMeta("lastBackupAt", "2026-01-01T00:00:00.000Z");
    await adapter.setMeta("lastBackupAt", "2026-11-01T00:00:00.000Z");
    await expect(adapter.getMeta("lastBackupAt")).resolves.toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });

  it("meta keys are independent of entity stores", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.save("rules", makeRule());
    await adapter.setMeta("rules", "meta-value");
    await expect(adapter.query("rules")).resolves.toEqual([makeRule()]);
    await expect(adapter.getMeta("rules")).resolves.toBe("meta-value");
  });
});

describe("InMemoryAdapter — replaceAll (atomic restore contract)", () => {
  it("replaces both collections with the provided records", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.save("rules", makeRule({ id: "old-rule" }));
    await adapter.save("activities", makeActivity({ id: "old-act" }));

    const newRule = makeRule({ id: "new-rule" });
    const newActivity = makeActivity({ id: "new-act", type: "income" });
    await adapter.replaceAll({ rules: [newRule], activities: [newActivity] });

    await expect(adapter.query("rules")).resolves.toEqual([newRule]);
    await expect(adapter.query("activities")).resolves.toEqual([newActivity]);
  });

  it("replaces with empty collections (a full wipe)", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.save("rules", makeRule());
    await adapter.save("activities", makeActivity());
    await adapter.replaceAll({ rules: [], activities: [] });
    await expect(adapter.query("rules")).resolves.toEqual([]);
    await expect(adapter.query("activities")).resolves.toEqual([]);
  });

  it("leaves both collections untouched when rules is not an array", async () => {
    const adapter = new InMemoryAdapter();
    const rule = makeRule();
    const act = makeActivity();
    await adapter.save("rules", rule);
    await adapter.save("activities", act);

    await expect(
      adapter.replaceAll({
        rules: "not-an-array" as unknown as RecurringRule[],
        activities: [],
      }),
    ).rejects.toThrow(/must be an array/);

    await expect(adapter.query("rules")).resolves.toEqual([rule]);
    await expect(adapter.query("activities")).resolves.toEqual([act]);
  });

  it("leaves both collections untouched when activities is not an array", async () => {
    const adapter = new InMemoryAdapter();
    const rule = makeRule();
    const act = makeActivity();
    await adapter.save("rules", rule);
    await adapter.save("activities", act);

    await expect(
      adapter.replaceAll({
        rules: [],
        activities: "nope" as unknown as Activity[],
      }),
    ).rejects.toThrow(/must be an array/);

    await expect(adapter.query("rules")).resolves.toEqual([rule]);
    await expect(adapter.query("activities")).resolves.toEqual([act]);
  });

  it("leaves both collections untouched when a record lacks a non-empty id", async () => {
    const adapter = new InMemoryAdapter();
    const rule = makeRule();
    await adapter.save("rules", rule);
    await adapter.save("activities", makeActivity());

    const bad = { ...makeRule(), id: "" };
    await expect(
      adapter.replaceAll({
        rules: [makeRule({ id: "ok" }), bad],
        activities: [makeActivity()],
      }),
    ).rejects.toThrow(/non-empty string "id"/);

    await expect(adapter.query("rules")).resolves.toEqual([rule]);
    await expect(adapter.query("activities")).resolves.toEqual([
      makeActivity(),
    ]);
  });

  it("validates the payload before swapping: invalid activities abort even if rules are valid", async () => {
    const adapter = new InMemoryAdapter();
    const existingRule = makeRule();
    const existingAct = makeActivity();
    await adapter.save("rules", existingRule);
    await adapter.save("activities", existingAct);

    await expect(
      adapter.replaceAll({
        rules: [makeRule({ id: "new-rule" })],
        activities: [{ ...makeActivity(), id: 42 as unknown as string }],
      }),
    ).rejects.toThrow(/non-empty string "id"/);

    // Neither collection was swapped.
    await expect(adapter.query("rules")).resolves.toEqual([existingRule]);
    await expect(adapter.query("activities")).resolves.toEqual([existingAct]);
  });

  it("stores independent copies of the imported records", async () => {
    const adapter = new InMemoryAdapter();
    const rule = makeRule({ id: "imported" });
    await adapter.replaceAll({ rules: [rule], activities: [] });
    rule.name = "MUTATED-AFTER-IMPORT";
    await expect(adapter.query("rules")).resolves.toEqual([
      makeRule({ id: "imported" }),
    ]);
  });

  it("preserves insertion order of the imported records", async () => {
    const adapter = new InMemoryAdapter();
    const a1 = makeActivity({ id: "a1" });
    const a2 = makeActivity({ id: "a2" });
    const a3 = makeActivity({ id: "a3" });
    await adapter.replaceAll({ rules: [], activities: [a2, a3, a1] });
    await expect(adapter.query("activities")).resolves.toEqual([a2, a3, a1]);
  });
});
