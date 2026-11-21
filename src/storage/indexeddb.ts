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
 * **T-A** (#246) shipped the database name derivation, the `DB_VERSION = 1`
 * schema (three object stores + the `activities` secondary/compound index set),
 * and the basic `getMeta` / `setMeta` meta round-trip. **U1** (#249) added the
 * atomic `replaceAll` backup-restore over `["rules", "activities"]`. The
 * remaining contract methods (`save` / `delete` / `query`, defensive
 * `VersionError` handling, and `navigator.storage.persist()` wiring) are later
 * slices — the defensive `VersionError` handling is #252 (U2) and the
 * `navigator.storage.persist()` / `persisted()` durability API is #253 (U3) —
 * and are left as minimal stubs here so the class satisfies the full
 * `StorageAdapter` contract and type-checks.
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

/**
 * `VersionMismatchError` — the typed, **non-destructive** rejection `open()`
 * raises when the on-disk database version is HIGHER than `DB_VERSION`
 * (W3C IndexedDB `VersionError`).
 *
 * This is the stable contract a later UI slice branches on to render an
 * accessible **"Update required"** banner (instruct the user to reload /
 * update to the latest version of the app). The UI can key off either
 * `err.name === "VersionMismatchError"` or an `instanceof` check.
 *
 * **Non-destructive guarantee:** `open()` NEVER calls
 * `indexedDB.deleteDatabase()` in response to this error (or any open /
 * migration error). Deleting a local-first financial database is irreversible
 * data loss — there is no remote server to re-sync from.
 * `project-plan/storage.md` → IndexedDB Schema Rollback Safety:
 * "Defensive non-destructive `VersionError` UI handling (`deleteDatabase()`
 * forbidden)".
 */
export class VersionMismatchError extends Error {
  override readonly name = "VersionMismatchError";

  /** The version this build of the app expects (`DB_VERSION`). */
  readonly expectedVersion: number;

  constructor(expectedVersion: number) {
    super(
      `IndexedDB version mismatch: the on-disk database is at a HIGHER ` +
        `version than this build (version ${expectedVersion}). This build is ` +
        `older than the stored data. Do NOT delete the database — reload or ` +
        `update to the latest version of the app to continue.`,
    );
    this.expectedVersion = expectedVersion;
  }
}

/** True when `err` is a W3C IndexedDB `VersionError` (on-disk version > requested). */
function isVersionError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "VersionError"
  );
}

/** Shape of the `"meta"` store records: a string key plus an arbitrary value. */
interface MetaRecord {
  readonly key: string;
  readonly value: unknown;
}

/**
 * `IndexedDbAdapter implements StorageAdapter`.
 *
 * `open()` opens (and, on first open, creates) the database — it does NOT run
 * the recurring engine or call `persist()` (that is U2 / U3's scope).
 * `getMeta` / `setMeta` read/write the `"meta"` store in their own
 * `readonly` / `readwrite` transactions. `replaceAll` atomically clears and
 * re-writes `"rules"` + `"activities"` in one `readwrite` transaction.
 * `save` / `delete` / `query` remain stubs (later slices).
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
   * **VersionError handling (U2, #252):** if the on-disk database is at a
   * HIGHER version than `DB_VERSION` (W3C IndexedDB `VersionError`), `open()`
   * rejects with a typed, non-destructive `VersionMismatchError` the UI can
   * render as an accessible "Update required" banner. It NEVER calls
   * `indexedDB.deleteDatabase()` — deleting local-first financial data is
   * irreversible loss with no remote copy to re-sync from.
   * `project-plan/storage.md` → IndexedDB Schema Rollback Safety.
   *
   * T-A scope: open only — does not run the recurring engine or call
   * `persist()` (the durability API is U3, #253).
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
      request.onerror = () => {
        // Defensive, non-destructive VersionError handling (U2, #252):
        // W3C IndexedDB rejects `open()` with a `VersionError` when the
        // on-disk database version is HIGHER than the requested `DB_VERSION`
        // (e.g. the app was rolled back after a schema bump). Surface a typed,
        // non-destructive `VersionMismatchError` the UI can render as an
        // "Update required" banner. NEVER call `deleteDatabase()` here —
        // deleting local-first financial data is irreversible loss.
        if (isVersionError(request.error)) {
          reject(new VersionMismatchError(DB_VERSION));
          return;
        }
        reject(request.error);
      };
    });
  }

  /**
   * Upsert a record into a named object store. Not yet implemented in this
   * slice — see the later Phase-3 storage slice that lands `save` / `delete` /
   * `query` (atomic `replaceAll` already landed in U1, #249).
   */
  save<K extends EntityKey>(_store: K, _value: Entity[K]): Promise<void> {
    return Promise.reject(notImplementedInSlice("save"));
  }

  /**
   * Delete a record by primary key from a named object store. Not yet
   * implemented in this slice (see `save` for the follow-up slice).
   */
  delete(_store: EntityKey, _id: string): Promise<void> {
    return Promise.reject(notImplementedInSlice("delete"));
  }

  /**
   * Run a query against a named object store. Not yet implemented in this
   * slice (see `save` for the follow-up slice).
   */
  query<K extends EntityKey>(
    _store: K,
    _where?: QueryPredicate<K>,
  ): Promise<Entity[K][]> {
    return Promise.reject(notImplementedInSlice("query"));
  }

  /**
   * Atomically clear and replace all `"rules"` / `"activities"` records
   * (invoked by `budget.importBackup` after full validation).
   *
   * The whole operation runs in a **single** `readwrite` transaction spanning
   * `["rules", "activities"]`: both stores are `clear()`-ed and every record
   * is re-`put()`-ed inside that one transaction. The promise resolves only
   * when the transaction's `oncomplete` fires. If any write fails (bad key,
   * quota, type mismatch, …), IndexedDB auto-aborts the transaction and the
   * pre-existing data is left 100 % intact — no partial write is visible.
   *
   * **No** `indexedDB.deleteDatabase()` is ever called on the failure path
   * (`project-plan/storage.md` → "deleteDatabase() forbidden").
   */
  replaceAll(data: {
    rules: RecurringRule[];
    activities: Activity[];
  }): Promise<void> {
    const db = this.requireDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["rules", "activities"], "readwrite");
      // Attach the terminal handlers *before* queueing any work so the promise
      // is settled exactly once on whichever terminal event fires, whether the
      // failure surfaces synchronously (an invalid key throws out of `put`) or
      // asynchronously (quota, type mismatch) — both abort the transaction and
      // roll both stores back to their pre-import state.
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("replaceAll aborted"));

      const rulesStore = tx.objectStore("rules");
      const activitiesStore = tx.objectStore("activities");

      try {
        rulesStore.clear();
        activitiesStore.clear();

        for (const rule of data.rules) {
          rulesStore.put(rule);
        }
        for (const activity of data.activities) {
          activitiesStore.put(activity);
        }
      } catch {
        // Synchronous failure (e.g. an invalid key): the transaction has
        // already been flagged to abort, and the `onabort` / `onerror` handler
        // above rejects this promise. Swallow here so the executor itself does
        // not throw and leave the promise unsettled.
      }
    });
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
 * The single stub error: a contract method that is not yet implemented in this
 * slice (atomic `replaceAll` landed in U1 / #249) rejects with a message
 * pointing at the later `src/storage/` slices.
 */
function notImplementedInSlice(method: string): Error {
  return new Error(
    `IndexedDbAdapter.${method} is not implemented yet; see the later Phase-3 storage slices`,
  );
}
