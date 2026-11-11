# Local secure storage

**Decision (from the solutions-architect's spike #6 findings, extended to Android
in spike #22 / Epic #21):** use **IndexedDB** as the primary store, wrapped behind
a thin **storage-adapter interface** so the store can be swapped without touching
business logic.

This is the load-bearing choice for portability, so it is covered here in full
and referenced by [data-model.md](data-model.md) and
[portability.md](portability.md).

## Recommended approach

- **Primary store: IndexedDB.**
- **Access pattern:** all reads/writes go through a small
  **`StorageAdapter`** interface (`open` / `save` / `delete` / `query`). Business
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
}
```

`Entity` / `EntityKey` are the domain shapes from
[data-model.md](data-model.md) (`RecurringRule`, `Activity`). `QueryPredicate` is
a minimal, adapter-agnostic filter (e.g. `{ field: 'sourceRuleId', eq: ruleId }`).

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

## Security properties

**"Secure" for this app means on-device, no network egress.** Concretely:

- **Zero server, zero account, zero external service.** There is nothing to
  compromise remotely; all data lives in the user's browser / app storage.
- **No data leaves the device** — the backend makes no network calls at all.
  (This is an invariant, not an implementation detail: the library has no
  fetch/XHR/WebSocket surface.)
- **Isolation** — data is namespaced per browser profile / app instance; one
  user's budget is not visible to another.
- **Optional hardening: client-side encryption with WebCrypto**, keyed by a
  user-provided passphrase. This is **deferred** (see
  [open decisions](portability.md#open-decisions)) — on-device + no-network
  already satisfies "purely locally and securely" for the MVP. WebCrypto is
  available in WebKit (iOS), Chromium (Android), and the PWA, so this can be
  added behind the same adapter without a rewrite.

> **Secure-context requirement:** `crypto.randomUUID()` and `crypto.subtle`
> (WebCrypto) are only exposed in a **secure context**. The PWA is HTTPS on
> GitHub Pages (secure), and Capacitor serves from `capacitor://localhost` /
> `http(s)://localhost`, which is also a secure context — so all three targets
> satisfy this. **Verify during implementation** (see
> [portability.md → Android-specific considerations](portability.md#android-specific-considerations).
>
> **Threat model:** local-only storage protects against **remote** exposure. It
> does not protect against someone with the same device account / physical access
> reading the raw IndexedDB files. Passphrase encryption (WebCrypto) is the
> mitigation for that class of threat, and is an open decision.

## Open decision (carried to the index)

- **Is client-side encryption (WebCrypto, user passphrase) in scope for the MVP
  or deferred?** Recommendation: **defer** — on-device, no-network already
  satisfies the requirement. Tracked in
  [portability.md → open decisions](portability.md#open-decisions).
