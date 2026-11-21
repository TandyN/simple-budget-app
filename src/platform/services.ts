/**
 * `PlatformServices` — the runtime platform seam for backup save/share.
 *
 * `project-plan/portability.md → Package boundary & PlatformServices seam`:
 * the **identical** `dist/` bundle is served by the PWA (browser) and by the
 * iOS / Android Capacitor shells (WKWebView / Chromium WebView). The web
 * bundle therefore keeps `dependencies: {}` and contains **zero
 * Capacitor imports** (enforced by Gate 1 of
 * `scripts/verify-build-gates.mjs`); native reach happens *only* through
 * runtime feature detection of the `window.Capacitor` global that the
 * `native/` shell injects before the bundle loads. The native-side plugin
 * (Capacitor plugin name `BackupService`, defined in the `native/` workspace)
 * is reached purely as an untyped runtime object — see
 * `src/env.d.ts` for the structural ambient declarations.
 *
 * - **Web / PWA (`isNative === false`):** `saveBackup` writes the JSON via the
 *   File System Access API (`showSaveFilePicker`) when available, else a
 *   temporary `<a download>` against a `Blob` URL; `shareBackup` uses
 *   `navigator.share` when supported, else falls back to `saveBackup`
 *   (iOS WKWebView does not honour `<a download>`, so the fallback keeps a
 *   working save path everywhere).
 * - **Native shell (`isNative === true`):** both methods delegate to the
 *   `BackupService` plugin registered on `window.Capacitor.Plugins`.
 *
 * Zero production dependencies: built-in Web-platform APIs only (`Blob`,
 * `URL`, `File`, `navigator.share`, File System Access API, `window.Capacitor`).
 *
 * The structural types of the native global (`CapacitorGlobal`,
 * `BackupServicePlugin`) are declared as ambient globals in `src/env.d.ts`.
 */

/**
 * The platform service surface the UI depends on for backup save/share.
 *
 * `project-plan/portability.md` (the canonical interface):
 * ```ts
 * export interface PlatformServices {
 *   readonly isNative: boolean;
 *   saveBackup(filename: string, json: string): Promise<void>;
 *   shareBackup(filename: string, json: string): Promise<void>;
 * }
 * ```
 */
export interface PlatformServices {
  /** `true` when running inside a native Capacitor shell (iOS / Android). */
  readonly isNative: boolean;
  /** Save `json` (a backup payload) to a local file named `filename`. */
  saveBackup(filename: string, json: string): Promise<void>;
  /** Share `json` (a backup payload) via the OS share sheet; falls back to
   *  `saveBackup` on platforms without `navigator.share`. */
  shareBackup(filename: string, json: string): Promise<void>;
}

/**
 * The `BackupService` Capacitor plugin (defined in the `native/` workspace;
 * reached here only through the `window.Capacitor` runtime global — never
 * imported).
 */
interface NativeBackupService {
  readonly Plugins: {
    readonly BackupService: BackupServicePlugin;
  };
}

/**
 * Build the `PlatformServices` implementation for the current runtime by
 * feature-detecting the `window.Capacitor` global.
 *
 * `window.Capacitor?.isNativePlatform?.()` must be `true` to select the
 * native path (guards both the absence of the global and of the method, and
 * a webview context inside a Capacitor shell).
 *
 * @param win the window to feature-detect against (defaults to the global
 *        `window`; injectable for tests)
 * @returns the resolved `PlatformServices` implementation
 */
export function createPlatformServices(win?: Window): PlatformServices {
  const target = win ?? (typeof window !== "undefined" ? window : undefined);
  const cap = target?.Capacitor;
  if (cap?.isNativePlatform?.() === true) {
    const { BackupService } = (cap as NativeBackupService).Plugins;
    const isNative = true;
    return {
      isNative,
      saveBackup: (filename, json) => BackupService.saveBackup(filename, json),
      shareBackup: (filename, json) =>
        BackupService.shareBackup(filename, json),
    };
  }
  const isNative = false;
  // Build a single object so `shareBackup`'s fallback routes through the
  // same object property as the public `saveBackup` — the web share path
  // degrades to the *same* save entry point, and the fallback stays
  // observable/spy-able (the brief's web fallback assertion).
  const services: PlatformServices = {
    isNative,
    saveBackup: (filename, json) =>
      saveViaFilePicker(filename, json) ??
      saveViaAnchorDownload(filename, json),
    shareBackup: (filename, json) =>
      typeof navigator !== "undefined" && typeof navigator.share === "function"
        ? navigator
            .share({
              files: [new File([json], filename, { type: "application/json" })],
            })
            .catch(() => undefined) // user cancelled the share sheet
        : services.saveBackup(filename, json),
  };
  return services;
}

/**
 * Attempt a user-chosen save via the File System Access API
 * (`window.showSaveFilePicker`). Returns `undefined` when the API is
 * unavailable (e.g. Firefox) so the caller can fall back to `<a download>`.
 */
function saveViaFilePicker(
  filename: string,
  json: string,
): Promise<void> | undefined {
  if (
    typeof window === "undefined" ||
    typeof window.showSaveFilePicker !== "function"
  ) {
    return undefined;
  }
  const picker = window.showSaveFilePicker;
  return picker({
    suggestedName: filename,
    types: [{ accept: { "application/json": [".json"] } }],
  }).then(async (handle) => {
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
  });
}

/**
 * Fallback save: wrap `json` in a `Blob`, attach a temporary `<a download>`
 * against a `URL.createObjectURL` blob, and click it. (DOM built strictly via
 * the safe-DOM API set — `createElement`, `setAttribute`, `appendChild`,
 * `click`, `remove` — per `project-plan/frontend.md → DOM XSS Ban`.)
 */
function saveViaAnchorDownload(filename: string, json: string): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", filename);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return Promise.resolve();
}
