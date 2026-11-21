import type { Activity, RecurringRule } from "../core/types";
import type {
  Entity,
  EntityKey,
  QueryPredicate,
  StorageAdapter,
} from "./adapter";

/**
 * `IndexedDbAdapter` — the production `StorageAdapter` backing the MVP PWA and
 * the native Capacitor shells (iOS `WKWebView` + Android `WebView` both support
 * IndexedDB).
 *
 * This is **T-A** of #246: the database name derivation, the `DB_VERSION = 1`
 * schema (three object stores + the `activities` secondary/compound index set),
 * and the basic `getMeta` / `setMeta` meta round-trip. The heavier contract
 * methods (`save` / `delete` / `query` / `replaceAll` — atomic backup restore,
 * defensive `VersionError` handling, and `navigator.storage.persist()` wiring)
 * are **T-B** (#249) and are left as minimal stubs here so the class satisfies
 * the full `StorageAdapter` contract and type-checks.
 *
 * `project-plan/storage.md` — Recommended approach & IndexedDB Schema
 * Versioning: business logic never touches IndexedDB directly; it goes through
 * the `StorageAdapter` contract (`open` / `save` / `delete` / `query` /
 * `replaceAll` / `getMeta` / `setMeta`).
 *
 * Portability boundary (`project-plan/portability.md`): Web-platform APIs only
 * (the `indexedDB` global). No DOM, no Node globals, no Capacitor bridge.
 *
 * `project-plan/dependency-strategy.md` — zero production dependencies: this
 * module uses only the built-in `indexedDB` API. `fake-indexeddb` is a
 * devDependency injected in tests via the `idbFactory` constructor argument.
 */

/**
 * Derive the IndexedDB database name from the build's base path (OQ-1, origin
 * isolation). GitHub Pages serves production (`/simple-budget-app/`) and every
 * PR preview (`/simple-budget-app/pr-<N>/`) from the *same* browser origin
 * (`https://tandyn.github.io`), and IndexedDB is scoped per origin (not per
 * path) — so the name is derived from `import.meta.env.BASE_URL` to keep
 * previews from opening, mutating, or bumping `DB_VERSION` on the production
 * database:
 *
 * - Production (`/simple-budget-app/`): `simple-budget-app`
 * - PR preview (`/simple-budget-app/pr-<N>/`): `simple-budget-app-pr-<N>`
 *
 * `project-plan/storage.md` → IndexedDB Schema Versioning:
 * `Database constants & base-path namespacing (origin isolation, OQ-1)`.
 */
export function deriveDbName(basePath: string): string {
  const prMatch = /\/pr-(\d+)\/?$/.exec(basePath);
  return prMatch ? `simple-budget-app-pr-${prMatch[1]}` : "simple-budget-app";
}

/**
 * The namespaced database name (production vs. `pr-<N>/` preview), derived once
 * from the build's base path. See `deriveDbName`.
 */
export const DB_NAME = deriveDbName(
  import.meta.env.BASE_URL ?? "/simple-budget-app/",
);

/**
 * Current on-disk schema version. Strictly monotonic per origin: any future
 * schema bump is `DB_VERSION = 2` and MUST be roll-forward only (a lower
 * version rejects with `VersionError`). `project-plan/storage.md` →
 * IndexedDB Schema Versioning: "Post-schema-bump recovery MUST be strictly
 * roll-forward."
 */
export const DB_VERSION = 1;

/** Shape of the `"meta"` store records: a string key plus an arbitrary value. */
interface MetaRecord {
  readonly key: string;
  readonly value: unknown;
}

/**
 * `IndexedDbAdapter implements StorageAdapter`.
 *
 * `open()` opens (and, on first open, creates) the database — it does NOT run
 * the recurring engine or call `persist()` (that is T-B's scope). `getMeta` /
 * `setMeta` read/write the `"meta"` store in their own `readonly` / `readwrite`
 * transactions. `save` / `delete` / `query` / `replaceAll` are stubs for T-B.
 */
export class IndexedDbAdapter implements StorageAdapter {
  /** The `IDBFactory` to open databases through (defaults to the platform global). */
  private readonly idb: IDBFactory;

  /** The open `IDBDatabase` handle, present once `open()` resolves. */
  private db?: IDBDatabase;

  /**
   * Create the adapter. `idbFactory` is injectable so tests supply
   * `fake-indexeddb`; production callers pass nothing and use the platform
   * `indexedDB` global.
   */
  constructor(idbFactory: IDBFactory = globalThis.indexedDB) {
    this.idb = idbFactory;
  }

  /**
   * Open (and, on first open, create) the database; resolves when ready.
   * Idempotent: a second call while already open resolves immediately without
   * re-running `onupgradeneeded`.
   *
   * T-A scope: open only — does not run the recurring engine or call
   * `persist()` (T-B, #249).
   */
  open(): Promise<void> {
    if (this.db !== undefined) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const request = this.idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        handleUpgrade(db, event.oldVersion);
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Upsert a record into a named object store. **T-B (#249)** — not yet
   * implemented in this slice.
   */
  save<K extends EntityKey>(_store: K, _value: Entity[K]): Promise<void> {
    return Promise.reject(notImplementedInTA("save"));
  }

  /**
   * Delete a record by primary key from a named object store. **T-B (#249)** —
   * not yet implemented in this slice.
   */
  delete(_store: EntityKey, _id: string): Promise<void> {
    return Promise.reject(notImplementedInTA("delete"));
  }

  /**
   * Run a query against a named object store. **T-B (#249)** — not yet
   * implemented in this slice.
   */
  query<K extends EntityKey>(
    _store: K,
    _where?: QueryPredicate<K>,
  ): Promise<Entity[K][]> {
    return Promise.reject(notImplementedInTA("query"));
  }

  /**
   * Atomically clear and replace all `"rules"` / `"activities"` records.
   * **T-B (#249)** — not yet implemented in this slice.
   */
  replaceAll(_data: {
    rules: RecurringRule[];
    activities: Activity[];
  }): Promise<void> {
    return Promise.reject(notImplementedInTA("replaceAll"));
  }

  /**
   * Read a metadata record by key from the `"meta"` store, or `null` if the
   * key is absent. Runs in its own `readonly` transaction.
   */
  getMeta<T>(key: string): Promise<T | null> {
    const db = this.requireDb();
    return new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction("meta", "readonly");
      const request = tx.objectStore("meta").get(key);
      request.onsuccess = () => {
        const record = request.result as MetaRecord | undefined;
        resolve(record === undefined ? null : (record.value as T));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Upsert a metadata record by key in the `"meta"` store. The value is stored
   * as `{ key, value }` so the record carries a valid `keyPath: "key"` for any
   * value type. Runs in its own `readwrite` transaction and resolves on
   * `oncomplete`.
   */
  setMeta<T>(key: string, value: T): Promise<void> {
    const db = this.requireDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("meta write aborted"));
    });
  }

  /** Return the open database handle, throwing if `open()` has not run yet. */
  private requireDb(): IDBDatabase {
    if (this.db === undefined) {
      throw new Error("IndexedDbAdapter: call open() before using the adapter");
    }
    return this.db;
  }
}

/**
 * Deterministic `onupgradeneeded` migration switch. Upgrades run sequentially
 * from `oldVersion` to `newVersion` (or `DB_VERSION`) inside IndexedDB's atomic
 * `versionchange` transaction: each `if (oldVersion < N)` step adds its schema,
 * and a throw in any step aborts the whole `versionchange` transaction, leaving
 * the prior version untouched.
 *
 * `project-plan/storage.md` → IndexedDB Schema Versioning:
 * "Deterministic onupgradeneeded migration switch".
 */
function handleUpgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    // `"meta"` — database-level metadata (keyPath: "key"), seeded with the
    // schema record for the backup-age indicator (project-plan/storage.md).
    const metaStore = db.createObjectStore("meta", { keyPath: "key" });
    metaStore.put({
      key: "schema",
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    });

    // `"rules"` — recurring rules (keyPath: "id"). No secondary index on the
    // boolean `active` field: booleans are not valid IndexedDB keys per the W3C
    // spec, so indexing it would silently omit records. Active vs. paused rules
    // are filtered in memory after reading `"rules"`.
    db.createObjectStore("rules", { keyPath: "id" });

    // `"activities"` — activity records (keyPath: "id") with the v1 index set:
    const activitiesStore = db.createObjectStore("activities", {
      keyPath: "id",
    });
    // Chronological ordering + [since, until] range queries.
    activitiesStore.createIndex("by_dateTime", "dateTime", { unique: false });
    // Filter by income / expense / deposit.
    activitiesStore.createIndex("by_type", "type", { unique: false });
    // Per-tag insights and search (multi-entry over the `tags` array).
    activitiesStore.createIndex("by_tags", "tags", {
      unique: false,
      multiEntry: true,
    });
    // O(1) recurring-engine idempotency lookup on (sourceRuleId, period).
    activitiesStore.createIndex("by_rule_period", ["sourceRuleId", "period"], {
      unique: false,
    });
  }
  // Future migrations (e.g. `if (oldVersion < 2) { ... }`) run sequentially
  // here, inside the same atomic `versionchange` transaction, and update the
  // `"meta"` schema record.

  // NOTE: future migrations that touch `meta` records must wrap their seed as
  // `{ key, value }` (see `MetaRecord`) so `getMeta` / `setMeta` stay consistent.
}

/**
 * The single T-A stub error: any contract method that is not implemented in
 * this slice rejects with a message pointing at T-B (#249).
 */
function notImplementedInTA(method: string): Error {
  return new Error(
    `IndexedDbAdapter.${method} is not implemented in T-A; see #249 (T-B)`,
  );
}
