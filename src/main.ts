import { type BudgetApi, createBudgetApi } from "./budgetApi";
import type { StorageAdapter } from "./storage/adapter";
import { IndexedDbAdapter, VersionMismatchError } from "./storage/indexeddb";
import { type BudgetTabController, mountBudgetTab } from "./ui/budgetTab";
import { el, replaceChildren, text } from "./ui/dom";
import { renderShell, type ShellHandle } from "./ui/shell";

export interface FrameGuardWindow {
  readonly top: unknown;
  readonly self: unknown;
}

export interface FrameGuardDocument {
  readonly documentElement: {
    replaceChildren(): void;
  };
}

export function assertNotFramed(
  win: FrameGuardWindow,
  doc: FrameGuardDocument,
): void {
  let isFramed: boolean;
  try {
    isFramed = win.top !== win.self;
  } catch {
    isFramed = true;
  }
  if (isFramed) {
    doc.documentElement.replaceChildren();
    throw new Error("Framing is not permitted");
  }
}

/**
 * Storage adapter contract accepted by `bootstrapApp`, optionally exposing the
 * first-write durability hook (`IndexedDbAdapter.requestPersistenceAfterFirstAction`).
 */
export interface PersistableStorageAdapter extends StorageAdapter {
  requestPersistenceAfterFirstAction?(): Promise<boolean>;
}

/** Minimal window event/location surface for deterministic `bootstrapApp` testing. */
export interface BootstrapWindow {
  addEventListener(type: "focus", listener: () => void): void;
  removeEventListener(type: "focus", listener: () => void): void;
  readonly location?: { reload(): void };
}

/** Minimal document visibility surface for deterministic `bootstrapApp` testing. */
export interface BootstrapDocument {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Dependency-injectable options for `bootstrapApp`. */
export interface BootstrapAppOptions {
  /** Root container element into which the 3-tab shell is rendered (e.g. `#app`). */
  readonly container: HTMLElement;
  /** Storage adapter; defaults to `new IndexedDbAdapter()`. */
  readonly adapter?: PersistableStorageAdapter;
  /** Optional `BudgetApi` instance override (defaults to `createBudgetApi({ adapter })`). */
  readonly budget?: BudgetApi;
  /** Optional ID factory forwarded to `createBudgetApi` (injectable for tests). */
  readonly idFactory?: () => string;
  /** Optional clock forwarded to `createBudgetApi` and `mountBudgetTab` (injectable for tests). */
  readonly now?: () => Date;
  /** Window event target for `focus` recurring triggers; defaults to `window`. */
  readonly win?: BootstrapWindow;
  /** Document event target for `visibilitychange` recurring triggers; defaults to `document`. */
  readonly doc?: BootstrapDocument;
}

/** Handle returned by `bootstrapApp`, including a deterministic `dispose()` cleanup hook. */
export interface BootstrapAppHandle {
  readonly shell: ShellHandle;
  readonly budget: BudgetApi;
  readonly budgetTab: BudgetTabController | null;
  dispose(): void;
}

/**
 * Renders a non-destructive `role="alert"` recovery banner inside the Budget
 * panel when `budget.init()` fails. Never deletes or modifies stored data.
 */
function renderInitErrorBanner(
  panel: HTMLElement,
  err: unknown,
  win: BootstrapWindow,
): void {
  const isVersionMismatch = err instanceof VersionMismatchError;
  const title = isVersionMismatch ? "Update required" : "Storage unavailable";
  const message = isVersionMismatch
    ? "Your stored local budget data uses a newer schema version than this build of the app. Your data has not been deleted or modified. Please reload or update to the latest version of the app to continue."
    : "Unable to open local budget storage. Your existing data has not been deleted. Please reload the page or check that browser storage is enabled.";

  const reloadBtn = el(
    "button",
    {
      type: "button",
      class: "budget-btn budget-btn-primary",
    },
    [text("Reload app")],
  ) as HTMLButtonElement;

  reloadBtn.addEventListener("click", () => {
    win.location?.reload();
  });

  const banner = el(
    "div",
    {
      class: "budget-alert-banner",
      role: "alert",
      "aria-live": "assertive",
      "data-error-kind": isVersionMismatch ? "version-mismatch" : "storage",
    },
    [
      el("h2", { class: "budget-alert-title" }, [text(title)]),
      el("p", { class: "budget-alert-message" }, [text(message)]),
      el("div", { class: "budget-alert-actions" }, [reloadBtn]),
    ],
  );

  replaceChildren(panel, banner);
}

/**
 * Bootstraps the application into `options.container`:
 * 1. Renders the accessible 3-tab shell (`renderShell`).
 * 2. Opens storage via `budget.init()`, rendering a non-destructive
 *    `role="alert"` banner on `VersionMismatchError` or unexpected init errors
 *    (never calling `indexedDB.deleteDatabase()`).
 * 3. Runs `budget.runRecurringEngine()` on startup.
 * 4. Wires a one-shot `onUserWrite` durability callback that triggers
 *    `adapter.requestPersistenceAfterFirstAction?.()` only after the first
 *    user write/action (never during cold `init()`).
 * 5. Mounts `mountBudgetTab` into `shell.panels.budget` and awaits initial render.
 * 6. Registers serialized `window` `focus` and `document` `visibilitychange`
 *    listeners to re-run `budget.runRecurringEngine()` and refresh the Budget
 *    tab whenever new activities post, returning a `dispose()` cleanup hook.
 */
export async function bootstrapApp(
  options: BootstrapAppOptions,
): Promise<BootstrapAppHandle> {
  const { container } = options;
  const targetWin: BootstrapWindow = options.win ?? window;
  const targetDoc: BootstrapDocument = options.doc ?? document;

  const shell = renderShell(container);
  const adapter: PersistableStorageAdapter =
    options.adapter ?? new IndexedDbAdapter();
  const budget: BudgetApi =
    options.budget ??
    createBudgetApi({
      adapter,
      ...(options.idFactory !== undefined
        ? { idFactory: options.idFactory }
        : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });

  try {
    await budget.init();
  } catch (err) {
    renderInitErrorBanner(shell.panels.budget, err, targetWin);
    return {
      shell,
      budget,
      budgetTab: null,
      dispose(): void {},
    };
  }

  try {
    await budget.runRecurringEngine();
  } catch {
    // Best-effort startup recurring pass; do not block mounting the Budget tab
    // or emit an unhandled promise rejection.
  }

  let persistenceRequested = false;
  const onUserWrite = (): void => {
    if (persistenceRequested) {
      return;
    }
    persistenceRequested = true;
    try {
      const result = adapter.requestPersistenceAfterFirstAction?.();
      if (result !== undefined) {
        void Promise.resolve(result).catch(() => {
          // Best-effort durability request; ignore rejections silently.
        });
      }
    } catch {
      // Best-effort durability request; ignore synchronous throws silently.
    }
  };

  const budgetTab = mountBudgetTab({
    container: shell.panels.budget,
    budget,
    confirm: shell.confirm,
    onUserWrite,
    ...(options.now !== undefined ? { now: options.now } : {}),
  });

  await budgetTab.refresh();

  let disposed = false;
  let recurringInFlight: Promise<void> | null = null;
  let rerunRequested = false;

  const triggerRecurringPass = (): void => {
    if (disposed) {
      return;
    }
    if (recurringInFlight !== null) {
      rerunRequested = true;
      return;
    }
    recurringInFlight = (async () => {
      try {
        do {
          rerunRequested = false;
          const { posted } = await budget.runRecurringEngine();
          if (!disposed && posted.length > 0) {
            await budgetTab.refresh();
          }
        } while (rerunRequested && !disposed);
      } catch {
        // Best-effort focus/visibility recurring pass; never emit unhandled rejections.
      } finally {
        recurringInFlight = null;
      }
    })();
  };

  const handleFocus = (): void => {
    triggerRecurringPass();
  };

  const handleVisibilityChange = (): void => {
    if (targetDoc.visibilityState === "visible") {
      triggerRecurringPass();
    }
  };

  targetWin.addEventListener("focus", handleFocus);
  targetDoc.addEventListener("visibilitychange", handleVisibilityChange);

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    targetWin.removeEventListener("focus", handleFocus);
    targetDoc.removeEventListener("visibilitychange", handleVisibilityChange);
  };

  return {
    shell,
    budget,
    budgetTab,
    dispose,
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  assertNotFramed(window, document);

  const app = document.getElementById("app");
  if (app !== null) {
    void bootstrapApp({ container: app }).catch(() => {
      // All expected init/storage errors are handled inside bootstrapApp.
    });
  }
}
