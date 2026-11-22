import {
  indexedDB as fakeIndexedDB,
  IDBFactory,
  IDBObjectStore,
} from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { Activity, RecurringRule } from "../core/types";
import {
  DB_NAME,
  DB_VERSION,
  deriveDbName,
  IndexedDbAdapter,
  VersionMismatchError,
} from "./indexeddb";

/**
 * Tests for `IndexedDbAdapter`.
 *
 * - **T-A** (#246): the v1 schema (store + index set) and the basic
 *   `getMeta` / `setMeta` round-trip.
 * - **U1** (#249): atomic `replaceAll` + rollback-leaves-prior-data tests.
 * - **U2** (#252): defensive, non-destructive `VersionError` handling in
 *   `open()` — a `VersionError` (on-disk version > `DB_VERSION`) rejects with a
 *   typed `VersionMismatchError` and NEVER calls `deleteDatabase()`.
 * - **U3** (#253): the best-effort durability API — `persist()` /
 *   `persisted()` resolve to `false` when `navigator.storage` is absent, and
 *   `getLastBackupAt()` round-trips the `"lastBackupAt"` meta record.
 * - **#265:** `save` / `delete` / `query` over the real adapter — upsert +
 *   idempotent delete + `{ field, eq }` predicate filtering (indexed and
 *   unindexed fields).
 * - **#255:** calling `replaceAll` / `save` / `delete` / `query` /
 *   `getLastBackupAt` / `getMeta` / `setMeta` before `open()` returns a
 *   rejected `Promise` (never throws synchronously).
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
    await adapter.setMeta("lastBackupAt", ts);
    const back = await adapter.getMeta<string>("lastBackupAt");
    expect(back).toBe(ts);

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

describe("IndexedDbAdapter — defensive VersionError handling in open() (U2, #252)", () => {
  /**
   * Pre-create a database at `version` on `factory` so the on-disk version is
   * HIGHER than the adapter's `DB_VERSION`, forcing a genuine W3C
   * `VersionError` when the adapter later calls `open(DB_NAME, DB_VERSION)`.
   */
  async function preCreateAtVersion(
    factory: IDBFactory,
    name: string,
    version: number,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = factory.open(name, version);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  it("rejects with a typed VersionMismatchError and NEVER calls deleteDatabase when on-disk version > DB_VERSION", async () => {
    // Isolated in-memory IDBFactory (fresh per-test): prior tests in this file
    // leave the shared `fakeIndexedDB` singleton with the DB open at
    // `DB_VERSION = 1`; a versionchange to `DB_VERSION + 1` would hang waiting
    // for those handles to close. A fresh `IDBFactory` gives a clean namespace.
    const factory = new IDBFactory();
    const deleteDatabaseSpy = vi.spyOn(factory, "deleteDatabase");

    // Force the VersionError precondition: on-disk DB at DB_VERSION + 1,
    // then open() at the lower DB_VERSION → W3C VersionError.
    await preCreateAtVersion(factory, DB_NAME, DB_VERSION + 1);

    const adapter = new IndexedDbAdapter(factory);

    // (a) open() REJECTS (does not resolve) with the typed error.
    let caught: unknown;
    try {
      await adapter.open();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VersionMismatchError);
    expect((caught as Error).name).toBe("VersionMismatchError");

    // (b) deleteDatabase is NEVER invoked on the VersionError path
    // (project-plan/storage.md → "deleteDatabase() forbidden").
    expect(deleteDatabaseSpy).not.toHaveBeenCalled();
    deleteDatabaseSpy.mockRestore();
  });

  it("leaves the higher-version on-disk database intact (non-destructive) after a VersionError rejection", async () => {
    // Isolated in-memory IDBFactory (see the sibling test for why).
    const factory = new IDBFactory();
    await preCreateAtVersion(factory, DB_NAME, DB_VERSION + 1);

    const adapter = new IndexedDbAdapter(factory);
    await expect(adapter.open()).rejects.toBeInstanceOf(VersionMismatchError);

    // The on-disk DB is still openable at its (higher) version — proving we did
    // not delete or downgrade it.
    const stillThere = await new Promise<boolean>((resolve) => {
      const req = factory.open(DB_NAME, DB_VERSION + 1);
      req.onsuccess = () => {
        req.result.close();
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
    expect(stillThere).toBe(true);
  });
});

describe("IndexedDbAdapter — best-effort durability API (U3, #253)", () => {
  /**
   * Replace the `navigator` global with a stub for the duration of `body`,
   * restoring the original binding afterwards. Vitest's `navigator` is a
   * getter-only accessor (no setter), so `defineProperty` is the only way to
   * stub it (and `delete` for the "absent" case).
   */
  async function withNavigatorStub(
    stub: { storage?: unknown } | undefined,
    body: () => Promise<void>,
  ): Promise<void> {
    const prev = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      if (stub === undefined) {
        delete (globalThis as { navigator?: unknown }).navigator;
      } else {
        Object.defineProperty(globalThis, "navigator", {
          value: stub,
          configurable: true,
          writable: true,
        });
      }
      await body();
    } finally {
      if (prev !== undefined) {
        Object.defineProperty(globalThis, "navigator", prev);
      } else {
        delete (globalThis as { navigator?: unknown }).navigator;
      }
    }
  }

  it("requestPersistenceAfterFirstAction() resolves to false when navigator.storage is absent (never throws)", async () => {
    const adapter = new IndexedDbAdapter();
    await withNavigatorStub(undefined, async () => {
      await expect(adapter.requestPersistenceAfterFirstAction()).resolves.toBe(
        false,
      );
    });
  });

  it("requestPersistenceAfterFirstAction() resolves to false when persist() rejects (denied/unsupported)", async () => {
    const adapter = new IndexedDbAdapter();
    const persist = vi.fn().mockRejectedValue(new Error("denied"));
    await withNavigatorStub({ storage: { persist } }, async () => {
      await expect(adapter.requestPersistenceAfterFirstAction()).resolves.toBe(
        false,
      );
      expect(persist).toHaveBeenCalledTimes(1);
    });
  });

  it("getPersisted() resolves to false when navigator.storage is absent (never throws)", async () => {
    const adapter = new IndexedDbAdapter();
    await withNavigatorStub(undefined, async () => {
      await expect(adapter.getPersisted()).resolves.toBe(false);
    });
  });

  it("getLastBackupAt() resolves to null when no lastBackupAt meta exists", async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    await expect(adapter.getLastBackupAt()).resolves.toBeNull();
  });

  it("getLastBackupAt() resolves to the recorded ISO-8601 timestamp when a lastBackupAt meta record exists", async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    const iso = "2026-01-01T00:00:00.000Z";
    // Seed the canonical `{ key: "lastBackupAt", value: <iso> }` record shape
    // that `exportBackup()` writes to `"meta"` via `setMeta("lastBackupAt", iso)` (#267).
    const seed = await openRaw(factory, DB_NAME);
    await new Promise<void>((resolve, reject) => {
      const tx = seed.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key: "lastBackupAt", value: iso });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await expect(adapter.getLastBackupAt()).resolves.toBe(iso);
  });

  it("getLastBackupAt() reads the setMeta { key, value } envelope (ISO string value) and returns null for non-string values", async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    const iso = "2026-01-01T00:00:00.000Z";
    await adapter.setMeta("lastBackupAt", iso);
    await expect(adapter.getLastBackupAt()).resolves.toBe(iso);

    await adapter.setMeta("lastBackupAt", { invalid: true });
    await expect(adapter.getLastBackupAt()).resolves.toBeNull();
  });
});

describe("IndexedDbAdapter — save / delete / query (#265)", () => {
  /** A valid deterministic `RecurringRule` for seeding / asserting. */
  function makeRule(id: string, name: string): RecurringRule {
    return {
      id,
      name,
      type: "income",
      amountCents: 25_000,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
      lastPostPeriod: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  /** A valid deterministic manual `Activity`. */
  function makeActivity(id: string, type: Activity["type"]): Activity {
    return {
      id,
      type,
      amountCents: 1_200,
      currency: "USD",
      dateTime: "2026-03-15T00:00:00.000Z",
      tags: ["coffee"],
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("save() upserts a record: save then query returns it (rules + activities)", async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    const rule = makeRule("rule-1", "salary");
    await adapter.save("rules", rule);
    const [savedRule] = await adapter.query("rules");
    expect(savedRule).toEqual(rule);

    const activity = makeActivity("act-1", "expense");
    await adapter.save("activities", activity);
    const [savedActivity] = await adapter.query("activities");
    expect(savedActivity).toEqual(activity);
  });

  it("save() of the same id is an upsert: the second save replaces the record", async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    await adapter.save("rules", makeRule("rule-1", "first name"));
    await adapter.save("rules", makeRule("rule-1", "second name"));

    const rules = await adapter.query("rules");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe("second name");
  });

  it("delete() removes an existing id; deleting an unknown id resolves cleanly (idempotent)", async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    await adapter.save("rules", makeRule("rule-1", "salary"));
    await adapter.save("rules", makeRule("rule-2", "freelance"));
    await adapter.delete("rules", "rule-1");
    const remaining = await adapter.query("rules");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("rule-2");

    // Unknown id: resolves cleanly (does not reject) — the idempotent
    // `delete` contract shared with InMemoryAdapter.
    await expect(
      adapter.delete("rules", "no-such-id"),
    ).resolves.toBeUndefined();
    await expect(adapter.query("rules")).resolves.toHaveLength(1);
  });

  it("query() with a { field, eq } predicate returns only matching records ([] when none match)", async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    const income = makeActivity("act-income", "income");
    const expense = makeActivity("act-expense", "expense");
    // A recurring-sourced activity carrying `sourceRuleId` (plus a
    // non-matching rule id on the manual activities above).
    const recurring = makeActivity("act-recurring", "income");
    recurring.source = "recurring";
    recurring.sourceRuleId = "rule-42";
    await adapter.save("activities", income);
    await adapter.save("activities", expense);
    await adapter.save("activities", recurring);

    // `type` is indexed (`by_type`) — index-backed equality read.
    const incomeOnly = await adapter.query("activities", {
      field: "type",
      eq: "income",
    });
    expect(incomeOnly).toEqual([income, recurring]);

    const expenseOnly = await adapter.query("activities", {
      field: "type",
      eq: "expense",
    });
    expect(expenseOnly).toEqual([expense]);

    // No matching record → empty array.
    const none = await adapter.query("activities", {
      field: "type",
      eq: "deposit",
    });
    expect(none).toEqual([]);

    // `sourceRuleId` is unindexed as a single field (only part of the
    // compound `by_rule_period` index) — in-memory filtering, same
    // strict-equality semantics.
    const byRule = await adapter.query("activities", {
      field: "sourceRuleId",
      eq: "rule-42",
    });
    expect(byRule).toEqual([recurring]);
    expect(
      await adapter.query("activities", {
        field: "sourceRuleId",
        eq: "rule-99",
      }),
    ).toEqual([]);

    // An unindexed field (`id`) falls back to in-memory filtering — same
    // strict-equality semantics.
    const byId = await adapter.query("activities", {
      field: "id",
      eq: "act-income",
    });
    expect(byId).toEqual([income]);
    expect(
      await adapter.query("activities", { field: "id", eq: "missing" }),
    ).toEqual([]);
  });

  it('query("rules", { field: "type" }) resolves via in-memory fallback (no NotFoundError)', async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    await adapter.open();

    const expense = makeRule("rule-expense", "utilities");
    expense.type = "expense";
    const income = makeRule("rule-income", "salary");
    await adapter.save("rules", expense);
    await adapter.save("rules", income);

    // `type` is a valid predicate field on `RecurringRule`, but the `rules`
    // store has no `by_type` index (only `activities` does). A store-unscoped
    // `FIELD_INDEX` lookup would resolve `by_type` here and crash with
    // `NotFoundError`; the store-scoped map must instead fall back to
    // `getAll()` + strict `===` in-memory filtering.
    const expenses = await adapter.query("rules", {
      field: "type",
      eq: "expense",
    });
    expect(expenses).toEqual([expense]);

    const incomes = await adapter.query("rules", {
      field: "type",
      eq: "income",
    });
    expect(incomes).toEqual([income]);

    // No matching rule → empty array (still resolves, does not reject).
    const none = await adapter.query("rules", {
      field: "type",
      eq: "deposit",
    });
    expect(none).toEqual([]);
  });

  it("rejects with a Promise (does not throw synchronously) when replaceAll / save / delete / query / meta methods are called before open() (#255)", async () => {
    const factory = new IDBFactory();
    const adapter = new IndexedDbAdapter(factory);
    const expectedMessage =
      "IndexedDbAdapter: call open() before using the adapter";

    // Invoking each method without `await` must return a rejected Promise
    // rather than throwing synchronously (so callers using `.catch(...)` or
    // `await expect(adapter.method(...)).rejects.toThrow(...)` never miss a
    // synchronous exception).
    const replaceAllPromise = adapter.replaceAll({
      rules: [],
      activities: [],
    });
    expect(replaceAllPromise).toBeInstanceOf(Promise);
    await expect(replaceAllPromise).rejects.toThrow(expectedMessage);
    await expect(() =>
      adapter.replaceAll({ rules: [], activities: [] }),
    ).rejects.toThrow(expectedMessage);

    const savePromise = adapter.save("rules", makeRule("rule-1", "salary"));
    expect(savePromise).toBeInstanceOf(Promise);
    await expect(savePromise).rejects.toThrow(expectedMessage);

    const deletePromise = adapter.delete("rules", "rule-1");
    expect(deletePromise).toBeInstanceOf(Promise);
    await expect(deletePromise).rejects.toThrow(expectedMessage);

    const queryPromise = adapter.query("rules");
    expect(queryPromise).toBeInstanceOf(Promise);
    await expect(queryPromise).rejects.toThrow(expectedMessage);

    const getLastBackupAtPromise = adapter.getLastBackupAt();
    expect(getLastBackupAtPromise).toBeInstanceOf(Promise);
    await expect(getLastBackupAtPromise).rejects.toThrow(expectedMessage);

    const getMetaPromise = adapter.getMeta("lastBackupAt");
    expect(getMetaPromise).toBeInstanceOf(Promise);
    await expect(getMetaPromise).rejects.toThrow(expectedMessage);

    const setMetaPromise = adapter.setMeta(
      "lastBackupAt",
      "2026-01-01T00:00:00.000Z",
    );
    expect(setMetaPromise).toBeInstanceOf(Promise);
    await expect(setMetaPromise).rejects.toThrow(expectedMessage);
  });
});
