/**
 * Base-path-scoped `BroadcastChannel` multi-tab synchronization
 * (`src/platform/sync.ts`).
 *
 * `project-plan/frontend.md` → Shared-Origin Isolation on GitHub Pages (OQ-1)
 * & Multi-Tab State Synchronization (`BroadcastChannel`):
 * - Derives the channel name from `import.meta.env.BASE_URL`:
 *   - Production (`/simple-budget-app/`): `"simple-budget-sync"`
 *   - PR preview (`/simple-budget-app/pr-<N>/`): `"simple-budget-sync-pr-<N>"`
 * - Feature-detects `typeof BroadcastChannel !== "undefined"`, degrading
 *   gracefully to a no-op handle in environments where `BroadcastChannel` is
 *   unavailable.
 * - Posts `{ type: "budget-mutated", timestamp: Date.now() }` on local writes,
 *   validates incoming peer messages strictly (ignoring malformed/unknown
 *   payloads), and tears down cleanly via `close()`.
 *
 * Zero production dependencies: uses only the built-in Web-platform
 * `BroadcastChannel` API.
 */

/** Canonical message payload emitted on local budget mutations. */
export interface BudgetMutatedMessage {
  readonly type: "budget-mutated";
  readonly timestamp: number;
}

/** Minimal `BroadcastChannel` instance surface (injectable for tests). */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  close(): void;
}

/** Constructor signature for `BroadcastChannel` (injectable for tests). */
export type BroadcastChannelConstructor = new (
  name: string,
) => BroadcastChannelLike;

/** Options accepted by `createSyncChannel`. */
export interface CreateSyncChannelOptions {
  /** Base path used to derive the channel name (defaults to `import.meta.env.BASE_URL ?? "/simple-budget-app/"`). */
  readonly basePath?: string;
  /** Optional explicit channel name override (takes precedence over `basePath`). */
  readonly channelName?: string;
  /**
   * Optional `BroadcastChannel` constructor override (injectable for tests).
   * Pass `null` to force the unsupported no-op fallback.
   */
  readonly broadcastChannelCtor?: BroadcastChannelConstructor | null;
  /** Optional timestamp factory (defaults to `Date.now`). */
  readonly now?: () => number;
}

/** Handle returned by `createSyncChannel`. */
export interface SyncChannel {
  /** Resolved base-path-scoped channel name. */
  readonly channelName: string;
  /** `true` when backed by an active `BroadcastChannel`, `false` on no-op fallback. */
  readonly supported: boolean;
  /** Broadcast `{ type: "budget-mutated", timestamp }` to peer tabs. */
  notifyMutated(): void;
  /**
   * Subscribe to valid peer `"budget-mutated"` messages.
   * Returns an unsubscribe function.
   */
  subscribe(onMutated: (message: BudgetMutatedMessage) => void): () => void;
  /** Remove listeners and close the underlying `BroadcastChannel` (idempotent). */
  close(): void;
}

/**
 * Derive the `BroadcastChannel` name from the build's base path (OQ-1,
 * shared-origin isolation on GitHub Pages):
 * - Production (`/simple-budget-app/`): `"simple-budget-sync"`
 * - PR preview (`/simple-budget-app/pr-<N>/`): `"simple-budget-sync-pr-<N>"`
 */
export function deriveSyncChannelName(basePath: string): string {
  const prMatch = /\/pr-(\d+)\/?$/.exec(basePath);
  return prMatch ? `simple-budget-sync-pr-${prMatch[1]}` : "simple-budget-sync";
}

/**
 * Default base-path-scoped channel name derived once from
 * `import.meta.env.BASE_URL`.
 */
export const SYNC_CHANNEL_NAME = deriveSyncChannelName(
  import.meta.env.BASE_URL ?? "/simple-budget-app/",
);

function isBudgetMutatedMessage(value: unknown): value is BudgetMutatedMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === "budget-mutated" &&
    typeof record.timestamp === "number" &&
    Number.isFinite(record.timestamp)
  );
}

function createNoopSyncChannel(channelName: string): SyncChannel {
  return {
    channelName,
    supported: false,
    notifyMutated(): void {},
    subscribe(): () => void {
      return () => {};
    },
    close(): void {},
  };
}

/**
 * Opens a base-path-scoped `BroadcastChannel` for multi-tab state
 * synchronization, degrading gracefully to a no-op handle when
 * `BroadcastChannel` is unavailable.
 */
export function createSyncChannel(
  options: CreateSyncChannelOptions = {},
): SyncChannel {
  const channelName =
    options.channelName ??
    deriveSyncChannelName(
      options.basePath ?? import.meta.env.BASE_URL ?? "/simple-budget-app/",
    );
  const now = options.now ?? (() => Date.now());

  const ctor: BroadcastChannelConstructor | null =
    options.broadcastChannelCtor !== undefined
      ? options.broadcastChannelCtor
      : typeof BroadcastChannel !== "undefined"
        ? BroadcastChannel
        : null;

  if (ctor === null) {
    return createNoopSyncChannel(channelName);
  }

  let channel: BroadcastChannelLike;
  try {
    channel = new ctor(channelName);
  } catch {
    return createNoopSyncChannel(channelName);
  }

  const subscribers = new Set<(message: BudgetMutatedMessage) => void>();
  let closed = false;

  const handleMessage = (event: MessageEvent<unknown>): void => {
    if (closed || !isBudgetMutatedMessage(event.data)) {
      return;
    }
    const payload = event.data;
    for (const listener of [...subscribers]) {
      try {
        listener(payload);
      } catch {
        // Isolate subscriber errors so one failing listener cannot break others.
      }
    }
  };

  channel.addEventListener("message", handleMessage);

  return {
    channelName,
    supported: true,
    notifyMutated(): void {
      if (closed) {
        return;
      }
      const message: BudgetMutatedMessage = {
        type: "budget-mutated",
        timestamp: now(),
      };
      try {
        channel.postMessage(message);
      } catch {
        // Best-effort broadcast; ignore postMessage failures on closing/detached channels.
      }
    },
    subscribe(onMutated: (message: BudgetMutatedMessage) => void): () => void {
      if (closed) {
        return () => {};
      }
      subscribers.add(onMutated);
      return () => {
        subscribers.delete(onMutated);
      };
    },
    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      subscribers.clear();
      try {
        channel.removeEventListener("message", handleMessage);
      } catch {
        // Best-effort cleanup.
      }
      try {
        channel.close();
      } catch {
        // Best-effort cleanup.
      }
    },
  };
}
