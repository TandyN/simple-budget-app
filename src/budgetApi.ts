import { runRecurringEngine } from "./core/engine";
import { computeAvailableFunds } from "./core/funds";
import { searchActivities, summarizeByTag } from "./core/insights";
import type {
  Activity,
  ActivityFilter,
  ActivityPatch,
  BudgetBackup,
  NewActivity,
  NewRule,
  RecurringRule,
  RulePatch,
  TagSummary,
} from "./core/types";
import {
  validateActivityPatch,
  validateBackupPayload,
  validateNewActivity,
  validateNewRule,
  validateRulePatch,
} from "./core/validate";
import type { StorageAdapter } from "./storage/adapter";

/**
 * `createBudgetApi` — the PUBLIC API surface (`project-plan/portability.md`
 * → "The public API"): the composition root that wires the pure `src/core/`
 * functions to a `StorageAdapter` implementation.
 *
 * **V1 scope (#247):** core CRUD + lifecycle —
 * `init`, rule CRUD, activity CRUD, `searchActivities` / `summarizeByTag`,
 * `runRecurringEngine(now?)`, and `getAvailableFunds()`.
 * **V2 scope (#258):** the backup surface —
 * `exportBackup()`, `getLastBackupAt()`, and `importBackup(json)`.
 *
 * Backup-surface invariants (`project-plan/portability.md → The public API`):
 * - `exportBackup()` returns the versioned `BudgetBackup` envelope
 *   (`schemaVersion: 1`, `exportedAt`, `rules`, `activities`) and records the
 *   same `exportedAt` ISO-8601 timestamp as the `"lastBackupAt"` meta value
 *   via `adapter.setMeta`.
 * - `getLastBackupAt()` reads that value back via `adapter.getMeta` (returning
 *   `null` if never backed up) so the Settings UI never touches IndexedDB
 *   directly. It stores/reads the ISO timestamp string as the meta value so
 *   the read returns a `string` through the portable `StorageAdapter` contract
 *   (both `InMemoryAdapter` and `IndexedDbAdapter` honour `getMeta`).
 * - `importBackup(json)` validates the full untrusted payload in memory via
 *   `validateBackupPayload(json)` (10 MB ceiling, prototype-pollution key
 *   rejection, full schema/invariant checks) **before** atomically replacing
 *   both collections via `adapter.replaceAll`; an invalid payload rejects with
 *   the stored data left 100% intact.
 *
 * Invariants:
 * - `init()` is idempotent and opens the adapter store only — it does NOT
 *   auto-run the recurring engine or call `persist()`.
 * - System-managed fields (`id`, `createdAt`, `updatedAt`) are generated here
 *   in the API (`crypto.randomUUID()` + the current UTC ISO-8601 timestamp);
 *   the caller never sets them.
 * - Input payloads are validated with the `src/core/validate.ts` validators
 *   (`validateNewRule` / `validateRulePatch` / `validateNewActivity` /
 *   `validateActivityPatch`) before touching the adapter.
 * - `deleteRule(id)` deletes the rule only — previously posted activities are
 *   NOT deleted (matching `project-plan/portability.md → The public API`).
 * - `runRecurringEngine(now?)` persists posted activities and advanced
 *   `lastPostPeriod` rules and is idempotent: a second call at the same `now`
 *   posts nothing new (`posted: []`).
 *
 * Portability boundary (`project-plan/portability.md`): this module may import
 * `src/core/` and `src/storage/`; `src/core/` never imports back.
 * `project-plan/dependency-strategy.md` — zero production dependencies: only
 * Web-platform built-ins (`crypto.randomUUID`, `Date`).
 */

/** The `"meta"` store key holding the last-backup ISO-8601 timestamp. */
const LAST_BACKUP_AT_META_KEY = "lastBackupAt";

/**
 * The public `BudgetApi` contract the front-end calls
 * (`project-plan/portability.md → The public API`): lifecycle, rule CRUD,
 * activity CRUD, insights/search, the recurring engine, the derived
 * Available Funds, and the V2 backup surface (`exportBackup` /
 * `getLastBackupAt` / `importBackup`).
 */
export interface BudgetApi {
  // Lifecycle
  init(): Promise<void>;

  // Recurring rules
  addRule(rule: NewRule): Promise<RecurringRule>;
  editRule(id: string, patch: RulePatch): Promise<RecurringRule>;
  setRuleActive(id: string, active: boolean): Promise<RecurringRule>;
  deleteRule(id: string): Promise<void>;
  listRules(): Promise<RecurringRule[]>;

  // Activities
  addActivity(a: NewActivity): Promise<Activity>;
  editActivity(id: string, patch: ActivityPatch): Promise<Activity>;
  deleteActivity(id: string): Promise<void>;
  listActivities(filter?: ActivityFilter): Promise<Activity[]>;

  // Insights / search (pure, derived — integer cents, plain data)
  searchActivities(filter: ActivityFilter): Promise<Activity[]>;
  summarizeByTag(activities: Activity[]): Promise<TagSummary[]>;

  // Recurring engine
  runRecurringEngine(now?: Date): Promise<{ posted: Activity[] }>;

  // Derived
  getAvailableFunds(): Promise<number>;

  // Local backup export / atomic import (V2, #258).
  exportBackup(): Promise<BudgetBackup>;
  getLastBackupAt(): Promise<string | null>;
  importBackup(json: string): Promise<{
    rulesCount: number;
    activitiesCount: number;
  }>;
}

/**
 * Options for `createBudgetApi`.
 */
export interface CreateBudgetApiOptions {
  /** The storage adapter to persist through (IndexedDB in production, in-memory in tests). */
  adapter: StorageAdapter;
  /**
   * ID factory for system-generated ids; defaults to `crypto.randomUUID()`.
   * Injectable for deterministic tests.
   */
  idFactory?: () => string;
  /**
   * Clock for system-managed timestamps; defaults to `() => new Date()`.
   * Injectable for deterministic tests.
   */
  now?: () => Date;
}

/**
 * Create the public `BudgetApi` composition root over a `StorageAdapter`.
 */
export function createBudgetApi(options: CreateBudgetApiOptions): BudgetApi {
  const { adapter } = options;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const clock = options.now ?? (() => new Date());

  /** `true` once `init()` has completed (idempotency marker). */
  let initialized = false;

  /**
   * Require that `init()` has run before touching the adapter, surfacing a
   * clear error instead of an adapter-level rejection.
   */
  function requireInit(): void {
    if (!initialized) {
      throw new Error("createBudgetApi: call init() before using the API");
    }
  }

  return {
    /**
     * Open the adapter store; idempotent. Does NOT auto-run the recurring
     * engine or call `persist()` (`project-plan/portability.md → The public
     * API`: "opens the store; idempotent").
     */
    async init(): Promise<void> {
      await adapter.open();
      initialized = true;
    },

    /**
     * Create a new recurring rule. Validates `NewRule`, generates
     * `id` / `createdAt` / `updatedAt` (system-managed), and applies the
     * defaults for omitted optional fields.
     */
    async addRule(rule: NewRule): Promise<RecurringRule> {
      requireInit();
      const input = validateNewRule(rule);
      const nowIso = clock().toISOString();
      const record: RecurringRule = {
        id: idFactory(),
        name: input.name,
        type: input.type,
        amountCents: input.amountCents,
        currency: input.currency ?? "USD",
        schedule: input.schedule ?? { cadence: "monthly", dayOfMonth: 1 },
        active: input.active ?? true,
        lastPostPeriod: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await adapter.save("rules", record);
      return record;
    },

    /**
     * Update user-editable fields of an existing rule. Validates `RulePatch`,
     * merges it onto the stored rule, and bumps `updatedAt`.
     * Rejects when the rule id is unknown.
     */
    async editRule(id: string, patch: RulePatch): Promise<RecurringRule> {
      requireInit();
      const updates = validateRulePatch(patch);
      const stored = await findRule(adapter, id);
      if (stored === undefined) {
        throw new Error(`editRule: no rule with id "${id}"`);
      }
      const record: RecurringRule = {
        ...stored,
        ...updates,
        schedule: updates.schedule ?? { ...stored.schedule },
        updatedAt: clock().toISOString(),
      };
      await adapter.save("rules", record);
      return record;
    },

    /**
     * Toggle a rule's `active` flag (the only entry point that changes
     * `active`); bumps `updatedAt`. Rejects when the rule id is unknown.
     */
    async setRuleActive(id: string, active: boolean): Promise<RecurringRule> {
      requireInit();
      const stored = await findRule(adapter, id);
      if (stored === undefined) {
        throw new Error(`setRuleActive: no rule with id "${id}"`);
      }
      const record: RecurringRule = {
        ...stored,
        active,
        updatedAt: clock().toISOString(),
      };
      await adapter.save("rules", record);
      return record;
    },

    /**
     * Delete a rule by id. Idempotent (an unknown id resolves cleanly,
     * matching the adapter's `delete` contract). Does NOT delete previously
     * posted activities.
     */
    async deleteRule(id: string): Promise<void> {
      requireInit();
      await adapter.delete("rules", id);
    },

    /**
     * List all rules (insertion order per adapter).
     */
    async listRules(): Promise<RecurringRule[]> {
      requireInit();
      return adapter.query("rules");
    },

    /**
     * Create a new manual activity. Validates `NewActivity`, generates
     * `id` / `createdAt` / `updatedAt` (system-managed), and applies the
     * defaults for omitted optional fields (`source` is always `"manual"` —
     * provenance is never caller-set).
     */
    async addActivity(a: NewActivity): Promise<Activity> {
      requireInit();
      const input = validateNewActivity(a);
      const nowIso = clock().toISOString();
      const record: Activity = {
        id: idFactory(),
        type: input.type,
        amountCents: input.amountCents,
        currency: input.currency ?? "USD",
        dateTime: input.dateTime ?? nowIso,
        tags: input.tags ?? [],
        source: "manual",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      if (input.memo !== undefined) {
        record.memo = input.memo;
      }
      await adapter.save("activities", record);
      return record;
    },

    /**
     * Update user-editable fields of an existing activity. Validates
     * `ActivityPatch`, merges it onto the stored activity, and bumps
     * `updatedAt`. Rejects when the activity id is unknown.
     */
    async editActivity(id: string, patch: ActivityPatch): Promise<Activity> {
      requireInit();
      const updates = validateActivityPatch(patch);
      const stored = await findActivity(adapter, id);
      if (stored === undefined) {
        throw new Error(`editActivity: no activity with id "${id}"`);
      }
      const record: Activity = {
        ...stored,
        ...updates,
        tags: updates.tags ?? [...stored.tags],
        updatedAt: clock().toISOString(),
      };
      await adapter.save("activities", record);
      return record;
    },

    /**
     * Delete an activity by id. Idempotent (an unknown id resolves cleanly,
     * matching the adapter's `delete` contract).
     */
    async deleteActivity(id: string): Promise<void> {
      requireInit();
      await adapter.delete("activities", id);
    },

    /**
     * List activities, optionally filtered by intersecting
     * `since` / `until` / `tag` / `type` predicates (unbounded when a
     * predicate is omitted; `undefined` lists all activities).
     */
    async listActivities(filter?: ActivityFilter): Promise<Activity[]> {
      requireInit();
      const all = await adapter.query("activities");
      if (filter === undefined) {
        return all;
      }
      return searchActivities(all, filter);
    },

    /**
     * Insights/search surface: filter activities by intersecting
     * `since` / `until` / `tag` / `type` predicates (pure, derived).
     */
    async searchActivities(filter: ActivityFilter): Promise<Activity[]> {
      requireInit();
      const all = await adapter.query("activities");
      return searchActivities(all, filter);
    },

    /**
     * Per-tag money-in / money-out rollup (integer cents) over a (possibly
     * filtered) activity set (pure, derived).
     */
    async summarizeByTag(activities: Activity[]): Promise<TagSummary[]> {
      requireInit();
      return summarizeByTag(activities);
    },

    /**
     * Run the pure monthly recurring engine: post due periods for active
     * rules, persist the new activities and the advanced `lastPostPeriod`
     * rules, and return the posted activities.
     *
     * Idempotent: `runRecurringEngine` checks `(sourceRuleId, period)`
     * against existing activities (`alreadyPosted`) and advances
     * `lastPostPeriod` only for periods actually posted, so a second call at
     * the same `now` posts nothing new (`posted: []`).
     */
    async runRecurringEngine(now?: Date): Promise<{ posted: Activity[] }> {
      requireInit();
      const rules = await adapter.query("rules");
      const activities = await adapter.query("activities");
      const engineOptions: {
        rules: readonly RecurringRule[];
        activities: readonly Activity[];
        now?: Date;
      } = { rules, activities };
      if (now !== undefined) {
        engineOptions.now = now;
      }
      const result = runRecurringEngine(engineOptions);
      for (const activity of result.posted) {
        await adapter.save("activities", activity);
      }
      for (const rule of result.updatedRules) {
        await adapter.save("rules", rule);
      }
      return { posted: result.posted };
    },

    /**
     * Derived Available Funds (`sum(income + deposit) - sum(expense)` in
     * integer cents). Computed on demand; never stored.
     */
    async getAvailableFunds(): Promise<number> {
      requireInit();
      const activities = await adapter.query("activities");
      return computeAvailableFunds(activities);
    },

    // --- Backup surface: V2 (#258). ---

    /**
     * Export a versioned `BudgetBackup` envelope of the current store and
     * record the last-backup timestamp in `"meta"` for the Settings backup-age
     * indicator (the same `exportedAt` value is used as the `"lastBackupAt"`
     * meta value, so `getLastBackupAt()` reads back the export instant).
     */
    async exportBackup(): Promise<BudgetBackup> {
      requireInit();
      const rules = await adapter.query("rules");
      const activities = await adapter.query("activities");
      const exportedAt = clock().toISOString();
      await adapter.setMeta(LAST_BACKUP_AT_META_KEY, exportedAt);
      return {
        schemaVersion: 1,
        exportedAt,
        rules,
        activities,
      };
    },

    /**
     * Read the last-backup ISO-8601 timestamp from `"meta"`, or `null` if the
     * user has never backed up. The UI never touches IndexedDB directly — it
     * calls this method (per `project-plan/portability.md → The public API`).
     */
    async getLastBackupAt(): Promise<string | null> {
      requireInit();
      const value = await adapter.getMeta(LAST_BACKUP_AT_META_KEY);
      if (typeof value === "string") {
        return value;
      }
      // Tolerate the spec's `{ key, timestamp }` record shape (e.g. written
      // directly to IndexedDB by a prior writer) in addition to the plain
      // ISO-string value this API records.
      if (
        typeof value === "object" &&
        value !== null &&
        "timestamp" in value &&
        typeof (value as { timestamp: unknown }).timestamp === "string"
      ) {
        return (value as { timestamp: string }).timestamp;
      }
      return null;
    },

    /**
     * Import a `BudgetBackup` JSON string: validate the entire untrusted
     * payload in memory via `validateBackupPayload` (10 MB ceiling,
     * prototype-pollution rejection, full schema/invariant checks) **before**
     * atomically replacing both collections via `adapter.replaceAll`. An
     * invalid payload rejects with the prior stored data left 100% intact.
     */
    async importBackup(json: string): Promise<{
      rulesCount: number;
      activitiesCount: number;
    }> {
      requireInit();
      // Validate FIRST — this is the safety gate that prevents a corrupt,
      // oversized, or prototype-polluting payload from reaching storage.
      const backup = validateBackupPayload(json);
      await adapter.replaceAll({
        rules: backup.rules,
        activities: backup.activities,
      });
      return {
        rulesCount: backup.rules.length,
        activitiesCount: backup.activities.length,
      };
    },
  };
}

/**
 * Find a rule by id by scanning the `"rules"` store (the adapter contract has
 * no id-lookup method; `query` returns a fresh copy of the record).
 */
async function findRule(
  adapter: StorageAdapter,
  id: string,
): Promise<RecurringRule | undefined> {
  const all = await adapter.query("rules");
  return all.find((r) => r.id === id);
}

/**
 * Find an activity by id by scanning the `"activities"` store.
 */
async function findActivity(
  adapter: StorageAdapter,
  id: string,
): Promise<Activity | undefined> {
  const all = await adapter.query("activities");
  return all.find((a) => a.id === id);
}
