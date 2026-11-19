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
- **Pre-import safety (size check, confirm dialog & auto-snapshot):** Before invoking `budget.importBackup(rawJson)` / `replaceAll`, the Settings UI MUST:
  1. Check `file.size <= 10 * 1024 * 1024` (10 MB) **before** reading the file into memory (complementing the in-core `validateBackupPayload` byte check).
  2. Present an explicit confirmation dialog warning that importing will replace all existing local rules and activities.
  3. Automatically trigger a download of a **pre-import safety snapshot** (`budget.exportBackup()`) before executing `replaceAll`, so the user always retains a recovery copy even if they import an unintended valid backup file.
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
- **Shared for MVP PWA, native durability gate for store release (OQ-4):** The
  `indexeddb.ts` adapter implements `StorageAdapter` for the MVP PWA across all
  modern browsers. However, because iOS (`WKWebView`) and Android (`WebView`)
  can evict WebView IndexedDB under OS storage pressure (see
  [Storage Durability & WebKit Eviction Mitigation](#storage-durability--webkit-eviction-mitigation)),
  a **durable native store** (a **SQLite-backed `StorageAdapter`**, or a
  mirrored auto-snapshot written to the app's native Documents directory) is
  **REQUIRED before the first App Store / Play Store release** (a mandatory
  release gate, not an optional future swap). Because all persistence sits
  behind `StorageAdapter`, swapping in the durable native adapter requires zero
  changes to `src/core/` or the front-end.

## IndexedDB Schema Versioning, Indexes & Migration Strategy

To guarantee deterministic persistence in v1 and zero-data-loss migrations as post-MVP features ship (see [data-model.md](data-model.md)), `src/storage/indexeddb.ts` enforces an explicit schema and migration contract:

- **Database constants & base-path namespacing (origin isolation, OQ-1):**
  - Because GitHub Pages serves production (`/simple-budget-app/`) and every PR
    preview (`/simple-budget-app/pr-<N>/`) from the same browser origin
    (`https://tandyn.github.io`), and IndexedDB is scoped per origin (not per
    path), the database name MUST be derived from the build's base path
    (`import.meta.env.BASE_URL`) so previews never open, mutate, or bump
    `DB_VERSION` on the production database:
    - Production (`/simple-budget-app/`): `DB_NAME = "simple-budget-app"`
    - PR preview (`/simple-budget-app/pr-<N>/`): `DB_NAME = "simple-budget-app-pr-<N>"`
  - `DB_VERSION = 1`
- **Deterministic `onupgradeneeded(event)` migration switch:**
  - Upgrades run sequentially from `event.oldVersion` to `event.newVersion` (or `DB_VERSION`) inside IndexedDB's atomic `versionchange` transaction (`if (oldVersion < 1) { ... }`, `if (oldVersion < 2) { ... }` in future releases).
  - If any step inside `onupgradeneeded` throws, IndexedDB automatically aborts the `versionchange` transaction and leaves the prior database version untouched.
- **Object stores and secondary indexes created in v1 (`DB_VERSION = 1`):**
  1. **`"meta"`** (`{ keyPath: "key" }`):
     - Stores database-level metadata, initialized on upgrade with `{ key: "schema", schemaVersion: 1, updatedAt: new Date().toISOString() }`, and tracks user backup metadata such as `{ key: "lastBackupAt", timestamp: ISO-8601 }` for the Settings backup-age indicator.
  2. **`"rules"`** (`{ keyPath: "id" }`):
     - No secondary index on `active` (`by_active` was removed because booleans are not valid IndexedDB keys per the W3C IndexedDB specification — valid key types are `number`, `string`, `Date`, binary, and `Array`; indexing a boolean field silently omits records and causes index queries to return empty results). Because the recurring rules list is small, active vs. paused rules are filtered in memory after reading `"rules"`.
  3. **`"activities"`** (`{ keyPath: "id" }`):
     - Secondary index **`by_dateTime`** on keyPath `"dateTime"` (`{ unique: false }`) for chronological ordering and `[since, until]` date-range queries.
     - Secondary index **`by_type`** on keyPath `"type"` (`{ unique: false }`) for filtering `"income" | "expense" | "deposit"`.
     - Secondary index **`by_tags`** on keyPath `"tags"` (`{ unique: false, multiEntry: true }`) for per-tag insights and search queries.
     - Compound secondary index **`by_rule_period`** on keyPath `["sourceRuleId", "period"]` (`{ unique: false }`) for O(1) recurring-engine idempotency lookups (`(sourceRuleId, period)`).

```ts
export function deriveDbName(basePath: string): string {
  const prMatch = /\/pr-(\d+)\/?$/.exec(basePath);
  return prMatch ? `simple-budget-app-pr-${prMatch[1]}` : "simple-budget-app";
}

export const DB_NAME = deriveDbName(import.meta.env.BASE_URL ?? "/simple-budget-app/");
export const DB_VERSION = 1;

function handleUpgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  if (oldVersion < 1) {
    const metaStore = db.createObjectStore("meta", { keyPath: "key" });
    metaStore.put({
      key: "schema",
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    });

    db.createObjectStore("rules", { keyPath: "id" });
    // Note: No index on boolean "active" — booleans are not valid IndexedDB keys;
    // active vs. paused rules are filtered in memory.

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

Local-first browser and WebView storage is subject to user-agent storage pressure and platform eviction policies. The plan avoids overstated durability guarantees and pairs honest platform expectations with explicit user-visible controls and a store-release durability gate:

- **Eviction & durability reality across targets:**
  - **Standard browser tabs (Safari/WebKit, Chrome, Firefox):** Safari/WebKit applies Intelligent Tracking Prevention (ITP) 7-day script-writable storage eviction to unvisited browser-tab origins, and any browser may reclaim non-persistent origin storage under OS disk pressure. Installing the PWA to the iOS Home Screen (`display: "standalone"`) improves persistence heuristics compared to a casual tab, but does **not** guarantee immunity from OS storage reclamation.
  - **Capacitor native shells (iOS `WKWebView` / Android `WebView`) — OQ-4 release gate:** Per Capacitor's official Storage documentation, **WebView `IndexedDB` and `localStorage` can be cleared by the OS under storage pressure** on both iOS and Android. WebView storage is therefore **not** durable enough on its own for a store-distributed personal finance app. While IndexedDB remains the MVP PWA store, a **durable native store** — either a **SQLite-backed `StorageAdapter`** behind the unchanged interface, or a **mirrored auto-snapshot written to the app's native Documents directory** — is **REQUIRED before the first App Store / Play Store release** (release gate, not an optional future swap).
- **Best-effort `navigator.storage.persist()` after first user action (not cold `init()`):**
  - Do **not** call `navigator.storage.persist()` unconditionally during cold `budget.init()` / `open()` — Firefox displays a permission prompt on `persist()` (jarring before the user has interacted with the app), while Safari and Chrome evaluate persistence heuristically based on engagement.
  - Instead, invoke `navigator.storage?.persist?.()` once, wrapped in `try/catch`, **immediately after the user's first meaningful write/action** (e.g., creating their first recurring rule or manual activity), and surface the returned boolean result to the UI:
    ```ts
    async function requestPersistenceAfterFirstAction(): Promise<boolean> {
      try {
        return (await navigator.storage?.persist?.()) ?? false;
      } catch {
        // Non-blocking: proceed with standard IndexedDB storage if unsupported or denied
        return false;
      }
    }
    ```
- **Settings durability status (`navigator.storage.persisted()`) & N-day backup nag:**
  1. **Persisted status readout:** Settings queries `await navigator.storage?.persisted?.()` (falling back to `false` when unsupported) and displays the live storage persistence status (e.g., *"Persistent storage granted"* vs. *"Best-effort browser storage — export regular backups"*), updating immediately after the first-action `persist()` call.
  2. **Last-backup date & N-day backup reminder:** Every successful `budget.exportBackup()` writes `{ key: "lastBackupAt", timestamp: new Date().toISOString() }` to the `"meta"` object store. Settings displays the **last-backup date** (or *"Never backed up"*) and shows a non-blocking **N-day backup nag** (default `N = 30` days since `lastBackupAt`, or once user data exists with no backup) prompting a one-tap JSON backup export to Files / iCloud Drive / Google Drive.
  3. **Periodic JSON backup exports & pre-import safety:** Combining one-tap JSON export, the N-day backup nag, and the pre-import safety snapshot before `replaceAll` ensures users always hold a portable, human-readable recovery copy.

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
- **Isolation & shared-origin residual risk (OQ-1 adopted default):**
  - Data is isolated per browser profile / native app sandbox.
  - On GitHub Pages project sites, production (`/simple-budget-app/`), PR
    previews (`/simple-budget-app/pr-<N>/`), and any other repository under
    `https://tandyn.github.io` share the same browser origin. Deriving the
    IndexedDB database name (`simple-budget-app` vs `simple-budget-app-pr-<N>`)
    and CacheStorage names (`sbapp-<buildhash>` vs `sbapp-pr-<N>-<buildhash>`)
    from `import.meta.env.BASE_URL` prevents accidental cross-contamination or
    `DB_VERSION` upgrades between previews and production.
  - **Residual risk & optional upgrade:** Base-path namespacing does **not**
    prevent an XSS-compromised sibling GitHub Pages repo on
    `https://tandyn.github.io` from reading same-origin IndexedDB (neither CSP
    nor a service worker can isolate same-origin IndexedDB). Hosting the
    production PWA on a **dedicated custom domain** provides true origin
    isolation and is **recommended-optional, not required** for MVP. Native iOS
    and Android Capacitor store builds are unaffected because each native app
    runs in its own isolated WebView origin and OS sandbox (see
    [frontend.md → Shared-Origin Isolation on GitHub Pages](frontend.md#4-shared-origin-isolation-on-github-pages-oq-1-adopted-default)).
- **Passphrase-encrypted backup export (post-MVP, required before store release):**
  - Plaintext JSON exports (`BudgetBackup`) expose full financial history if
    stored in iCloud Drive, Google Drive, or shared folders. While deferred from
    the MVP, **passphrase-encrypted backup export is required before the first
    App Store / Play Store release** (Phase 6 store-release gate).
  - Uses built-in **WebCrypto (`crypto.subtle`)** — zero production
    dependencies — with **AES-256-GCM** (`AES-GCM`), **PBKDF2-HMAC-SHA256**
    (`>= 600,000` iterations, OWASP baseline), fresh per-export random salt and
    12-byte IV, wrapped in the versioned envelope
    `{ schemaVersion, enc: { alg, kdf, iter, salt, iv }, ciphertext }` (see
    [data-model.md → Post-MVP Encrypted Backup Envelope](data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)).
- **Optional native biometric app lock (post-MVP, native-only before store release):**
  - The `native/` Capacitor shells (iOS Face ID / Touch ID and Android
    `BiometricPrompt`) may add an optional OS-native biometric app lock gate
    before store release, protecting local financial data against casual
    physical device access and strengthening native value for Apple App Store
    Review Guideline 4.2. (Not applicable to the browser PWA.)
- **Optional at-rest IndexedDB encryption (deferred):**
  - Field-level / adapter-level WebCrypto encryption of IndexedDB records keyed
    by a user passphrase remains **deferred** for the MVP (see
    [resolved MVP defaults](portability.md#resolved-mvp-defaults)) — on-device +
    zero network egress already satisfies "purely locally and securely" for the
    MVP. WebCrypto is available in WebKit (iOS), Chromium (Android), and the
    PWA, so it can be added behind `StorageAdapter` later without a rewrite.
- **Future E2EE multi-device sync note:**
  - MVP hard-deletes records; optional `deletedAt?` and `deviceId?` tombstone
    slots are reserved on `RecurringRule` and `Activity` so a future sync layer
    requires no v1 data migration. Any future sync MUST use **end-to-end
    encryption (E2EE) with a user-held key**; the App Store / Play Store privacy
    label stays unaffected **only if** no developer-readable plaintext (or
    unencrypted metadata) is collected (see
    [data-model.md → Privacy-Label Impact and Sync Tradeoffs](data-model.md#privacy-label-impact-and-sync-tradeoffs)).

> **Secure-context requirement:** `crypto.randomUUID()` and `crypto.subtle`
> (WebCrypto) are only exposed in a **secure context**. The PWA is HTTPS on
> GitHub Pages (secure), and Capacitor serves from `capacitor://localhost` /
> `http(s)://localhost`, which is also a secure context — so all three targets
> satisfy this. **Verify during implementation** (see
> [portability.md → Android-specific considerations](portability.md#android-specific-considerations)).
>
> **Threat model:** local-only storage protects against **remote** exposure. It
> does not protect against someone with the same device account / physical access
> reading raw IndexedDB files or plaintext backup files in cloud storage.
> Passphrase-encrypted backup export (AES-256-GCM / PBKDF2-HMAC-SHA256) and
> optional native biometric app lock address backup and casual physical-access
> threats before store release; full at-rest IndexedDB encryption remains a
> deferred future option.

## Resolved MVP default (carried to the index)

- **At-rest IndexedDB encryption is deferred for the MVP; passphrase-encrypted
  backup export (WebCrypto AES-256-GCM, PBKDF2-HMAC-SHA256 `>= 600,000`
  iterations) and optional native biometric app lock are post-MVP store-release
  gates** — on-device IndexedDB + zero network egress satisfies the MVP
  requirement. Tracked in
  [portability.md → resolved MVP defaults](portability.md#resolved-mvp-defaults).
