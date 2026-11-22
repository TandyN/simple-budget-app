import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type BroadcastChannelLike,
  type BudgetMutatedMessage,
  createSyncChannel,
  deriveSyncChannelName,
} from "./sync";

interface FakeBroadcastChannelInstance extends BroadcastChannelLike {
  readonly name: string;
  closed: boolean;
  readonly listeners: Set<(event: MessageEvent<unknown>) => void>;
  readonly closeSpy: ReturnType<typeof vi.fn>;
  dispatchRaw(data: unknown): void;
}

/**
 * In-memory fake `BroadcastChannel` bus mirroring browser semantics:
 * `postMessage` delivers to all *other* open instances with the same `name`.
 */
function createFakeBroadcastBus(): {
  readonly Ctor: new (name: string) => FakeBroadcastChannelInstance;
  readonly instances: FakeBroadcastChannelInstance[];
} {
  const instances: FakeBroadcastChannelInstance[] = [];

  class FakeBroadcastChannel implements FakeBroadcastChannelInstance {
    readonly name: string;
    closed = false;
    readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
    readonly closeSpy = vi.fn();

    constructor(name: string) {
      this.name = name;
      instances.push(this);
    }

    postMessage(message: unknown): void {
      if (this.closed) {
        throw new DOMException("Channel is closed", "InvalidStateError");
      }
      for (const peer of instances) {
        if (peer === this || peer.closed || peer.name !== this.name) {
          continue;
        }
        peer.dispatchRaw(message);
      }
    }

    dispatchRaw(data: unknown): void {
      const event = { data } as MessageEvent<unknown>;
      for (const listener of [...this.listeners]) {
        listener(event);
      }
    }

    addEventListener(
      _type: "message",
      listener: (event: MessageEvent<unknown>) => void,
    ): void {
      this.listeners.add(listener);
    }

    removeEventListener(
      _type: "message",
      listener: (event: MessageEvent<unknown>) => void,
    ): void {
      this.listeners.delete(listener);
    }

    close(): void {
      this.closed = true;
      this.closeSpy();
    }
  }

  return { Ctor: FakeBroadcastChannel, instances };
}

describe("deriveSyncChannelName", () => {
  it("returns production channel name for /simple-budget-app/ and root paths", () => {
    expect(deriveSyncChannelName("/simple-budget-app/")).toBe(
      "simple-budget-sync",
    );
    expect(deriveSyncChannelName("/")).toBe("simple-budget-sync");
    expect(deriveSyncChannelName("")).toBe("simple-budget-sync");
  });

  it("returns PR-scoped channel name for /simple-budget-app/pr-<N>/ previews", () => {
    expect(deriveSyncChannelName("/simple-budget-app/pr-42/")).toBe(
      "simple-budget-sync-pr-42",
    );
    expect(deriveSyncChannelName("/simple-budget-app/pr-317")).toBe(
      "simple-budget-sync-pr-317",
    );
    expect(deriveSyncChannelName("/pr-7/")).toBe("simple-budget-sync-pr-7");
  });

  it("falls back to production channel name for non-numeric pr segments", () => {
    expect(deriveSyncChannelName("/simple-budget-app/pr-abc/")).toBe(
      "simple-budget-sync",
    );
    expect(deriveSyncChannelName("/simple-budget-app/preview/")).toBe(
      "simple-budget-sync",
    );
  });
});

describe("createSyncChannel", () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  afterEach(() => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      value: originalBroadcastChannel,
      configurable: true,
      writable: true,
    });
  });

  it("posts and receives budget-mutated messages between peers on the same base path", () => {
    const bus = createFakeBroadcastBus();
    const tabA = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: bus.Ctor,
      now: () => 1_700_000_000_000,
    });
    const tabB = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: bus.Ctor,
    });

    expect(tabA.channelName).toBe("simple-budget-sync");
    expect(tabA.supported).toBe(true);
    expect(tabB.channelName).toBe("simple-budget-sync");
    expect(tabB.supported).toBe(true);

    const receivedA: BudgetMutatedMessage[] = [];
    const receivedB: BudgetMutatedMessage[] = [];
    tabA.subscribe((msg) => receivedA.push(msg));
    tabB.subscribe((msg) => receivedB.push(msg));

    tabA.notifyMutated();

    expect(receivedA).toHaveLength(0);
    expect(receivedB).toEqual([
      { type: "budget-mutated", timestamp: 1_700_000_000_000 },
    ]);

    tabA.close();
    tabB.close();
  });

  it("isolates PR preview channels from production channels", () => {
    const bus = createFakeBroadcastBus();
    const prodTab = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: bus.Ctor,
    });
    const prTab = createSyncChannel({
      basePath: "/simple-budget-app/pr-99/",
      broadcastChannelCtor: bus.Ctor,
    });

    expect(prodTab.channelName).toBe("simple-budget-sync");
    expect(prTab.channelName).toBe("simple-budget-sync-pr-99");

    const prodReceived = vi.fn();
    const prReceived = vi.fn();
    prodTab.subscribe(prodReceived);
    prTab.subscribe(prReceived);

    prTab.notifyMutated();
    prodTab.notifyMutated();

    expect(prodReceived).not.toHaveBeenCalled();
    expect(prReceived).not.toHaveBeenCalled();

    prodTab.close();
    prTab.close();
  });

  it("ignores malformed and unknown incoming messages", () => {
    const bus = createFakeBroadcastBus();
    const tab = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: bus.Ctor,
    });

    const received = vi.fn();
    tab.subscribe(received);

    const rawChannel = bus.instances[0];
    expect(rawChannel).toBeDefined();

    rawChannel?.dispatchRaw(null);
    rawChannel?.dispatchRaw(undefined);
    rawChannel?.dispatchRaw("budget-mutated");
    rawChannel?.dispatchRaw(42);
    rawChannel?.dispatchRaw({});
    rawChannel?.dispatchRaw({ type: "other-event", timestamp: Date.now() });
    rawChannel?.dispatchRaw({ type: "budget-mutated" });
    rawChannel?.dispatchRaw({ type: "budget-mutated", timestamp: "not-a-num" });
    rawChannel?.dispatchRaw({ type: "budget-mutated", timestamp: Number.NaN });
    rawChannel?.dispatchRaw({
      type: "budget-mutated",
      timestamp: Number.POSITIVE_INFINITY,
    });

    expect(received).not.toHaveBeenCalled();

    rawChannel?.dispatchRaw({ type: "budget-mutated", timestamp: 12345 });
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({
      type: "budget-mutated",
      timestamp: 12345,
    });

    tab.close();
  });

  it("supports unsubscribing individual listeners and isolates subscriber errors", () => {
    const bus = createFakeBroadcastBus();
    const sender = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: bus.Ctor,
      now: () => 500,
    });
    const receiver = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: bus.Ctor,
    });

    const throwingListener = vi.fn(() => {
      throw new Error("subscriber failure");
    });
    const healthyListener = vi.fn();

    const unsubThrow = receiver.subscribe(throwingListener);
    const unsubHealthy = receiver.subscribe(healthyListener);

    sender.notifyMutated();
    expect(throwingListener).toHaveBeenCalledTimes(1);
    expect(healthyListener).toHaveBeenCalledTimes(1);

    unsubThrow();
    sender.notifyMutated();
    expect(throwingListener).toHaveBeenCalledTimes(1);
    expect(healthyListener).toHaveBeenCalledTimes(2);

    unsubHealthy();
    sender.notifyMutated();
    expect(healthyListener).toHaveBeenCalledTimes(2);

    sender.close();
    receiver.close();
  });

  it("degrades gracefully to a no-op handle when BroadcastChannel is unavailable or throws", () => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const absentHandle = createSyncChannel({
      basePath: "/simple-budget-app/pr-12/",
    });
    expect(absentHandle.channelName).toBe("simple-budget-sync-pr-12");
    expect(absentHandle.supported).toBe(false);
    const unsub = absentHandle.subscribe(vi.fn());
    expect(() => absentHandle.notifyMutated()).not.toThrow();
    expect(() => unsub()).not.toThrow();
    expect(() => absentHandle.close()).not.toThrow();

    class ThrowingBroadcastChannel implements BroadcastChannelLike {
      constructor(_name: string) {
        throw new Error("BroadcastChannel blocked");
      }
      postMessage(): void {}
      addEventListener(): void {}
      removeEventListener(): void {}
      close(): void {}
    }
    const fallbackHandle = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: ThrowingBroadcastChannel,
    });
    expect(fallbackHandle.supported).toBe(false);
    expect(() => fallbackHandle.notifyMutated()).not.toThrow();
    expect(() => fallbackHandle.close()).not.toThrow();
  });

  it("removes listeners, closes the underlying channel idempotently, and stops notifying after close()", () => {
    const bus = createFakeBroadcastBus();
    const tabA = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: bus.Ctor,
    });
    const tabB = createSyncChannel({
      basePath: "/simple-budget-app/",
      broadcastChannelCtor: bus.Ctor,
    });

    const receivedA = vi.fn();
    const receivedB = vi.fn();
    tabA.subscribe(receivedA);
    tabB.subscribe(receivedB);

    const rawA = bus.instances[0];
    expect(rawA?.listeners.size).toBe(1);

    tabA.close();
    tabA.close(); // idempotent

    expect(rawA?.closeSpy).toHaveBeenCalledTimes(1);
    expect(rawA?.listeners.size).toBe(0);

    // Post-close notifyMutated and peer messages are no-ops.
    expect(() => tabA.notifyMutated()).not.toThrow();
    expect(receivedB).not.toHaveBeenCalled();

    tabB.notifyMutated();
    expect(receivedA).not.toHaveBeenCalled();

    // Subscribing after close is a safe no-op.
    const lateUnsub = tabA.subscribe(vi.fn());
    expect(() => lateUnsub()).not.toThrow();

    tabB.close();
  });
});
