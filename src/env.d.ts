/**
 * Structural (untyped) shape of the `BackupService` Capacitor plugin that the
 * `native/` workspace registers on `window.Capacitor.Plugins` before the web
 * bundle loads. Referenced here ONLY as an ambient type — the plugin itself
 * is defined in the `native/` workspace (the only place native shell deps
 * are permitted) and is reached at runtime purely via the `window.Capacitor`
 * global, never imported (see `project-plan/portability.md` and Gate 1 of
 * `scripts/verify-build-gates.mjs`).
 */
interface BackupServicePlugin {
  saveBackup(filename: string, json: string): Promise<void>;
  shareBackup(filename: string, json: string): Promise<void>;
}

/** Structural shape of the `window.Capacitor` global injected by the native shell. */
interface CapacitorGlobal {
  readonly isNativePlatform?: () => boolean;
  readonly Plugins?: {
    readonly BackupService?: BackupServicePlugin;
  };
}

interface Window {
  /** Present only inside a Capacitor shell (iOS / Android); absent in the PWA. */
  readonly Capacitor?: CapacitorGlobal;
  /** File System Access API (Chromium); absent elsewhere. */
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: unknown[];
  }) => Promise<{
    createWritable(): Promise<{
      write(data: string): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
  readonly trustedTypes?: {
    createPolicy(
      name: string,
      rules: {
        createScriptURL?: (input: string) => string;
      },
    ): {
      createScriptURL(input: string): unknown;
    };
  };
}
