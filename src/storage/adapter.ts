import type { Activity, RecurringRule } from "../core/types";

/**
 * Storage-adapter contract for `simple-budget-app`.
 *
 * `project-plan/storage.md` — Recommended approach: all reads/writes go through
 * this small interface (`open` / `save` / `delete` / `query` / `replaceAll` /
 * `getMeta` / `setMeta`). Business logic (recurring engine, derived Available
 * Funds, CRUD) never touches IndexedDB directly — only the adapter does.
 *
 * `project-plan/portability.md` — the storage adapter is the single
 * platform seam: the MVP PWA ships `src/storage/indexeddb.ts`, while the
 * `InMemoryAdapter` (`src/storage/memory.ts`) and any future durable native
 * adapter (OQ-4 store-release gate) implement the identical contract, so
 * swapping the store requires zero changes to `src/core/` or the front-end.
 *
 * Portability boundary: implementations may use Web-platform APIs only;
 * `src/storage/` may import from `src/core/` (never the reverse), but must not
 * import the DOM, Node globals, or the Capacitor native-bridge packages.
 */

/**
 * Named entity collections. The keys are the canonical object-store names
 * (`"rules"` and `"activities"`) used by the IndexedDB implementation, so an
 * adapter-agnostic caller can address a store by name.
 */
export interface Entity {
  /** Recurring income/expense rules (store `"rules"`). */
  rules: RecurringRule;
  /** Transaction activity records (store `"activities"`). */
  activities: Activity;
}

/** The named entity collections an adapter exposes. */
export type EntityKey = keyof Entity;

/** String-keyed fields of an entity collection (usable in `QueryPredicate`). */
export type EntityField<K extends EntityKey> = keyof Entity[K] & string;

/**
 * Minimal, adapter-agnostic filter predicate (e.g.
 * `{ field: "sourceRuleId", eq: ruleId }`).
 *
 * The first (type-only) generic pins the entity collection; the second pins the
 * field so `eq` is checked against that field's type. Adapters translate this
 * to whatever query mechanism they support (IndexedDB index/range queries for
 * `indexeddb.ts`, in-memory filtering for `memory.ts`); a field that cannot be
 * queried efficiently is simply filtered after reading the store.
 */
export interface QueryPredicate<
  K extends EntityKey,
  F extends EntityField<K> = EntityField<K>,
> {
  /** The record field to compare. */
  readonly field: F;
  /** The value the field must equal (strict equality, `===`). */
  readonly eq: Entity[K][F];
}

/**
 * The single platform surface the whole backend depends on.
 */
export interface StorageAdapter {
  /** Open (and, if needed, create) the database; resolve when ready. */
  open(): Promise<void>;

  /** Upsert a record into a named object store (e.g. `"rules"`, `"activities"`). */
  save<K extends EntityKey>(store: K, value: Entity[K]): Promise<void>;

  /** Delete a record by primary key from a named object store. */
  delete(store: EntityKey, id: string): Promise<void>;

  /** Run a query; `where` may be a filter or a raw IDB index query. */
  query<K extends EntityKey>(
    store: K,
    where?: QueryPredicate<K>,
  ): Promise<Entity[K][]>;

  /**
   * Atomically clear and replace all records in `"rules"` and `"activities"`
   * inside a single readwrite transaction (invoked by `budget.importBackup`
   * after full validation). A failed restore must leave both collections in
   * their exact pre-import state.
   */
  replaceAll(data: {
    rules: RecurringRule[];
    activities: Activity[];
  }): Promise<void>;

  /** Read a metadata record by key from the `"meta"` store (e.g. `"lastBackupAt"`). */
  getMeta<T>(key: string): Promise<T | null>;

  /** Upsert a metadata record by key in the `"meta"` store. */
  setMeta<T>(key: string, value: T): Promise<void>;
}
