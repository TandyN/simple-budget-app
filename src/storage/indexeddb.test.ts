import { indexedDB as fakeIndexedDB, IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { Activity, RecurringRule } from "../core/types";
import {
  DB_NAME,
  DB_VERSION,
  deriveDbName,
  IndexedDbAdapter,
} from "./indexeddb";

/**
 * T-A tests for `IndexedDbAdapter` (#246).
 *
 * Focus: the v1 schema (store + index set) and the basic `getMeta` / `setMeta`
 * round-trip. Atomic `replaceAll` / `VersionError` / `persist()` tests belong to
 * T-B (#249).
 *
 * Uses `fake-indexeddb` (a devDependency) injected via the `idbFactory`
 * constructor argument — no DOM, no Node globals, zero production dependencies.
 */

/** Open a fresh database through `factory`, running `onUpgrade` if provided. */
function openRaw(
  factory: IDBFactory,
  name: string,
  onUpgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, DB_VERSION);
    if (onUpgrade !== undefined) {
      req.onupgradeneeded = (event) => {
        onUpgrade((event.target as IDBOpenDBRequest).result);
      };
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

describe("deriveDbName (OQ-1, origin isolation)", () => {
  it("returns the production name for non-PR base paths", () => {
    expect(deriveDbName("/simple-budget-app/")).toBe("simple-budget-app");
    expect(deriveDbName("/")).toBe("simple-budget-app");
    expect(deriveDbName("/simple-budget-app")).toBe("simple-budget-app");
  });

  it("returns the namespaced PR-preview name for /pr-<N>/ base paths", () => {
    expect(deriveDbName("/simple-budget-app/pr-42/")).toBe(
      "simple-budget-app-pr-42",
    );
    expect(deriveDbName("/simple-budget-app/pr-7")).toBe(
      "simple-budget-app-pr-7",
    );
  });

  it("DB_NAME is derived from import.meta.env.BASE_URL", () => {
    expect(DB_NAME).toBe(
      deriveDbName(import.meta.env.BASE_URL ?? "/simple-budget-app/"),
    );
    expect(DB_NAME.length).toBeGreaterThan(0);
  });
});

describe("IndexedDbAdapter — DB_VERSION = 1 schema + index set", () => {
  it("creates the three object stores and the activities index set (multiEntry by_tags, compound by_rule_period)", async () => {
    const factory = fakeIndexedDB;
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    // Inspect the schema through a fresh read handle on the same factory.
    const inspect = await openRaw(factory, DB_NAME);
    const storeNames = [...inspect.objectStoreNames];
    expect(storeNames.sort()).toEqual(["activities", "meta", "rules"]);

    const activitiesTx = inspect.transaction("activities", "readonly");
    const activitiesStore = activitiesTx.objectStore("activities");
    expect([...activitiesStore.indexNames].sort()).toEqual(
      ["by_dateTime", "by_rule_period", "by_tags", "by_type"].sort(),
    );

    // by_tags is multi-entry (per-tag insights / search).
    expect(activitiesStore.index("by_tags").multiEntry).toBe(true);

    // by_rule_period is a compound index on [sourceRuleId, period] (single
    // IDBIndex, not multi-entry).
    expect(activitiesStore.index("by_rule_period").multiEntry).toBe(false);
  });

  it("does NOT create a boolean index on the rules store", async () => {
    const factory = fakeIndexedDB;
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    const inspect = await openRaw(factory, DB_NAME);
    const rulesTx = inspect.transaction("rules", "readonly");
    const rulesStore = rulesTx.objectStore("rules");
    // Booleans are not valid IndexedDB keys (W3C spec), so the `active`
    // field is intentionally not indexed; active vs. paused rules are filtered
    // in memory.
    expect([...rulesStore.indexNames]).toEqual([]);
    expect([...rulesStore.indexNames]).not.toContain("active");
    expect([...rulesStore.indexNames]).not.toContain("by_active");
  });
});

describe("IndexedDbAdapter — basic getMeta / setMeta round-trip", () => {
  it("round-trips a meta value and leaves the seeded schema record untouched", async () => {
    const factory = fakeIndexedDB;
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    const ts = "2026-11-19T00:00:00.000Z";
    await adapter.setMeta("lastBackupAt", {
      key: "lastBackupAt",
      timestamp: ts,
    });
    const back = await adapter.getMeta<{ key: string; timestamp: string }>(
      "lastBackupAt",
    );
    expect(back).toEqual({ key: "lastBackupAt", timestamp: ts });

    // Absent keys resolve to null.
    await expect(adapter.getMeta("does-not-exist")).resolves.toBeNull();
  });

  it("seeds a flat `schema` bookkeeping record in the meta store (onupgradeneeded)", async () => {
    const factory = fakeIndexedDB;
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    // The spec dictates a flat seeded record `{ key, schemaVersion, updatedAt }`
    // (migration bookkeeping, distinct from the `{ key, value }` envelope that
    // setMeta/getMeta use for generic meta). Read it straight from the `"meta"`
    // store through a fresh handle on the same factory + name.
    const inspect = await openRaw(factory, DB_NAME);
    const record = await new Promise<unknown>((resolve, reject) => {
      const req = inspect
        .transaction("meta", "readonly")
        .objectStore("meta")
        .get("schema");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(record).toMatchObject({
      key: "schema",
      schemaVersion: 1,
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it("upserts a meta key: a later write to the same key replaces the value", async () => {
    const factory = fakeIndexedDB;
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    await adapter.setMeta("k", "first");
    await adapter.setMeta("k", "second");
    await expect(adapter.getMeta("k")).resolves.toBe("second");
  });
});

describe("IndexedDbAdapter — atomic replaceAll (U1, #249)", () => {
  /** A valid deterministic `RecurringRule` for seeding / asserting. */
  function makeRule(id: string, lastPostPeriod: string): RecurringRule {
    return {
      id,
      name: `rule-${id}`,
      type: "expense",
      amountCents: 10_000,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
      lastPostPeriod,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  /** A valid deterministic recurring-generated `Activity`. */
  function makeActivity(
    id: string,
    sourceRuleId: string,
    period: string,
  ): Activity {
    return {
      id,
      type: "expense",
      amountCents: 10_000,
      currency: "USD",
      dateTime: "2026-03-15T00:00:00.000Z",
      tags: ["rent"],
      source: "recurring",
      sourceRuleId,
      period,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  /** Read every record from a store through a fresh readonly transaction. */
  function readAll(db: IDBDatabase, store: string): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, "readonly").objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
      req.onerror = () => reject(req.error);
    });
  }

  /** Write every record into a store inside one readwrite transaction. */
  function writeAll(
    db: IDBDatabase,
    store: string,
    records: readonly unknown[],
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const s = tx.objectStore(store);
      for (const record of records) {
        s.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  it("rolls back BOTH stores when a mid-transaction put fails, leaving prior data 100% intact and never calling deleteDatabase", async () => {
    const factory = fakeIndexedDB;
    const deleteDatabaseSpy = vi.spyOn(factory, "deleteDatabase");

    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    // Seed a known rules + activities set (the "prior data" we must preserve).
    const priorRules = [makeRule("rule-1", "2026-01")];
    const priorActivities = [makeActivity("act-1", "rule-1", "2026-01")];
    const seed = await openRaw(factory, DB_NAME);
    await writeAll(seed, "rules", priorRules);
    await writeAll(seed, "activities", priorActivities);

    // Force a genuine mid-transaction write failure: when the "bad" record is
    // queued, abort the readwrite transaction. This is exactly what a real
    // write error / quota rejection does in a browser — it aborts the
    // transaction and rolls back every participating store.
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: unknown,
    ): IDBRequest {
      if (
        value !== null &&
        typeof value === "object" &&
        (value as { id?: unknown }).id === "bad"
      ) {
        (this.transaction as IDBTransaction).abort();
        return undefined as unknown as IDBRequest;
      }
      return originalPut.call(this, value);
    };

    let rejected = false;
    try {
      await adapter.replaceAll({
        rules: [
          makeRule("new-rule", "2026-02"),
          { ...makeRule("bad", "2026-02") },
        ],
        activities: [makeActivity("new-act", "new-rule", "2026-02")],
      });
    } catch {
      rejected = true;
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    // (a) replaceAll rejects (does not resolve) on the failed restore.
    expect(rejected).toBe(true);

    // (b) The original rules AND activities are 100% intact — no partial write
    // (the new rule / new activity must be absent; the cleared originals must
    // be restored).
    const rulesAfter = await readAll(seed, "rules");
    const activitiesAfter = await readAll(seed, "activities");
    expect(rulesAfter).toEqual(priorRules);
    expect(activitiesAfter).toEqual(priorActivities);

    // (c) deleteDatabase is NEVER invoked on the failure path (project-plan/
    // storage.md → "deleteDatabase() forbidden").
    expect(deleteDatabaseSpy).not.toHaveBeenCalled();
    deleteDatabaseSpy.mockRestore();
  });

  it("supports a by_rule_period compound index lookup after a successful replaceAll", async () => {
    const factory = fakeIndexedDB;
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    const sourceRuleId = "rule-42";
    const period = "2026-03";
    const target = makeActivity("act-target", sourceRuleId, period);
    // Decoys: same rule different period, different rule same period.
    await adapter.replaceAll({
      rules: [makeRule(sourceRuleId, period)],
      activities: [
        target,
        makeActivity("act-other-period", sourceRuleId, "2026-02"),
        makeActivity("act-other-rule", "rule-99", period),
      ],
    });

    // Look up exactly (sourceRuleId, period) through the compound index.
    const inspect = await openRaw(factory, DB_NAME);
    const index = inspect
      .transaction("activities", "readonly")
      .objectStore("activities")
      .index("by_rule_period");
    const hit = await new Promise<unknown>((resolve, reject) => {
      const req = index.get([sourceRuleId, period]);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(hit).toEqual(target);
  });
});
