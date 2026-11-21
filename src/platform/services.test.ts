// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./services";

/**
 * Tests for the `PlatformServices` runtime seam (`src/platform/services.ts`).
 *
 * These tests run in the `happy-dom` environment (a devDependency, dev/test
 * time only — `project-plan/dependency-strategy.md`: dev deps are build/test
 * time only; `dependencies` stays `{}`). They feature-detect the native vs.
 * web code path and assert the *right boundary* is taken:
 *
 * - **Native path** (`window.Capacitor.isNativePlatform() === true`):
 *   `saveBackup` / `shareBackup` delegate to the `BackupService` plugin on
 *   `window.Capacitor.Plugins`.
 * - **Web path** (`window.Capacitor` absent, or `isNativePlatform() ===
 *   false`): `isNative` is `false`, `saveBackup` does **not** touch the
 *   Capacitor plugin, and `shareBackup` falls back to `saveBackup` when
 *   `navigator.share` is absent.
 *
 * Per the task brief, the tests deliberately do **not** mock real Blob
 * downloads or `<a>` clicks; they assert the delegation/fallback code path.
 *
 * `project-plan/portability.md → Package boundary & PlatformServices seam`:
 * zero Capacitor imports — the native plugin is reached only via the
 * `window.Capacitor` global (structural shape declared in `src/env.d.ts`).
 */

/** A mock `BackupService` plugin standing in for the `native/` workspace plugin. */
function makeMockPlugin() {
  return {
    saveBackup: vi.fn(async (_filename: string, _json: string) => undefined),
    shareBackup: vi.fn(async (_filename: string, _json: string) => undefined),
  };
}

/** A mock `window.Capacitor` global (native shell). */
function makeNativeCapacitor() {
  const Plugins = { BackupService: makeMockPlugin() };
  const isNativePlatform = vi.fn().mockReturnValue(true);
  return { isNativePlatform, Plugins };
}

describe("createPlatformServices — native (window.Capacitor present)", () => {
  let cap: ReturnType<typeof makeNativeCapacitor>;
  let win: Window;

  const setup = () => {
    cap = makeNativeCapacitor();
    // Only `Capacitor` is read off the window on the native path.
    win = { Capacitor: cap } as unknown as Window;
    return createPlatformServices(win);
  };

  it("reports isNative === true when isNativePlatform() returns true", () => {
    expect(setup().isNative).toBe(true);
  });

  it("delegates saveBackup to the BackupService plugin with the right args", async () => {
    const services = setup();
    await services.saveBackup("backup.json", '{"x":1}');
    expect(cap.Plugins.BackupService.saveBackup).toHaveBeenCalledTimes(1);
    expect(cap.Plugins.BackupService.saveBackup).toHaveBeenCalledWith(
      "backup.json",
      '{"x":1}',
    );
  });

  it("delegates shareBackup to the BackupService plugin with the right args", async () => {
    const services = setup();
    await services.shareBackup("share.json", '{"x":2}');
    expect(cap.Plugins.BackupService.shareBackup).toHaveBeenCalledTimes(1);
    expect(cap.Plugins.BackupService.shareBackup).toHaveBeenCalledWith(
      "share.json",
      '{"x":2}',
    );
  });
});

describe("createPlatformServices — web (window.Capacitor absent or non-native)", () => {
  it("reports isNative === false when window.Capacitor is absent", () => {
    // happy-dom's global window has no `Capacitor` global.
    expect(typeof window.Capacitor).toBe("undefined");
    const services = createPlatformServices();
    expect(services.isNative).toBe(false);
  });

  it("saveBackup does NOT delegate to the Capacitor plugin on the web path", async () => {
    // A Capacitor global IS present but reports a webview (not native) —
    // the web save path must not reach the plugin.
    const cap = makeNativeCapacitor();
    cap.isNativePlatform.mockReturnValue(false);
    const win = { Capacitor: cap } as unknown as Window;

    const services = createPlatformServices(win);
    expect(services.isNative).toBe(false);

    // The web save path (File System Access API, else `<a download>`)
    // resolves without throwing and without touching the native plugin.
    await expect(
      services.saveBackup("backup.json", '{"x":1}'),
    ).resolves.toBeUndefined();

    expect(cap.Plugins.BackupService.saveBackup).not.toHaveBeenCalled();
    expect(cap.Plugins.BackupService.shareBackup).not.toHaveBeenCalled();
  });

  it("shareBackup falls back to saveBackup when navigator.share is absent", async () => {
    const services = createPlatformServices();
    expect(services.isNative).toBe(false);

    // happy-dom does not implement navigator.share — force the fallback branch.
    const nav = navigator as unknown as { share?: unknown };
    const realShare = nav.share;
    nav.share = undefined;
    try {
      const saveSpy = vi
        .spyOn(services, "saveBackup")
        .mockResolvedValue(undefined);
      await services.shareBackup("share.json", '{"x":3}');
      // Fallback routed through saveBackup.
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith("share.json", '{"x":3}');
    } finally {
      nav.share = realShare;
    }
  });
});
