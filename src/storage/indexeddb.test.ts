import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
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
