# Local secure storage

**Decision (from the solutions-architect's spike #6 findings, extended to Android
in spike #22 / Story #21):** use **IndexedDB** as the primary store, wrapped behind
a thin **storage-adapter interface** so the store can be swapped without touching
business logic.

This is the load-bearing choice for portability, so it is covered here in full
and referenced by [data-model.md](data-model.md) and
[portability.md](portability.md).

## Recommended approach

- **Primary store: IndexedDB.**
- **Access pattern:** all reads/writes go through a small
  **`StorageAdapter`** interface (`open` / `save` / `delete` / `query` / `replaceAll`). Business
  logic (recurring engine, derived Available Funds, CRUD) never touches IndexedDB
  directly — only the adapter does.

```ts
/** The single platform surface the whole backend depends on. */
interface StorageAdapter {
  /** Open (and, if needed, create) the database; resolve when ready. */
  open(): Promise<void>;

  /** Upsert a record into a named object store (e.g. "rules", "activities"). */
  save<K extends EntityKey>(store: K, value: Entity[K]): Promise<void>;

  /** Delete a record by primary key from a named object store. */
  delete(store: EntityKey, id: string): Promise<void>;

  /** Run a query; `where` may be a filter or a raw IDB index query. */
  query<K extends EntityKey>(
    store: K,
    where?: QueryPredicate<K>,
  ): Promise<Entity[K][]>;

  /**
   * Atomically clear and replace all records in "rules" and "activities" inside
   * a single readwrite transaction (invoked by budget.importBackup after full validation).
   */
  replaceAll(data: {
    rules: RecurringRule[];
    activities: Activity[];
  }): Promise<void>;
}
```

`Entity` / `EntityKey` are the domain shapes from
[data-model.md](data-model.md) (`RecurringRule`, `Activity`). `QueryPredicate` is
a minimal, adapter-agnostic filter (e.g. `{ field: 'sourceRuleId', eq: ruleId }`).

### Atomic Backup Restoration (`replaceAll`)

- **All-or-nothing single-transaction restore:** `IndexedDbAdapter.replaceAll` executes inside a single IndexedDB `readwrite` transaction spanning `["rules", "activities"]`:
  1. Calls `tx.objectStore("rules").clear()` and `tx.objectStore("activities").clear()`.
  2. Iterates through all pre-validated `data.rules` and `data.activities` and queues `put(record)` on the respective object store within that same transaction.
  3. Resolves only when `tx.oncomplete` fires.
- **Automatic rollback on failure:** Because IndexedDB transactions are atomic across all participating object stores, any unexpected write error, quota exhaustion, or transaction abort automatically rolls back both `"rules"` and `"activities"` to their exact pre-import state—guaranteeing that a failed import never clobbers or partially overwrites existing user data.
- **Validation precedes storage writes:** `budget.importBackup(rawJson)` runs the pure `validateBackupPayload(rawJson)` validator in `src/core/validate.ts` (see [data-model.md](data-model.md)) **before** opening the `replaceAll` transaction.
- **In-memory parity:** `InMemoryAdapter.replaceAll` validates and swaps both in-memory maps in one synchronous step so unit tests exercise the identical atomic contract.

### Why IndexedDB

- **Structured & queryable** — real object stores + indexes, not a string blob.
- **Large capacity** — far beyond `localStorage`'s ~5 MB ceiling, which matters
  for a growing activity log.
- **Portable to iOS *and* Android** — Capacitor runs the iOS app in
  **WKWebView / WebKit** and the Android app in the **Android System WebView
  (Chromium)**; **both fully support IndexedDB.** So the *same* backend code (and
  the *same* `indexeddb.ts` adapter) runs unchanged in the GitHub Pages PWA,
  inside the iOS app, and inside the Android app. This is the decisive reason over
  WebSQL (gone) or a file-based store (no Web support in the PWA).

### Why a storage-adapter

- Isolates the one thing that could ever be platform-specific.
- Lets us swap the store later (e.g. a file-backed adapter, or an encrypted
  layer) without changing the engine or the data model.
- Makes the core unit-testable with an in-memory fake adapter.
- **Shared across all three targets** — the *same* `indexeddb.ts` adapter
  implements `StorageAdapter` on the PWA (any modern browser), iOS (WebKit), and
  Android (Chromium), because all of them support IndexedDB. A **SQLite-backed
  adapter** is a valid *future* swap behind the unchanged interface if we ever
  want native storage; the core and front-end would not change.

## IndexedDB Schema Versioning, Indexes & Migration Strategy

To guarantee deterministic persistence in v1 and zero-data-loss migrations as post-MVP features ship (see [data-model.md](data-model.md)), `src/storage/indexeddb.ts` enforces an explicit schema and migration contract:

- **Database constants:**
  - `DB_NAME = "simple-budget-app"`
  - `DB_VERSION = 1`
- **Deterministic `onupgradeneeded(event)` migration switch:**
  - Upgrades run sequentially from `event.oldVersion` to `event.newVersion` (or `DB_VERSION`) inside IndexedDB's atomic `versionchange` transaction (`if (oldVersion < 1) { ... }`, `if (oldVersion < 2) { ... }` in future releases).
  - If any step inside `onupgradeneeded` throws, IndexedDB automatically aborts the `versionchange` transaction and leaves the prior database version untouched.
- **Object stores and secondary indexes created in v1 (`DB_VERSION = 1`):**
  1. **`"meta"`** (`{ keyPath: "key" }`):
     - Stores database-level metadata, initialized on upgrade with `{ key: "schema", schemaVersion: 1, updatedAt: new Date().toISOString() }`.
  2. **`"rules"`** (`{ keyPath: "id" }`):
     - Secondary index **`by_active`** on keyPath `"active"` (`{ unique: false }`) for filtering active vs. paused recurring rules.
  3. **`"activities"`** (`{ keyPath: "id" }`):
     - Secondary index **`by_dateTime`** on keyPath `"dateTime"` (`{ unique: false }`) for chronological ordering and `[since, until]` date-range queries.
     - Secondary index **`by_type`** on keyPath `"type"` (`{ unique: false }`) for filtering `"income" | "expense" | "deposit"`.
     - Secondary index **`by_tags`** on keyPath `"tags"` (`{ unique: false, multiEntry: true }`) for per-tag insights and search queries.
     - Compound secondary index **`by_rule_period`** on keyPath `["sourceRuleId", "period"]` (`{ unique: false }`) for O(1) recurring-engine idempotency lookups (`(sourceRuleId, period)`).

```ts
export const DB_NAME = "simple-budget-app";
export const DB_VERSION = 1;

function handleUpgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  if (oldVersion < 1) {
    const metaStore = db.createObjectStore("meta", { keyPath: "key" });
    metaStore.put({
      key: "schema",
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    });

    const rulesStore = db.createObjectStore("rules", { keyPath: "id" });
    rulesStore.createIndex("by_active", "active", { unique: false });

    const activitiesStore = db.createObjectStore("activities", { keyPath: "id" });
    activitiesStore.createIndex("by_dateTime", "dateTime", { unique: false });
    activitiesStore.createIndex("by_type", "type", { unique: false });
    activitiesStore.createIndex("by_tags", "tags", { unique: false, multiEntry: true });
    activitiesStore.createIndex("by_rule_period", ["sourceRuleId", "period"], {
      unique: false,
    });
  }
  // Future migrations (e.g. if (oldVersion < 2) { ... }) execute sequentially here
  // inside the same versionchange transaction and update the "meta" schema record.
}
```

## Storage Durability & WebKit Eviction Mitigation

Local-first browser storage must guard against user-agent storage pressure and Safari/WebKit's Intelligent Tracking Prevention (ITP) 7-day script-writable storage eviction policy:

- **Best-effort persistent storage request (`navigator.storage.persist()`):**
  - During `IndexedDbAdapter.init()` / `IndexedDbAdapter.open()` (called by `budget.init()`), the adapter executes a best-effort persistence request wrapped in `try/catch` so it is strictly non-blocking if denied or unsupported by the runtime environment:
    ```ts
    try {
      await navigator.storage?.persist?.();
    } catch {
      // Non-blocking: proceed with standard IndexedDB storage if unsupported or denied
    }
    ```
- **WebKit 7-day ITP eviction mitigation (3-layer defense):**
  1. **Home Screen PWA (`display: "standalone"`) & Capacitor native shells:** Under WebKit's storage policy, the 7-day inactivity eviction cap applies to standard browser tabs. Installing the PWA to the iOS Home Screen (standalone display mode) or running inside the iOS (`WKWebView`) / Android (`Chromium`) Capacitor native shell grants durable, app-scoped origin storage exempt from 7-day tab eviction.
  2. **Storage API persistence (`navigator.storage?.persist?.()`):** Explicitly requests that the browser mark the origin's IndexedDB bucket as persistent so it is not cleared under routine storage pressure.
  3. **Periodic JSON backup exports in the Settings UI:** The Settings tab provides a one-tap JSON backup export (`budget.exportBackup()`) and encourages periodic local file exports (to Files / iCloud Drive / Google Drive) so users always hold a portable, human-readable recovery copy.

## Security properties

**"Secure" for this app means on-device, no network egress.** Concretely:

- **Zero server, zero account, zero external service.** There is nothing to
  compromise remotely; all data lives in the user's browser / app storage.
- **No data leaves the device** — the backend makes no network calls at all.
  (This is an invariant, not an implementation detail: the library has no
  fetch/XHR/WebSocket surface.)
- **Strict CSP `connect-src 'none'` & App Store / Play Store "Data Not Collected" alignment:**
  - At the document boundary, `index.html` enforces a strict Content Security Policy with `connect-src 'none'` and `form-action 'none'` (see [frontend.md](frontend.md)), guaranteeing at the browser engine level that zero outbound connections can ever be initiated.
  - Because all records reside strictly in on-device IndexedDB (and user-controlled local JSON backup exports) with zero off-device transmission, zero telemetry, and zero third-party SDKs, the app legitimately qualifies for Apple App Store Connect's **"Data Not Collected"** nutrition label and Google Play Console's **"No data shared with third parties" / "No data collected"** Data Safety declaration (see [portability.md](portability.md)).
- **Isolation** — data is namespaced per browser profile / app instance; one
  user's budget is not visible to another.
- **Optional hardening: client-side encryption with WebCrypto**, keyed by a
  user-provided passphrase. This is **deferred** (see
  [resolved MVP defaults](portability.md#resolved-mvp-defaults)) — on-device + no-network
  already satisfies "purely locally and securely" for the MVP. WebCrypto is
  available in WebKit (iOS), Chromium (Android), and the PWA, so this can be
  added behind the same adapter without a rewrite.

> **Secure-context requirement:** `crypto.randomUUID()` and `crypto.subtle`
> (WebCrypto) are only exposed in a **secure context**. The PWA is HTTPS on
> GitHub Pages (secure), and Capacitor serves from `capacitor://localhost` /
> `http(s)://localhost`, which is also a secure context — so all three targets
> satisfy this. **Verify during implementation** (see
> [portability.md → Android-specific considerations](portability.md#android-specific-considerations)).
>
> **Threat model:** local-only storage protects against **remote** exposure. It
> does not protect against someone with the same device account / physical access
> reading the raw IndexedDB files. Passphrase encryption (WebCrypto) is the
> mitigation for that class of threat, and is a **deferred** future option.

## Resolved MVP default (carried to the index)

- **Client-side encryption (WebCrypto, user passphrase) is deferred for the MVP** —
  on-device IndexedDB + zero network egress already satisfies the MVP
  requirement. Tracked in
  [portability.md → resolved MVP defaults](portability.md#resolved-mvp-defaults).
