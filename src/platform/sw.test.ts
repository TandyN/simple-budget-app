// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  createSwRegisterPolicy,
  createSwScriptUrl,
  normalizeSwBaseUrl,
  registerServiceWorker,
  type ServiceWorkerContainerLike,
  type ServiceWorkerLike,
  type ServiceWorkerRegistrationLike,
  SW_SKIP_WAITING_MESSAGE,
  SW_TRUSTED_TYPES_POLICY_NAME,
  type SwNavigator,
  type SwWindow,
  type TrustedTypesLike,
} from "./sw";

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    let set = this.listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    const set = this.listeners.get(type);
    if (set === undefined) {
      return;
    }
    for (const listener of [...set]) {
      listener();
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function createFakeWorker(initialState = "installing"): ServiceWorkerLike & {
  setState(next: string): void;
  readonly postMessage: ReturnType<typeof vi.fn<(msg: unknown) => void>>;
  listenerCount(type: string): number;
} {
  const bus = new FakeEventTarget();
  let state = initialState;
  const postMessage = vi.fn<(msg: unknown) => void>();

  return {
    get state(): string {
      return state;
    },
    postMessage,
    addEventListener(type: "statechange", listener: () => void): void {
      bus.addEventListener(type, listener);
    },
    removeEventListener(type: "statechange", listener: () => void): void {
      bus.removeEventListener(type, listener);
    },
    setState(next: string): void {
      state = next;
      bus.emit("statechange");
    },
    listenerCount(type: string): number {
      return bus.listenerCount(type);
    },
  };
}

function createFakeRegistration(options?: {
  waiting?: ServiceWorkerLike | null;
  installing?: ServiceWorkerLike | null;
}): ServiceWorkerRegistrationLike & {
  waiting: ServiceWorkerLike | null;
  installing: ServiceWorkerLike | null;
  emitUpdateFound(): void;
  listenerCount(type: string): number;
} {
  const bus = new FakeEventTarget();
  const reg = {
    waiting: options?.waiting ?? null,
    installing: options?.installing ?? null,
    addEventListener(type: "updatefound", listener: () => void): void {
      bus.addEventListener(type, listener);
    },
    removeEventListener(type: "updatefound", listener: () => void): void {
      bus.removeEventListener(type, listener);
    },
    emitUpdateFound(): void {
      bus.emit("updatefound");
    },
    listenerCount(type: string): number {
      return bus.listenerCount(type);
    },
  };
  return reg;
}

function createFakeSwContainer(options?: {
  controller?: unknown;
  registration?: ServiceWorkerRegistrationLike;
  registerImpl?: ServiceWorkerContainerLike["register"];
}): ServiceWorkerContainerLike & {
  controller: unknown;
  readonly register: ReturnType<
    typeof vi.fn<ServiceWorkerContainerLike["register"]>
  >;
  emitControllerChange(): void;
  listenerCount(type: string): number;
} {
  const bus = new FakeEventTarget();
  const defaultReg = options?.registration ?? createFakeRegistration();
  const register = vi.fn<ServiceWorkerContainerLike["register"]>(
    options?.registerImpl ?? (async () => defaultReg),
  );

  return {
    controller: options?.controller ?? null,
    register,
    addEventListener(type: "controllerchange", listener: () => void): void {
      bus.addEventListener(type, listener);
    },
    removeEventListener(type: "controllerchange", listener: () => void): void {
      bus.removeEventListener(type, listener);
    },
    emitControllerChange(): void {
      bus.emit("controllerchange");
    },
    listenerCount(type: string): number {
      return bus.listenerCount(type);
    },
  };
}

function createFakeTrustedTypes(): {
  trustedTypes: TrustedTypesLike;
  createPolicySpy: ReturnType<typeof vi.fn<TrustedTypesLike["createPolicy"]>>;
} {
  const createPolicySpy = vi.fn<TrustedTypesLike["createPolicy"]>(
    (_name, rules) => ({
      createScriptURL(input: string): unknown {
        const validated = rules.createScriptURL(input);
        return { __trustedScriptURL: validated };
      },
    }),
  );

  return {
    trustedTypes: { createPolicy: createPolicySpy },
    createPolicySpy,
  };
}

describe("normalizeSwBaseUrl", () => {
  it("normalizes empty, root, and sub-path values with leading and trailing slashes", () => {
    expect(normalizeSwBaseUrl("")).toBe("/");
    expect(normalizeSwBaseUrl("/")).toBe("/");
    expect(normalizeSwBaseUrl("/simple-budget-app")).toBe(
      "/simple-budget-app/",
    );
    expect(normalizeSwBaseUrl("simple-budget-app/pr-42")).toBe(
      "/simple-budget-app/pr-42/",
    );
    expect(normalizeSwBaseUrl("/simple-budget-app/pr-42/")).toBe(
      "/simple-budget-app/pr-42/",
    );
  });
});

describe("Trusted Types sw-register policy", () => {
  it("creates a createScriptURL-only policy named 'sw-register' and rejects disallowed URLs with TypeError", () => {
    const { trustedTypes, createPolicySpy } = createFakeTrustedTypes();
    const expectedUrl = "/simple-budget-app/sw.js";

    const policy = createSwRegisterPolicy(trustedTypes, expectedUrl);

    expect(createPolicySpy).toHaveBeenCalledTimes(1);
    const [policyName, rules] = createPolicySpy.mock.calls[0] ?? [];
    expect(policyName).toBe(SW_TRUSTED_TYPES_POLICY_NAME);
    expect(Object.keys(rules ?? {})).toEqual(["createScriptURL"]);

    expect(policy.createScriptURL(expectedUrl)).toEqual({
      __trustedScriptURL: expectedUrl,
    });
    expect(() => policy.createScriptURL("/simple-budget-app/evil.js")).toThrow(
      new TypeError("Disallowed SW URL"),
    );
    expect(() => policy.createScriptURL("https://example.com/sw.js")).toThrow(
      new TypeError("Disallowed SW URL"),
    );
  });

  it("caches the sw-register policy per trustedTypes instance for the same expectedSwUrl", () => {
    const { trustedTypes, createPolicySpy } = createFakeTrustedTypes();
    const expectedUrl = "/simple-budget-app/sw.js";

    const first = createSwRegisterPolicy(trustedTypes, expectedUrl);
    const second = createSwRegisterPolicy(trustedTypes, expectedUrl);

    expect(first).toBe(second);
    expect(createPolicySpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the plain string when window.trustedTypes is absent and still rejects mismatched URLs", () => {
    const expectedUrl = "/simple-budget-app/sw.js";
    const winWithoutTt: SwWindow = {};

    expect(createSwScriptUrl(expectedUrl, expectedUrl, winWithoutTt)).toBe(
      expectedUrl,
    );
    expect(() =>
      createSwScriptUrl("/other/sw.js", expectedUrl, winWithoutTt),
    ).toThrow(new TypeError("Disallowed SW URL"));
  });
});

describe("registerServiceWorker", () => {
  it("registers <baseUrl>sw.js with TrustedScriptURL and { scope, updateViaCache: 'none' }", async () => {
    const { trustedTypes, createPolicySpy } = createFakeTrustedTypes();
    const swContainer = createFakeSwContainer();
    const reload = vi.fn<() => void>();
    const win: SwWindow = { trustedTypes, location: { reload } };
    const nav: SwNavigator = { serviceWorker: swContainer };

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/pr-99/",
      win,
      nav,
    });

    expect(handle.supported).toBe(true);
    const reg = await handle.ready;
    expect(reg).not.toBeNull();
    expect(createPolicySpy).toHaveBeenCalledTimes(1);
    expect(swContainer.register).toHaveBeenCalledWith(
      { __trustedScriptURL: "/simple-budget-app/pr-99/sw.js" },
      { scope: "/simple-budget-app/pr-99/", updateViaCache: "none" },
    );

    handle.dispose();
  });

  it("falls back to plain string registration when window.trustedTypes is absent", async () => {
    const swContainer = createFakeSwContainer();
    const win: SwWindow = { location: { reload: vi.fn() } };
    const nav: SwNavigator = { serviceWorker: swContainer };

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/",
      win,
      nav,
    });

    expect(handle.supported).toBe(true);
    await handle.ready;
    expect(swContainer.register).toHaveBeenCalledWith(
      "/simple-budget-app/sw.js",
      { scope: "/simple-budget-app/", updateViaCache: "none" },
    );

    handle.dispose();
  });

  it("skips registration completely when window.Capacitor is present", async () => {
    const swContainer = createFakeSwContainer();
    const win: SwWindow = {
      Capacitor: { isNativePlatform: () => true },
      location: { reload: vi.fn() },
    };
    const nav: SwNavigator = { serviceWorker: swContainer };

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/",
      win,
      nav,
    });

    expect(handle.supported).toBe(false);
    expect(await handle.ready).toBeNull();
    expect(swContainer.register).not.toHaveBeenCalled();
  });

  it("skips registration completely when isNative is true", async () => {
    const swContainer = createFakeSwContainer();
    const win: SwWindow = { location: { reload: vi.fn() } };
    const nav: SwNavigator = { serviceWorker: swContainer };

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/",
      isNative: true,
      win,
      nav,
    });

    expect(handle.supported).toBe(false);
    expect(await handle.ready).toBeNull();
    expect(swContainer.register).not.toHaveBeenCalled();
  });

  it("returns a clean no-op handle when navigator.serviceWorker is absent", async () => {
    const win: SwWindow = { location: { reload: vi.fn() } };
    const nav: SwNavigator = {};

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/",
      win,
      nav,
    });

    expect(handle.supported).toBe(false);
    expect(await handle.ready).toBeNull();
    expect(() => handle.dispose()).not.toThrow();
  });

  it("detects an already-waiting SW when controlled, posts SKIP_WAITING only on user accept, and reloads once on controllerchange", async () => {
    const waitingWorker = createFakeWorker("installed");
    const reg = createFakeRegistration({ waiting: waitingWorker });
    const swContainer = createFakeSwContainer({
      controller: { state: "activated" },
      registration: reg,
    });
    const reload = vi.fn<() => void>();
    const onUpdateAvailable = vi.fn<(applyUpdate: () => void) => void>();

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/",
      win: { location: { reload } },
      nav: { serviceWorker: swContainer },
      onUpdateAvailable,
    });

    await handle.ready;

    // Update detected, but SKIP_WAITING must NOT be posted automatically.
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    expect(waitingWorker.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    // User clicks "Update now" -> posts SKIP_WAITING.
    const applyUpdate = onUpdateAvailable.mock.calls[0]?.[0];
    expect(applyUpdate).toBeTypeOf("function");
    applyUpdate?.();
    // Duplicate invocations are ignored.
    applyUpdate?.();

    expect(waitingWorker.postMessage).toHaveBeenCalledTimes(1);
    expect(waitingWorker.postMessage).toHaveBeenCalledWith(
      SW_SKIP_WAITING_MESSAGE,
    );
    expect(reload).not.toHaveBeenCalled();

    // controllerchange reloads exactly once even if fired multiple times.
    swContainer.emitControllerChange();
    swContainer.emitControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);

    handle.dispose();
  });

  it("detects updatefound -> installing -> installed only when a controller is active (never on first install)", async () => {
    const reg = createFakeRegistration();
    const swContainer = createFakeSwContainer({
      controller: null,
      registration: reg,
    });
    const reload = vi.fn<() => void>();
    const onUpdateAvailable = vi.fn<(applyUpdate: () => void) => void>();

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/",
      win: { location: { reload } },
      nav: { serviceWorker: swContainer },
      onUpdateAvailable,
    });

    await handle.ready;

    // First-time install (no active controller): must NOT show update banner or reload.
    const firstWorker = createFakeWorker("installing");
    reg.installing = firstWorker;
    reg.emitUpdateFound();
    firstWorker.setState("installed");
    swContainer.emitControllerChange();

    expect(onUpdateAvailable).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    // Now the page is controlled; a subsequent update triggers onUpdateAvailable.
    swContainer.controller = firstWorker;
    const nextWorker = createFakeWorker("installing");
    reg.installing = nextWorker;
    reg.emitUpdateFound();
    expect(onUpdateAvailable).not.toHaveBeenCalled();

    nextWorker.setState("installed");
    reg.waiting = nextWorker;
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    expect(nextWorker.postMessage).not.toHaveBeenCalled();

    const applyUpdate = onUpdateAvailable.mock.calls[0]?.[0];
    applyUpdate?.();
    expect(nextWorker.postMessage).toHaveBeenCalledWith(
      SW_SKIP_WAITING_MESSAGE,
    );

    swContainer.emitControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);

    handle.dispose();
  });

  it("handles registration rejections cleanly without unhandled rejections", async () => {
    const swContainer = createFakeSwContainer({
      registerImpl: () => Promise.reject(new Error("SecurityError")),
    });

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/",
      win: { location: { reload: vi.fn() } },
      nav: { serviceWorker: swContainer },
    });

    expect(await handle.ready).toBeNull();
    expect(() => handle.dispose()).not.toThrow();
  });

  it("removes updatefound, statechange, and controllerchange listeners on dispose()", async () => {
    const installingWorker = createFakeWorker("installing");
    const reg = createFakeRegistration({ installing: installingWorker });
    const swContainer = createFakeSwContainer({
      controller: { state: "activated" },
      registration: reg,
    });
    const reload = vi.fn<() => void>();
    const onUpdateAvailable = vi.fn<(applyUpdate: () => void) => void>();

    const handle = registerServiceWorker({
      baseUrl: "/simple-budget-app/",
      win: { location: { reload } },
      nav: { serviceWorker: swContainer },
      onUpdateAvailable,
    });

    await handle.ready;
    expect(reg.listenerCount("updatefound")).toBe(1);
    expect(installingWorker.listenerCount("statechange")).toBe(1);

    installingWorker.setState("installed");
    const applyUpdate = onUpdateAvailable.mock.calls[0]?.[0];
    applyUpdate?.();
    expect(swContainer.listenerCount("controllerchange")).toBe(1);

    handle.dispose();

    expect(reg.listenerCount("updatefound")).toBe(0);
    expect(installingWorker.listenerCount("statechange")).toBe(0);
    expect(swContainer.listenerCount("controllerchange")).toBe(0);

    swContainer.emitControllerChange();
    expect(reload).not.toHaveBeenCalled();
  });
});
