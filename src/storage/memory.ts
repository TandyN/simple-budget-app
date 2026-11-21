import type { Activity, RecurringRule } from "../core/types";
import type {
  Entity,
  EntityKey,
  QueryPredicate,
  StorageAdapter,
} from "./adapter";

/**
 * In-memory `StorageAdapter` for fast, deterministic unit/integration tests.
 *
 * `project-plan/storage.md` — In-memory parity: `InMemoryAdapter.replaceAll`
 * swaps both collections in one synchronous step so unit tests exercise the
 * identical atomic contract as `IndexedDbAdapter` (a failed restore never
 * clobbers or partially overwrites existing user data).
 *
 * Behavior notes (deliberately simple and deterministic — no timing, no
 * Node-only modules, no DOM; errors are surfaced as rejected Promises):
 * - `open()` is a no-op that resolves immediately and is idempotent.
 * - `save` upserts by the record's own `id` primary key and stores an
 *   independent shallow copy, so later mutation of the caller's object never
 *   alters stored state.
 * - `query` returns fresh shallow copies of matching records; `where` is an
 *   adapter-agnostic `{ field, eq }` equality predicate.
 * - `delete` is idempotent: deleting an unknown id resolves cleanly (the same
 *   contract as an IndexedDB `delete()` on a missing key).
 * - `replaceAll` validates its payload first, then swaps both collections in a
 *   single synchronous step: if validation fails, the promise rejects and both
 *   collections are left untouched.
 * - `getMeta` / `setMeta` operate on an independent `"meta"` record keyed by
 *   string, with `getMeta` returning `null` for absent keys.
 */
export class InMemoryAdapter implements StorageAdapter {
  /** Entity collections keyed by store name. */
  private readonly stores = new Map<
    EntityKey,
    Map<string, Entity[EntityKey]>
  >();

  /** `"meta"` records keyed by metadata key. */
  private readonly meta = new Map<string, unknown>();

  constructor() {
    this.stores.set("rules", new Map());
    this.stores.set("activities", new Map());
  }

  /**
   * Open (no-op) the in-memory store; resolves when ready.
   * Idempotent and always successful.
   */
  open(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Upsert a record into a named object store, keyed by the record's `id`.
   */
  save<K extends EntityKey>(store: K, value: Entity[K]): Promise<void> {
    try {
      const records = this.recordsFor(store);
      const id = value.id;
      if (typeof id !== "string" || id.length === 0) {
        throw new Error(
          `save(${store}): record must have a non-empty string "id"`,
        );
      }
      records.set(id, { ...value });
    } catch (error) {
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  /**
   * Delete a record by primary key from a named object store.
   * Resolves cleanly when the id is unknown (idempotent).
   */
  delete(store: EntityKey, id: string): Promise<void> {
    try {
      this.recordsFor(store).delete(id);
    } catch (error) {
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  /**
   * Return all records in a named object store, optionally filtered by an
   * adapter-agnostic `{ field, eq }` equality predicate. Results are fresh
   * copies in insertion order.
   */
  query<K extends EntityKey>(
    store: K,
    where?: QueryPredicate<K>,
  ): Promise<Entity[K][]> {
    try {
      const result: Entity[K][] = [];
      for (const record of this.recordsFor(store).values()) {
        if (!where || record[where.field] === where.eq) {
          result.push({ ...record } as Entity[K]);
        }
      }
      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Atomically clear and replace all records in `"rules"` and `"activities"`.
   * Both collections are swapped in a single synchronous step; if the payload
   * is invalid the swap never happens and both collections are untouched.
   */
  replaceAll(data: {
    rules: RecurringRule[];
    activities: Activity[];
  }): Promise<void> {
    // Validate the entire payload before touching either collection, so an
    // invalid restore cannot partially overwrite existing state.
    const validationError =
      validateCollection("rules", data.rules) ??
      validateCollection("activities", data.activities);
    if (validationError !== null) {
      return Promise.reject(validationError);
    }

    const nextRules = new Map<string, RecurringRule>();
    for (const rule of data.rules) {
      nextRules.set(rule.id, { ...rule });
    }
    const nextActivities = new Map<string, Activity>();
    for (const activity of data.activities) {
      nextActivities.set(activity.id, { ...activity });
    }

    // One synchronous swap of both collections (atomic by construction).
    this.stores.set("rules", nextRules);
    this.stores.set("activities", nextActivities);
    return Promise.resolve();
  }

  /**
   * Read a metadata record by key from the `"meta"` store, or `null` if absent.
   */
  getMeta<T>(key: string): Promise<T | null> {
    return Promise.resolve(
      this.meta.has(key) ? (this.meta.get(key) as T) : null,
    );
  }

  /**
   * Upsert a metadata record by key in the `"meta"` store.
   */
  setMeta<T>(key: string, value: T): Promise<void> {
    this.meta.set(key, value);
    return Promise.resolve();
  }

  /**
   * Returns the backing store for `store`, rejecting unknown store names.
   */
  private recordsFor<K extends EntityKey>(store: K): Map<string, Entity[K]> {
    const records = this.stores.get(store);
    if (records === undefined) {
      throw new Error(`unknown object store: ${String(store)}`);
    }
    return records as Map<string, Entity[K]>;
  }
}

/**
 * Validates a `replaceAll` collection: it must be an array of plain records
 * with non-empty string `id`s (mirroring the primary-key requirement every
 * `Entity` type carries).
 *
 * Returns `null` when the collection is valid, or the `Error` that should be
 * surfaced (to `Promise.reject`) when it is not.
 */
function validateCollection(store: EntityKey, records: unknown): Error | null {
  if (!Array.isArray(records)) {
    return new Error(`replaceAll(${store}): records must be an array`);
  }
  for (const record of records as Array<{ id?: unknown }>) {
    const id = record?.id;
    if (typeof id !== "string" || id.length === 0) {
      return new Error(
        `replaceAll(${store}): every record must have a non-empty string "id"`,
      );
    }
  }
  return null;
}
