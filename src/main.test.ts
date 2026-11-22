// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBudgetApi } from "./budgetApi";
import {
  assertNotFramed,
  type BootstrapAppHandle,
  type BootstrapDocument,
  type BootstrapWindow,
  bootstrapApp,
  type FrameGuardDocument,
  type FrameGuardWindow,
  type PersistableStorageAdapter,
} from "./main";
import type { PlatformServices } from "./platform/services";
import type { BudgetMutatedMessage, SyncChannel } from "./platform/sync";
import { IndexedDbAdapter } from "./storage/indexeddb";
import { InMemoryAdapter } from "./storage/memory";

class FakeEventBus {
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
}

function createFakeWinDoc(): {
  win: BootstrapWindow & {
    emitFocus(): void;
    reload: ReturnType<typeof vi.fn<() => void>>;
  };
  doc: BootstrapDocument & {
    setVisibilityState(state: DocumentVisibilityState): void;
    emitVisibilityChange(): void;
  };
} {
  const winBus = new FakeEventBus();
  const docBus = new FakeEventBus();
  const reload = vi.fn<() => void>();
  let visibilityState: DocumentVisibilityState = "visible";

  const win = {
    addEventListener(type: "focus", listener: () => void): void {
      winBus.addEventListener(type, listener);
    },
    removeEventListener(type: "focus", listener: () => void): void {
      winBus.removeEventListener(type, listener);
    },
    location: { reload },
    reload,
    emitFocus(): void {
      winBus.emit("focus");
    },
  };

  const doc = {
    get visibilityState(): DocumentVisibilityState {
      return visibilityState;
    },
    addEventListener(type: "visibilitychange", listener: () => void): void {
      docBus.addEventListener(type, listener);
    },
    removeEventListener(type: "visibilitychange", listener: () => void): void {
      docBus.removeEventListener(type, listener);
    },
    setVisibilityState(state: DocumentVisibilityState): void {
      visibilityState = state;
    },
    emitVisibilityChange(): void {
      docBus.emit("visibilitychange");
    },
  };

  return { win, doc };
}

function createFakeSyncChannel(): {
  readonly channel: SyncChannel;
  readonly notifyMutated: ReturnType<typeof vi.fn<() => void>>;
  readonly close: ReturnType<typeof vi.fn<() => void>>;
  emitPeerMutation(timestamp?: number): void;
} {
  const listeners = new Set<(msg: BudgetMutatedMessage) => void>();
  let closed = false;
  const notifyMutated = vi.fn<() => void>();
  const close = vi.fn<() => void>(() => {
    closed = true;
    listeners.clear();
  });

  const channel: SyncChannel = {
    channelName: "simple-budget-sync",
    supported: true,
    notifyMutated,
    subscribe(onMutated: (msg: BudgetMutatedMessage) => void): () => void {
      if (closed) {
        return () => {};
      }
      listeners.add(onMutated);
      return () => {
        listeners.delete(onMutated);
      };
    },
    close,
  };

  return {
    channel,
    notifyMutated,
    close,
    emitPeerMutation(timestamp = Date.now()): void {
      if (closed) {
        return;
      }
      const payload: BudgetMutatedMessage = {
        type: "budget-mutated",
        timestamp,
      };
      for (const listener of [...listeners]) {
        listener(payload);
      }
    },
  };
}

function createFakePlatform(): PlatformServices & {
  readonly saveBackup: ReturnType<
    typeof vi.fn<(filename: string, json: string) => Promise<void>>
  >;
  readonly shareBackup: ReturnType<
    typeof vi.fn<(filename: string, json: string) => Promise<void>>
  >;
} {
  const saveBackup = vi
    .fn<(filename: string, json: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const shareBackup = vi
    .fn<(filename: string, json: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  return {
    isNative: false,
    saveBackup,
    shareBackup,
  };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function submitForm(form: HTMLFormElement): void {
  form.dispatchEvent(
    new SubmitEvent("submit", { bubbles: true, cancelable: true }),
  );
}

describe("assertNotFramed", () => {
  it("does not clear DOM or throw in a top-level browsing context", () => {
    const replaceChildren = vi.fn();
    const selfRef = {};
    const win: FrameGuardWindow = { top: selfRef, self: selfRef };
    const doc: FrameGuardDocument = {
      documentElement: { replaceChildren },
    };

    expect(() => assertNotFramed(win, doc)).not.toThrow();
    expect(replaceChildren).not.toHaveBeenCalled();
  });

  it("clears the document and throws when loaded inside a frame", () => {
    const replaceChildren = vi.fn();
    const win: FrameGuardWindow = { top: {}, self: {} };
    const doc: FrameGuardDocument = {
      documentElement: { replaceChildren },
    };

    expect(() => assertNotFramed(win, doc)).toThrow("Framing is not permitted");
    expect(replaceChildren).toHaveBeenCalledTimes(1);
  });

  it("clears the document and throws when top is null", () => {
    const replaceChildren = vi.fn();
    const win: FrameGuardWindow = { top: null, self: {} };
    const doc: FrameGuardDocument = {
      documentElement: { replaceChildren },
    };

    expect(() => assertNotFramed(win, doc)).toThrow("Framing is not permitted");
    expect(replaceChildren).toHaveBeenCalledTimes(1);
  });

  it("clears the document and fails closed when reading top throws SecurityError", () => {
    const replaceChildren = vi.fn();
    const win: FrameGuardWindow = {
      get top(): unknown {
        throw new DOMException(
          "Blocked a frame with origin from accessing a cross-origin frame.",
          "SecurityError",
        );
      },
      self: {},
    };
    const doc: FrameGuardDocument = {
      documentElement: { replaceChildren },
    };

    expect(() => assertNotFramed(win, doc)).toThrow("Framing is not permitted");
    expect(replaceChildren).toHaveBeenCalledTimes(1);
  });
});

describe("bootstrapApp", () => {
  let root: HTMLElement | null = null;
  let handle: BootstrapAppHandle | null = null;

  afterEach(() => {
    handle?.dispose();
    handle = null;
    root?.remove();
    root = null;
  });

  function createRoot(): HTMLElement {
    root = document.createElement("div");
    document.body.appendChild(root);
    return root;
  }

  it("runs init -> runRecurringEngine -> mounts Budget tab, and does not request persistence on cold startup", async () => {
    const container = createRoot();
    const memory = new InMemoryAdapter();
    await memory.open();
    await memory.save("rules", {
      id: "rule-salary",
      name: "Monthly Salary",
      type: "income",
      amountCents: 250000,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
      lastPostPeriod: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    const requestPersistenceAfterFirstAction = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(true);
    const adapter: PersistableStorageAdapter = Object.assign(memory, {
      requestPersistenceAfterFirstAction,
    });

    const { win, doc } = createFakeWinDoc();
    let idSeq = 0;
    handle = await bootstrapApp({
      container,
      adapter,
      idFactory: () => `id-${++idSeq}`,
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      win,
      doc,
    });

    expect(handle.budgetTab).not.toBeNull();
    expect(handle.insightsTab).not.toBeNull();
    expect(handle.settingsTab).not.toBeNull();
    expect(requestPersistenceAfterFirstAction).not.toHaveBeenCalled();

    const funds = container.querySelector("#budget-available-funds");
    expect(funds?.textContent).toBe("$2,500.00");

    const feedItems = container.querySelectorAll(".budget-feed-item");
    expect(feedItems).toHaveLength(1);
    expect(container.querySelector(".budget-quick-add")).not.toBeNull();
    expect(
      container.querySelector('[data-slot="recurring-rules"]'),
    ).not.toBeNull();

    // Insights and Settings tabs are mounted and populated on startup.
    expect(container.querySelector("#insights-summary-in")?.textContent).toBe(
      "$2,500.00",
    );
    expect(
      container.querySelectorAll("#insights-activity-list > li"),
    ).toHaveLength(1);
    expect(
      container.querySelector("#settings-durability-status")?.textContent,
    ).toBe("Best-effort browser storage");
    expect(container.querySelector("#settings-last-backup")?.textContent).toBe(
      "Never backed up",
    );
    expect(
      container.querySelector("#settings-backup-nag")?.hasAttribute("hidden"),
    ).toBe(false);
  });

  it("calls requestPersistenceAfterFirstAction once after the first user write and swallows rejections", async () => {
    const container = createRoot();
    const memory = new InMemoryAdapter();
    const requestPersistenceAfterFirstAction = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValue(new Error("Permission denied"));
    const adapter: PersistableStorageAdapter = Object.assign(memory, {
      requestPersistenceAfterFirstAction,
    });

    const { win, doc } = createFakeWinDoc();
    let idSeq = 0;
    handle = await bootstrapApp({
      container,
      adapter,
      idFactory: () => `id-${++idSeq}`,
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      win,
      doc,
    });

    expect(requestPersistenceAfterFirstAction).not.toHaveBeenCalled();

    const quickForm = container.querySelector(
      ".budget-quick-add form",
    ) as HTMLFormElement;
    const typeSelect = container.querySelector(
      "#quick-add-type",
    ) as HTMLSelectElement;
    const amountInput = container.querySelector(
      "#quick-add-amount",
    ) as HTMLInputElement;

    // First user write triggers persistence once.
    typeSelect.value = "deposit";
    amountInput.value = "100.00";
    submitForm(quickForm);
    await flushAsync();

    expect(requestPersistenceAfterFirstAction).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("$100.00");

    // Second user write does not re-invoke persistence.
    typeSelect.value = "expense";
    amountInput.value = "25.00";
    submitForm(quickForm);
    await flushAsync();

    expect(requestPersistenceAfterFirstAction).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("$75.00");
  });

  it("re-runs recurring engine on focus and visible visibilitychange, serializes concurrent events, and cleans up on dispose", async () => {
    const container = createRoot();
    const memory = new InMemoryAdapter();
    await memory.open();
    await memory.save("rules", {
      id: "rule-rent",
      name: "Monthly Rent",
      type: "expense",
      amountCents: 100000,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
      lastPostPeriod: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    let currentNow = new Date("2026-06-15T12:00:00.000Z");
    let idSeq = 0;
    const realBudget = createBudgetApi({
      adapter: memory,
      idFactory: () => `id-${++idSeq}`,
      now: () => currentNow,
    });

    let activeEngineCalls = 0;
    let maxConcurrentEngineCalls = 0;
    const originalRun = realBudget.runRecurringEngine.bind(realBudget);
    const runSpy = vi.spyOn(realBudget, "runRecurringEngine");
    runSpy.mockImplementation(async (nowArg?: Date) => {
      activeEngineCalls += 1;
      maxConcurrentEngineCalls = Math.max(
        maxConcurrentEngineCalls,
        activeEngineCalls,
      );
      try {
        await Promise.resolve();
        return await originalRun(nowArg);
      } finally {
        activeEngineCalls -= 1;
      }
    });

    const { win, doc } = createFakeWinDoc();
    handle = await bootstrapApp({
      container,
      adapter: memory,
      budget: realBudget,
      now: () => currentNow,
      win,
      doc,
    });

    // Startup posted June (-$1,000.00).
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("-$1,000.00");

    // Advance into July and fire focus + visibilitychange back-to-back.
    currentNow = new Date("2026-07-02T12:00:00.000Z");
    doc.setVisibilityState("visible");
    win.emitFocus();
    doc.emitVisibilityChange();
    await flushAsync();
    await flushAsync();

    // Must never overlap concurrently, and July should be posted exactly once.
    expect(maxConcurrentEngineCalls).toBe(1);
    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("-$2,000.00");
    expect(container.querySelectorAll(".budget-feed-item")).toHaveLength(2);

    // Hidden visibilitychange must NOT trigger a recurring run.
    const callsBeforeHidden = runSpy.mock.calls.length;
    currentNow = new Date("2026-08-02T12:00:00.000Z");
    doc.setVisibilityState("hidden");
    doc.emitVisibilityChange();
    await flushAsync();
    expect(runSpy).toHaveBeenCalledTimes(callsBeforeHidden);

    // Visible visibilitychange posts August and refreshes the DOM.
    doc.setVisibilityState("visible");
    doc.emitVisibilityChange();
    await flushAsync();
    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("-$3,000.00");
    expect(container.querySelectorAll(".budget-feed-item")).toHaveLength(3);

    // After dispose(), further focus / visibilitychange events do nothing.
    const callsBeforeDispose = runSpy.mock.calls.length;
    handle.dispose();
    currentNow = new Date("2026-09-02T12:00:00.000Z");
    win.emitFocus();
    doc.emitVisibilityChange();
    await flushAsync();
    expect(runSpy).toHaveBeenCalledTimes(callsBeforeDispose);
  });

  it("renders a non-destructive role='alert' update-required banner on VersionMismatchError without calling deleteDatabase", async () => {
    const container = createRoot();
    const deleteDatabaseSpy = vi.fn();
    const fakeIdbFactory = {
      open(): IDBOpenDBRequest {
        const req = {
          error: new DOMException(
            "The requested version (1) is less than the existing version (2).",
            "VersionError",
          ),
          onerror: null as ((this: IDBRequest, ev: Event) => unknown) | null,
          onsuccess: null as ((this: IDBRequest, ev: Event) => unknown) | null,
          onupgradeneeded: null as
            | ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown)
            | null,
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => {
          req.onerror?.call(req, new Event("error"));
        });
        return req;
      },
      deleteDatabase: deleteDatabaseSpy,
    } as unknown as IDBFactory;

    const adapter = new IndexedDbAdapter(fakeIdbFactory);
    const { win, doc } = createFakeWinDoc();
    handle = await bootstrapApp({
      container,
      adapter,
      win,
      doc,
    });

    expect(handle.budgetTab).not.toBeTruthy();
    expect(deleteDatabaseSpy).not.toHaveBeenCalled();

    const alert = container.querySelector('#panel-budget [role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("data-error-kind")).toBe("version-mismatch");
    expect(alert?.textContent).toContain("Update required");
    expect(alert?.textContent).toContain("newer schema version");
    expect(alert?.textContent).toContain("has not been deleted");

    const reloadBtn = alert?.querySelector("button") as HTMLButtonElement;
    expect(reloadBtn).not.toBeNull();
    reloadBtn.click();
    expect(win.reload).toHaveBeenCalledTimes(1);
  });

  it("renders a non-destructive role='alert' storage error banner on unexpected init failures", async () => {
    const container = createRoot();
    const memory = new InMemoryAdapter();
    const failingAdapter: PersistableStorageAdapter = {
      open: () => Promise.reject(new Error("Storage unavailable")),
      save: memory.save.bind(memory),
      delete: memory.delete.bind(memory),
      query: memory.query.bind(memory),
      replaceAll: memory.replaceAll.bind(memory),
      getMeta: memory.getMeta.bind(memory),
      setMeta: memory.setMeta.bind(memory),
    };

    const { win, doc } = createFakeWinDoc();
    handle = await bootstrapApp({
      container,
      adapter: failingAdapter,
      win,
      doc,
    });

    expect(handle.budgetTab).toBeNull();
    expect(handle.insightsTab).toBeNull();
    expect(handle.settingsTab).toBeNull();
    const alert = container.querySelector('#panel-budget [role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("data-error-kind")).toBe("storage");
    expect(alert?.textContent).toContain("Storage unavailable");
    expect(alert?.textContent).toContain("has not been deleted");
  });

  it("refreshes sibling tabs and emits budget-mutated on local Budget writes and Settings backup imports", async () => {
    const container = createRoot();
    const memory = new InMemoryAdapter();
    const { win, doc } = createFakeWinDoc();
    const sync = createFakeSyncChannel();
    const platform = createFakePlatform();
    let idSeq = 0;

    handle = await bootstrapApp({
      container,
      adapter: memory,
      platform,
      syncChannel: sync.channel,
      idFactory: () => `id-${++idSeq}`,
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      win,
      doc,
    });

    // Cold startup with empty DB does not broadcast.
    expect(sync.notifyMutated).not.toHaveBeenCalled();
    expect(
      container.querySelector("#settings-backup-nag")?.hasAttribute("hidden"),
    ).toBe(true);

    // 1. Local Quick-Add in Budget tab updates Insights + Settings nag and broadcasts.
    const quickForm = container.querySelector(
      ".budget-quick-add form",
    ) as HTMLFormElement;
    const typeSelect = container.querySelector(
      "#quick-add-type",
    ) as HTMLSelectElement;
    const amountInput = container.querySelector(
      "#quick-add-amount",
    ) as HTMLInputElement;
    const tagsInput = container.querySelector(
      "#quick-add-tags",
    ) as HTMLInputElement;

    typeSelect.value = "deposit";
    amountInput.value = "150.00";
    tagsInput.value = "savings";
    submitForm(quickForm);
    await flushAsync();

    expect(sync.notifyMutated).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#insights-summary-in")?.textContent).toBe(
      "$150.00",
    );
    expect(
      container.querySelectorAll("#insights-activity-list > li"),
    ).toHaveLength(1);
    expect(
      container.querySelector("#settings-backup-nag")?.hasAttribute("hidden"),
    ).toBe(false);

    // 2. Settings JSON import updates Budget + Insights tabs and broadcasts.
    const backupPayload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: "2026-06-15T12:00:00.000Z",
      rules: [],
      activities: [
        {
          id: "imported-1",
          type: "expense",
          amountCents: 4500,
          currency: "USD",
          dateTime: "2026-06-10T10:00:00.000Z",
          source: "manual",
          tags: ["groceries"],
          memo: "Imported market run",
          createdAt: "2026-06-10T10:00:00.000Z",
          updatedAt: "2026-06-10T10:00:00.000Z",
        },
      ],
    });
    const file = new File([backupPayload], "backup.json", {
      type: "application/json",
    });
    const importInput = container.querySelector(
      "#settings-import-file",
    ) as HTMLInputElement;
    Object.defineProperty(importInput, "files", {
      value: [file],
      configurable: true,
    });
    importInput.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();

    // Confirm import in the shell's native <dialog>.
    const confirmBtn = container.querySelector(
      "dialog.confirm-dialog .confirm-dialog-confirm",
    ) as HTMLButtonElement;
    confirmBtn.click();
    await flushAsync();
    await flushAsync();

    expect(platform.saveBackup).toHaveBeenCalledTimes(1);
    expect(sync.notifyMutated).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("-$45.00");
    expect(container.querySelector("#insights-summary-out")?.textContent).toBe(
      "$45.00",
    );
  });

  it("refreshes all 3 tabs on incoming peer budget-mutated messages without re-broadcasting, and closes channel on dispose()", async () => {
    const container = createRoot();
    const memory = new InMemoryAdapter();
    const { win, doc } = createFakeWinDoc();
    const sync = createFakeSyncChannel();
    const platform = createFakePlatform();
    let idSeq = 0;

    handle = await bootstrapApp({
      container,
      adapter: memory,
      platform,
      syncChannel: sync.channel,
      idFactory: () => `id-${++idSeq}`,
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      win,
      doc,
    });

    expect(sync.notifyMutated).not.toHaveBeenCalled();

    // Simulate a peer tab writing directly to the shared storage adapter.
    await memory.save("activities", {
      id: "peer-act-1",
      type: "income",
      amountCents: 32000,
      currency: "USD",
      dateTime: "2026-06-15T11:00:00.000Z",
      source: "manual",
      tags: ["freelance"],
      memo: "Peer tab invoice",
      createdAt: "2026-06-15T11:00:00.000Z",
      updatedAt: "2026-06-15T11:00:00.000Z",
    });

    sync.emitPeerMutation(1_700_000_000_000);
    await flushAsync();

    // All 3 tabs reflect the peer mutation without re-emitting (zero echo loops).
    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("$320.00");
    expect(container.querySelector("#insights-summary-in")?.textContent).toBe(
      "$320.00",
    );
    expect(
      container.querySelector("#settings-backup-nag")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(sync.notifyMutated).not.toHaveBeenCalled();

    // Disposing closes the sync channel and stops responding to peer messages.
    handle.dispose();
    expect(sync.close).toHaveBeenCalledTimes(1);

    await memory.save("activities", {
      id: "peer-act-2",
      type: "expense",
      amountCents: 10000,
      currency: "USD",
      dateTime: "2026-06-15T12:00:00.000Z",
      source: "manual",
      tags: ["food"],
      createdAt: "2026-06-15T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
    sync.emitPeerMutation(1_700_000_000_100);
    await flushAsync();

    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("$320.00");
  });

  it("broadcasts and refreshes all 3 tabs when focus/visibility recurring pass posts new items", async () => {
    const container = createRoot();
    const memory = new InMemoryAdapter();
    await memory.open();
    await memory.save("rules", {
      id: "rule-bonus",
      name: "Monthly Bonus",
      type: "income",
      amountCents: 50000,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
      lastPostPeriod: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    let currentNow = new Date("2026-06-15T12:00:00.000Z");
    let idSeq = 0;
    const { win, doc } = createFakeWinDoc();
    const sync = createFakeSyncChannel();
    const platform = createFakePlatform();

    handle = await bootstrapApp({
      container,
      adapter: memory,
      platform,
      syncChannel: sync.channel,
      idFactory: () => `id-${++idSeq}`,
      now: () => currentNow,
      win,
      doc,
    });

    // Startup posted June -> 1 broadcast.
    expect(sync.notifyMutated).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#insights-summary-in")?.textContent).toBe(
      "$500.00",
    );

    // Advance into July and emit focus -> posts July, broadcasts again, refreshes Insights.
    currentNow = new Date("2026-07-02T12:00:00.000Z");
    win.emitFocus();
    await flushAsync();

    expect(sync.notifyMutated).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector("#budget-available-funds")?.textContent,
    ).toBe("$1,000.00");
    expect(container.querySelector("#insights-summary-in")?.textContent).toBe(
      "$1,000.00",
    );
  });
});
