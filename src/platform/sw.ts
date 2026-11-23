/**
 * Trusted-Types-compliant Service Worker registration & safe user-accepted
 * update lifecycle (`src/platform/sw.ts`).
 *
 * `project-plan/frontend.md → Service Worker Design`:
 * - Registers `${BASE_URL}sw.js` with `{ scope: BASE_URL, updateViaCache: "none" }`
 *   to bypass GitHub Pages' default 10-minute HTTP cache for immediate update
 *   and rollback detection.
 * - Uses a minimal `createScriptURL`-only Trusted Types policy (`"sw-register"`)
 *   locked strictly to `${BASE_URL}sw.js` (no `createHTML`, no `createScript`),
 *   falling back to the plain string where `window.trustedTypes` is absent
 *   (e.g. Safari/WebKit, Firefox).
 * - Never registers inside Capacitor native shells (`window.Capacitor` present
 *   or `isNative === true`) or when `navigator.serviceWorker` is unavailable.
 * - Never calls `skipWaiting()` silently: surfaces waiting/newly-installed
 *   updates via `onUpdateAvailable(applyUpdate)` and posts
 *   `{ type: "SKIP_WAITING" }` only upon user acceptance, reloading once on
 *   `controllerchange`.
 *
 * Zero production dependencies: built-in Web-platform APIs only.
 */

export const SW_TRUSTED_TYPES_POLICY_NAME = "sw-register";
export const SW_SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;

export interface TrustedTypesPolicyLike {
  createScriptURL(input: string): unknown;
}

export interface TrustedTypesLike {
  createPolicy(
    name: string,
    rules: {
      createScriptURL(input: string): string;
    },
  ): TrustedTypesPolicyLike;
}

export interface ServiceWorkerLike {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

export interface ServiceWorkerRegistrationLike {
  readonly waiting: ServiceWorkerLike | null;
  readonly installing: ServiceWorkerLike | null;
  addEventListener(type: "updatefound", listener: () => void): void;
  removeEventListener(type: "updatefound", listener: () => void): void;
}

export interface ServiceWorkerContainerLike {
  readonly controller: unknown;
  register(
    scriptURL: string,
    options?: RegistrationOptions,
  ): Promise<ServiceWorkerRegistrationLike>;
  addEventListener(type: "controllerchange", listener: () => void): void;
  removeEventListener(type: "controllerchange", listener: () => void): void;
}

export interface SwWindow {
  readonly Capacitor?: unknown;
  readonly trustedTypes?: TrustedTypesLike;
  readonly location?: { reload(): void };
}

export interface SwNavigator {
  readonly serviceWorker?: ServiceWorkerContainerLike;
}

export interface RegisterServiceWorkerOptions {
  /** Base URL scope for the SW (defaults to `import.meta.env.BASE_URL ?? "/simple-budget-app/"`). */
  readonly baseUrl?: string;
  /** Skip registration when running inside a native Capacitor shell (`platform.isNative === true`). */
  readonly isNative?: boolean;
  /** Called when an updated SW enters `waiting` while a controller is active. */
  readonly onUpdateAvailable?: (applyUpdate: () => void) => void;
  /** Window object (injectable for tests; defaults to global `window`). */
  readonly win?: SwWindow;
  /** Navigator object (injectable for tests; defaults to global `navigator`). */
  readonly nav?: SwNavigator;
}

export interface ServiceWorkerHandle {
  /** Whether SW registration was attempted in this runtime environment. */
  readonly supported: boolean;
  /** Resolves to the active registration, or `null` if skipped or registration failed. */
  readonly ready: Promise<ServiceWorkerRegistrationLike | null>;
  /** Removes all SW lifecycle listeners and suppresses pending update callbacks. */
  dispose(): void;
}

interface CachedSwPolicy {
  readonly expectedSwUrl: string;
  readonly policy: TrustedTypesPolicyLike;
}

const policyCache = new WeakMap<TrustedTypesLike, CachedSwPolicy>();

/**
 * Normalizes a base URL so it always starts and ends with `/`.
 */
export function normalizeSwBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/**
 * Creates (or retrieves from the per-realm cache) the minimal `createScriptURL`-only
 * Trusted Types policy named `"sw-register"` locked strictly to `expectedSwUrl`.
 */
export function createSwRegisterPolicy(
  trustedTypes: TrustedTypesLike,
  expectedSwUrl: string,
): TrustedTypesPolicyLike {
  const cached = policyCache.get(trustedTypes);
  if (cached !== undefined && cached.expectedSwUrl === expectedSwUrl) {
    return cached.policy;
  }

  const policy = trustedTypes.createPolicy(SW_TRUSTED_TYPES_POLICY_NAME, {
    createScriptURL(url: string): string {
      if (url !== expectedSwUrl) {
        throw new TypeError("Disallowed SW URL");
      }
      return url;
    },
  });

  policyCache.set(trustedTypes, { expectedSwUrl, policy });
  return policy;
}

/**
 * Produces a TrustedScriptURL for `url` using the `"sw-register"` policy when
 * `win.trustedTypes.createPolicy` is available, or validates and returns the
 * plain string where Trusted Types is absent (e.g. WebKit/Firefox).
 *
 * Always throws `TypeError("Disallowed SW URL")` if `url !== expectedSwUrl`.
 */
export function createSwScriptUrl(
  url: string,
  expectedSwUrl: string,
  win?: SwWindow,
): unknown {
  const tt = win?.trustedTypes;
  if (tt !== undefined && typeof tt.createPolicy === "function") {
    const policy = createSwRegisterPolicy(tt, expectedSwUrl);
    return policy.createScriptURL(url);
  }
  if (url !== expectedSwUrl) {
    throw new TypeError("Disallowed SW URL");
  }
  return url;
}

function isCapacitorPresent(win: SwWindow | undefined): boolean {
  return win !== undefined && "Capacitor" in win && win.Capacitor !== undefined;
}

function createNoopHandle(): ServiceWorkerHandle {
  return {
    supported: false,
    ready: Promise.resolve(null),
    dispose(): void {},
  };
}

/**
 * Registers the PWA Service Worker (`${baseUrl}sw.js`) with
 * `{ scope: baseUrl, updateViaCache: "none" }` and wires the user-accepted
 * update lifecycle (`onUpdateAvailable` → `{ type: "SKIP_WAITING" }` →
 * single reload on `controllerchange`).
 */
export function registerServiceWorker(
  options: RegisterServiceWorkerOptions = {},
): ServiceWorkerHandle {
  const targetWin: SwWindow | undefined =
    options.win ??
    (typeof window !== "undefined"
      ? (window as unknown as SwWindow)
      : undefined);
  const targetNav: SwNavigator | undefined =
    options.nav ??
    (typeof navigator !== "undefined"
      ? (navigator as unknown as SwNavigator)
      : undefined);

  if (options.isNative === true || isCapacitorPresent(targetWin)) {
    return createNoopHandle();
  }

  const swContainer = targetNav?.serviceWorker;
  if (swContainer === undefined || typeof swContainer.register !== "function") {
    return createNoopHandle();
  }

  const baseUrl = normalizeSwBaseUrl(
    options.baseUrl ?? import.meta.env.BASE_URL ?? "/simple-budget-app/",
  );
  const expectedSwUrl = `${baseUrl}sw.js`;

  let swScriptUrl: unknown;
  try {
    swScriptUrl = createSwScriptUrl(expectedSwUrl, expectedSwUrl, targetWin);
  } catch {
    return createNoopHandle();
  }

  let disposed = false;
  let registration: ServiceWorkerRegistrationLike | null = null;
  let awaitingControllerChange = false;
  let reloading = false;
  let controllerChangeAttached = false;
  let notifiedWorker: ServiceWorkerLike | null = null;
  const installingCleanups: Array<() => void> = [];

  const handleControllerChange = (): void => {
    if (disposed || !awaitingControllerChange || reloading) {
      return;
    }
    reloading = true;
    targetWin?.location?.reload();
  };

  const notifyUpdate = (waitingWorker: ServiceWorkerLike): void => {
    if (disposed || notifiedWorker === waitingWorker) {
      return;
    }
    notifiedWorker = waitingWorker;

    const applyUpdate = (): void => {
      if (disposed || awaitingControllerChange) {
        return;
      }
      const targetWorker = registration?.waiting ?? waitingWorker;
      if (targetWorker === null || targetWorker === undefined) {
        return;
      }
      awaitingControllerChange = true;
      if (!controllerChangeAttached) {
        swContainer.addEventListener(
          "controllerchange",
          handleControllerChange,
        );
        controllerChangeAttached = true;
      }
      targetWorker.postMessage(SW_SKIP_WAITING_MESSAGE);
    };

    options.onUpdateAvailable?.(applyUpdate);
  };

  const trackInstallingWorker = (worker: ServiceWorkerLike): void => {
    const handleStateChange = (): void => {
      if (disposed) {
        return;
      }
      if (
        worker.state === "installed" &&
        swContainer.controller !== null &&
        swContainer.controller !== undefined
      ) {
        notifyUpdate(worker);
      }
    };
    worker.addEventListener("statechange", handleStateChange);
    installingCleanups.push(() => {
      worker.removeEventListener("statechange", handleStateChange);
    });
    handleStateChange();
  };

  const handleUpdateFound = (): void => {
    if (disposed || registration === null) {
      return;
    }
    const installing = registration.installing;
    if (installing !== null && installing !== undefined) {
      trackInstallingWorker(installing);
    }
  };

  const ready: Promise<ServiceWorkerRegistrationLike | null> = Promise.resolve()
    .then(() =>
      swContainer.register(swScriptUrl as string, {
        scope: baseUrl,
        updateViaCache: "none",
      }),
    )
    .then((reg) => {
      if (disposed) {
        return null;
      }
      registration = reg;
      reg.addEventListener("updatefound", handleUpdateFound);

      if (
        reg.waiting !== null &&
        reg.waiting !== undefined &&
        swContainer.controller !== null &&
        swContainer.controller !== undefined
      ) {
        notifyUpdate(reg.waiting);
      } else if (reg.installing !== null && reg.installing !== undefined) {
        trackInstallingWorker(reg.installing);
      }

      return reg;
    })
    .catch(() => null);

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (registration !== null) {
      registration.removeEventListener("updatefound", handleUpdateFound);
    }
    for (const cleanup of installingCleanups) {
      cleanup();
    }
    installingCleanups.length = 0;
    if (controllerChangeAttached) {
      swContainer.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      controllerChangeAttached = false;
    }
  };

  return {
    supported: true,
    ready,
    dispose,
  };
}
