/**
 * Settings tab view controller (`src/ui/settingsTab.ts`).
 *
 * Implements the Settings tab surface (`project-plan/frontend.md` →
 * `#export--backup-req-3` & `project-plan/storage.md` →
 * `#storage-durability--webkit-eviction-mitigation`):
 * - **Storage Durability & Backup-Age Nag:**
 *   - Queries live storage persistence via `adapter.getPersisted?.()` or
 *     `navigator.storage?.persisted?.()` (treating absent/failing APIs honestly
 *     as non-persistent) and surfaces clear iOS Safari / browser eviction
 *     guidance.
 *   - Displays `budget.getLastBackupAt()` formatted in the user's local
 *     timezone via `formatLocalDateTime(...)` (or `"Never backed up"`).
 *   - Displays a non-blocking N-day backup reminder banner (default `N = 30`
 *     days, or whenever rules/activities exist with `lastBackupAt === null`)
 *     with a one-tap `"Export Backup Now"` button.
 * - **Hardened JSON Backup Export & Import (`PlatformServices`):**
 *   - Export Backup (`platform.saveBackup`) and Share Backup
 *     (`platform.shareBackup`) calling `budget.exportBackup()`, invoking
 *     `onUserWrite?.()`, and refreshing `lastBackupAt` + nag state.
 *   - Hardened Import flow (`<input type="file" accept="application/json,.json">`
 *     with programmatic `<label for="...">`):
 *     1. Pre-read size guard (`file.size <= MAX_BACKUP_BYTES` / 10 MB) before
 *        reading file contents into memory.
 *     2. Explicit confirmation `<dialog>` via `shell.confirm(...)` warning that
 *        importing replaces all local rules and activities.
 *     3. Automatic pre-import safety snapshot (`budget.exportBackup()` →
 *        `platform.saveBackup(...)`); aborts cleanly if the snapshot fails.
 *     4. Atomic restore (`budget.importBackup(rawJson)`) with accessible
 *        `role="alert"` error reporting that leaves prior data 100% intact on
 *        malformed, schema-invalid, or prototype-polluting payloads.
 * - **Recurring Rule Management:**
 *   - Mounts `mountRecurringRules` inside Settings with an isolated `idPrefix`
 *     (`"settings-recurring"`) so mounting alongside the Budget tab never
 *     produces duplicate DOM IDs, forwarding `budget`, `confirm`, `now`,
 *     `onUserWrite`, and `onChanged`.
 * - **`refreshSeq` stale-render guard** to prevent out-of-order async updates.
 *
 * Built exclusively with `./dom` safe DOM helpers (`el`, `text`, `setAttrs`,
 * `replaceChildren`) so all user-controlled strings render strictly as inert
 * text nodes. Zero production dependencies.
 */

import type { BudgetApi } from "../budgetApi";
import { MAX_BACKUP_BYTES } from "../core/validate";
import type { PlatformServices } from "../platform/services";
import { el, replaceChildren, setAttrs, text } from "./dom";
import { formatLocalDateTime } from "./format";
import {
  mountRecurringRules,
  type RecurringRulesController,
} from "./recurringRules";
import type { ShellHandle } from "./shell";

const MS_PER_DAY = 86_400_000;

/** Default number of days after which the Settings backup-age reminder appears. */
export const DEFAULT_BACKUP_REMINDER_DAYS = 30;

/** Optional durability capability exposed by `IndexedDbAdapter` (or test doubles). */
export interface DurabilityReadableAdapter {
  getPersisted?(): Promise<boolean>;
}

/** Options accepted by `mountSettingsTab`. */
export interface MountSettingsTabOptions {
  /** Target container element (e.g. `#panel-settings`). */
  readonly container: HTMLElement;
  /** Public `BudgetApi` instance. */
  readonly budget: BudgetApi;
  /** Runtime platform seam for backup save/share (`PlatformServices`). */
  readonly platform: PlatformServices;
  /** Shell's promise-based native `<dialog>` confirmation prompt. */
  readonly confirm: ShellHandle["confirm"];
  /** Optional storage adapter exposing `getPersisted?.()` for durability status. */
  readonly adapter?: DurabilityReadableAdapter;
  /** Optional clock factory for deterministic backup-age & filename generation. */
  readonly now?: () => Date;
  /** Backup reminder age threshold in days (defaults to `30`). */
  readonly backupReminderDays?: number;
  /** Optional callback invoked after any successful local write. */
  readonly onUserWrite?: () => void;
  /** Optional callback invoked after data mutations so sibling tabs & BroadcastChannel sync. */
  readonly onDataMutated?: () => Promise<void> | void;
}

/** Controller returned by `mountSettingsTab`. */
export interface SettingsTabController {
  /** Re-queries durability, `lastBackupAt`, backup nag, and recurring rules and updates the DOM. */
  refresh(): Promise<void>;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return "An unexpected error occurred. Please try again.";
}

function formatBackupFilename(date: Date): string {
  const dayStamp = date.toISOString().slice(0, 10);
  return `simple-budget-backup-${dayStamp}.json`;
}

function formatSnapshotFilename(date: Date): string {
  const isoStamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
  return `simple-budget-pre-import-snapshot-${isoStamp}.json`;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Queries live storage persistence via `adapter.getPersisted?.()`, falling back
 * to `navigator.storage?.persisted?.()`. Never throws; absent or rejecting APIs
 * report `false` (honest best-effort status).
 */
async function queryStoragePersisted(
  adapter?: DurabilityReadableAdapter,
): Promise<boolean> {
  try {
    if (typeof adapter?.getPersisted === "function") {
      return (await adapter.getPersisted()) === true;
    }
  } catch {
    return false;
  }

  try {
    const storage = globalThis.navigator?.storage;
    if (storage === undefined || typeof storage.persisted !== "function") {
      return false;
    }
    return (await storage.persisted()) === true;
  } catch {
    return false;
  }
}

/**
 * Mounts the Settings tab UI into `options.container` and returns a
 * `SettingsTabController` whose `refresh()` method re-reads durability status,
 * `lastBackupAt`, backup-age reminder state, and recurring rules.
 */
export function mountSettingsTab(
  options: MountSettingsTabOptions,
): SettingsTabController {
  const {
    container,
    budget,
    platform,
    confirm,
    adapter,
    onUserWrite,
    onDataMutated,
  } = options;
  const clock = options.now ?? (() => new Date());
  const reminderDays =
    options.backupReminderDays !== undefined &&
    Number.isFinite(options.backupReminderDays) &&
    options.backupReminderDays > 0
      ? options.backupReminderDays
      : DEFAULT_BACKUP_REMINDER_DAYS;

  // ---------------------------------------------------------------------------
  // 1. Storage Durability & Backup-Age Nag Section
  // ---------------------------------------------------------------------------
  const durabilityBadgeEl = el(
    "span",
    {
      id: "settings-durability-status",
      class: "settings-badge settings-badge--best-effort",
      "data-persisted": "false",
    },
    [text("Checking storage status…")],
  ) as HTMLElement;

  const durabilityGuidanceEl = el(
    "p",
    {
      id: "settings-durability-guidance",
      class: "settings-guidance",
    },
    [
      text(
        "Your data is stored locally on this device with zero cloud servers.",
      ),
    ],
  ) as HTMLElement;

  const lastBackupValueEl = el(
    "dd",
    {
      id: "settings-last-backup",
      class: "settings-meta-value",
    },
    [text("Never backed up")],
  ) as HTMLElement;

  const nagMessageEl = el("p", {
    id: "settings-backup-nag-message",
    class: "settings-nag-message",
  }) as HTMLElement;

  const nagExportBtn = el(
    "button",
    {
      id: "settings-nag-export-btn",
      type: "button",
      class: "settings-btn settings-btn-primary",
    },
    [text("Export Backup Now")],
  ) as HTMLButtonElement;

  const backupNagEl = el(
    "div",
    {
      id: "settings-backup-nag",
      class: "settings-nag-banner",
      role: "status",
      "aria-live": "polite",
      hidden: "true",
    },
    [nagMessageEl, nagExportBtn],
  ) as HTMLElement;

  const durabilitySection = el(
    "section",
    {
      class: "settings-card settings-durability-section",
      "aria-labelledby": "settings-durability-heading",
    },
    [
      el(
        "h2",
        {
          id: "settings-durability-heading",
          class: "settings-section-title",
        },
        [text("Storage Durability")],
      ),
      el("dl", { class: "settings-meta-list" }, [
        el("div", { class: "settings-meta-row" }, [
          el("dt", { class: "settings-meta-label" }, [text("Storage Status")]),
          el("dd", { class: "settings-meta-value" }, [durabilityBadgeEl]),
        ]),
        el("div", { class: "settings-meta-row" }, [
          el("dt", { class: "settings-meta-label" }, [text("Last Backup")]),
          lastBackupValueEl,
        ]),
      ]),
      durabilityGuidanceEl,
      backupNagEl,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 2. Hardened JSON Backup Export & Import Section
  // ---------------------------------------------------------------------------
  const exportBtn = el(
    "button",
    {
      id: "settings-export-btn",
      type: "button",
      class: "settings-btn settings-btn-primary",
    },
    [text("Export JSON Backup")],
  ) as HTMLButtonElement;

  const shareBtn = el(
    "button",
    {
      id: "settings-share-btn",
      type: "button",
      class: "settings-btn settings-btn-secondary",
    },
    [text("Share Backup")],
  ) as HTMLButtonElement;

  const importLabel = el(
    "label",
    {
      for: "settings-import-file",
      class: "settings-label",
    },
    [text("Import JSON Backup")],
  ) as HTMLLabelElement;

  const importHintEl = el(
    "p",
    {
      id: "settings-import-hint",
      class: "settings-hint",
    },
    [
      text(
        "Replaces all local rules and activities after confirmation. An automatic safety snapshot is saved first (max 10 MB).",
      ),
    ],
  ) as HTMLElement;

  const importInput = el("input", {
    id: "settings-import-file",
    name: "backupFile",
    type: "file",
    accept: "application/json,.json",
    class: "settings-file-input",
    "aria-describedby": "settings-import-hint",
  }) as HTMLInputElement;

  const backupStatusEl = el("div", {
    id: "settings-backup-status",
    class: "settings-status-banner",
    role: "status",
    "aria-live": "polite",
    hidden: "true",
  }) as HTMLElement;

  const backupErrorEl = el("div", {
    id: "settings-backup-error",
    class: "settings-error-banner",
    role: "alert",
    "aria-live": "assertive",
    hidden: "true",
  }) as HTMLElement;

  const backupSection = el(
    "section",
    {
      class: "settings-card settings-backup-section",
      "aria-labelledby": "settings-backup-heading",
    },
    [
      el(
        "h2",
        {
          id: "settings-backup-heading",
          class: "settings-section-title",
        },
        [text("Local JSON Backup")],
      ),
      el("p", { class: "settings-description" }, [
        text(
          "Export your recurring rules and activity log to a local JSON file, or restore from a previous backup. No data leaves your device unless you choose to save or share the file.",
        ),
      ]),
      el("div", { class: "settings-backup-actions" }, [exportBtn, shareBtn]),
      el("div", { class: "settings-import-group" }, [
        importLabel,
        importHintEl,
        importInput,
      ]),
      backupStatusEl,
      backupErrorEl,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 3. Recurring Rule Management Section (`mountRecurringRules`)
  // ---------------------------------------------------------------------------
  const recurringSlot = el("div", {
    class: "settings-recurring-slot",
    "data-slot": "settings-recurring-rules",
  }) as HTMLElement;

  const recurringSection = el(
    "section",
    {
      class: "settings-card settings-recurring-section",
      "aria-labelledby": "settings-recurring-heading",
    },
    [
      el(
        "h2",
        {
          id: "settings-recurring-heading",
          class: "settings-section-title",
        },
        [text("Recurring Rules")],
      ),
      recurringSlot,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 4. Status / Error & In-Flight Helpers
  // ---------------------------------------------------------------------------
  let backupBusy = false;

  function setBackupControlsBusy(busy: boolean): void {
    backupBusy = busy;
    exportBtn.disabled = busy;
    shareBtn.disabled = busy;
    nagExportBtn.disabled = busy;
    importInput.disabled = busy;
  }

  function clearBackupFeedback(): void {
    replaceChildren(backupStatusEl);
    setAttrs(backupStatusEl, { hidden: "true" });
    replaceChildren(backupErrorEl);
    setAttrs(backupErrorEl, { hidden: "true" });
    setAttrs(importInput, {
      "aria-invalid": null,
      "aria-describedby": "settings-import-hint",
    });
  }

  function showBackupStatus(message: string): void {
    replaceChildren(backupErrorEl);
    setAttrs(backupErrorEl, { hidden: "true" });
    setAttrs(importInput, {
      "aria-invalid": null,
      "aria-describedby": "settings-import-hint",
    });
    replaceChildren(backupStatusEl, text(message));
    setAttrs(backupStatusEl, { hidden: null });
  }

  function showBackupError(message: string, markImportInvalid = false): void {
    replaceChildren(backupStatusEl);
    setAttrs(backupStatusEl, { hidden: "true" });
    replaceChildren(backupErrorEl, text(message));
    setAttrs(backupErrorEl, { hidden: null });
    if (markImportInvalid) {
      setAttrs(importInput, {
        "aria-invalid": "true",
        "aria-describedby": "settings-backup-error",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Refresh Pipeline with Stale-Render Guard (`refreshSeq`)
  // ---------------------------------------------------------------------------
  let refreshSeq = 0;

  // Forward-declared so `mountRecurringRules` can call `refresh` on mutation.
  let recurringController: RecurringRulesController | null = null;

  async function refresh(): Promise<void> {
    const seq = ++refreshSeq;

    const [persisted, lastBackupAt, rules, activities] = await Promise.all([
      queryStoragePersisted(adapter),
      budget.getLastBackupAt(),
      budget.listRules(),
      budget.listActivities(),
    ]);

    if (seq !== refreshSeq) {
      return;
    }

    if (recurringController !== null) {
      await recurringController.refresh();
    }

    if (seq !== refreshSeq) {
      return;
    }

    // 1. Durability readout & honest iOS Safari / browser eviction guidance
    if (persisted) {
      replaceChildren(durabilityBadgeEl, text("Persistent storage granted"));
      setAttrs(durabilityBadgeEl, {
        class: "settings-badge settings-badge--persistent",
        "data-persisted": "true",
      });
      replaceChildren(
        durabilityGuidanceEl,
        text(
          "This browser granted persistent storage for your local database. Keep periodic JSON backups in case you clear site data or switch devices.",
        ),
      );
    } else {
      replaceChildren(durabilityBadgeEl, text("Best-effort browser storage"));
      setAttrs(durabilityBadgeEl, {
        class: "settings-badge settings-badge--best-effort",
        "data-persisted": "false",
      });
      replaceChildren(
        durabilityGuidanceEl,
        text(
          "Your browser may evict local IndexedDB data under storage pressure or after ~7 days of inactivity in iOS Safari / WebKit (unless added to the Home Screen). Export regular JSON backups to protect your data.",
        ),
      );
    }

    // 2. Last backup timestamp (local timezone via formatLocalDateTime)
    if (lastBackupAt !== null) {
      let formatted = lastBackupAt;
      try {
        formatted = formatLocalDateTime(lastBackupAt);
      } catch {
        formatted = lastBackupAt;
      }
      replaceChildren(
        lastBackupValueEl,
        el("time", { datetime: lastBackupAt }, [text(formatted)]),
      );
    } else {
      replaceChildren(lastBackupValueEl, text("Never backed up"));
    }

    // 3. Non-blocking N-day / never-backed-up reminder banner
    const hasData = rules.length > 0 || activities.length > 0;
    if (lastBackupAt === null) {
      if (hasData) {
        replaceChildren(
          nagMessageEl,
          text(
            "You have local budget data that has not been backed up yet. Export a JSON backup to keep a safe copy.",
          ),
        );
        setAttrs(backupNagEl, { hidden: null, "data-nag-reason": "never" });
      } else {
        replaceChildren(nagMessageEl);
        setAttrs(backupNagEl, { hidden: "true", "data-nag-reason": null });
      }
    } else {
      const lastMs = Date.parse(lastBackupAt);
      const ageMs = clock().getTime() - lastMs;
      if (Number.isFinite(ageMs) && ageMs >= reminderDays * MS_PER_DAY) {
        const ageDays = Math.floor(ageMs / MS_PER_DAY);
        replaceChildren(
          nagMessageEl,
          text(
            `Your last backup was ${pluralize(ageDays, "day", "days")} ago (reminder after ${reminderDays} days). Export a fresh JSON backup to keep your records safe.`,
          ),
        );
        setAttrs(backupNagEl, { hidden: null, "data-nag-reason": "stale" });
      } else {
        replaceChildren(nagMessageEl);
        setAttrs(backupNagEl, { hidden: "true", "data-nag-reason": null });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Export & Share Handlers (`PlatformServices`)
  // ---------------------------------------------------------------------------
  async function handleExport(mode: "save" | "share"): Promise<void> {
    if (backupBusy) {
      return;
    }
    clearBackupFeedback();
    setBackupControlsBusy(true);
    try {
      const backup = await budget.exportBackup();
      const json = JSON.stringify(backup, null, 2);
      const filename = formatBackupFilename(clock());
      if (mode === "share") {
        await platform.shareBackup(filename, json);
      } else {
        await platform.saveBackup(filename, json);
      }
      onUserWrite?.();
      await refresh();
      await onDataMutated?.();
      const verb = mode === "share" ? "shared" : "exported";
      showBackupStatus(
        `Backup ${verb} (${pluralize(backup.rules.length, "rule", "rules")}, ${pluralize(backup.activities.length, "activity", "activities")}).`,
      );
    } catch (err) {
      showBackupError(
        `Unable to ${mode === "share" ? "share" : "export"} backup: ${extractErrorMessage(err)}`,
      );
    } finally {
      setBackupControlsBusy(false);
    }
  }

  exportBtn.addEventListener("click", () => {
    void handleExport("save");
  });

  nagExportBtn.addEventListener("click", () => {
    void handleExport("save");
  });

  shareBtn.addEventListener("click", () => {
    void handleExport("share");
  });

  // ---------------------------------------------------------------------------
  // 7. Hardened 4-Step Import Handler
  //    1) Pre-read File.size <= 10 MB check (before calling file.text())
  //    2) Explicit confirmation <dialog> via shell.confirm(...)
  //    3) Automatic pre-import safety snapshot via PlatformServices.saveBackup
  //    4) Atomic restore via budget.importBackup(rawJson)
  // ---------------------------------------------------------------------------
  importInput.addEventListener("change", () => {
    void (async () => {
      const file = importInput.files?.[0];
      if (file === undefined || backupBusy) {
        return;
      }

      clearBackupFeedback();

      // Step 1: Pre-read size guard BEFORE reading file contents into memory.
      if (file.size > MAX_BACKUP_BYTES) {
        importInput.value = "";
        showBackupError(
          "Backup file exceeds the 10 MB size limit. Your existing data was not modified.",
          true,
        );
        return;
      }

      // Set in-flight guard before opening the modal dialog, but keep DOM
      // controls enabled until confirmed: `showModal()` already makes
      // background controls inert while open, and keeping `importInput`
      // enabled allows `shell.ts`'s `close` handler to restore focus to
      // `invoker: importInput` synchronously on cancel/Escape (WCAG 2.2 AA).
      backupBusy = true;
      try {
        // Step 2: Explicit confirmation <dialog>
        const confirmed = await confirm({
          title: "Import JSON backup",
          message: `Importing "${file.name}" will replace all existing local recurring rules and activities. An automatic safety backup of your current data will be saved first. Continue?`,
          confirmLabel: "Import Backup",
          cancelLabel: "Cancel",
          invoker: importInput,
        });

        if (!confirmed) {
          importInput.value = "";
          return;
        }

        setBackupControlsBusy(true);

        // Step 3: Automatic pre-import safety snapshot before mutating storage
        try {
          const snapshot = await budget.exportBackup();
          const snapshotJson = JSON.stringify(snapshot, null, 2);
          const snapshotFilename = formatSnapshotFilename(clock());
          await platform.saveBackup(snapshotFilename, snapshotJson);
        } catch (err) {
          importInput.value = "";
          showBackupError(
            `Pre-import safety backup failed; import was aborted and your existing data was not modified. (${extractErrorMessage(err)})`,
            true,
          );
          return;
        }

        // Step 4: Read file text & atomic validated restore
        let rawJson: string;
        try {
          rawJson = await file.text();
        } catch (err) {
          importInput.value = "";
          showBackupError(
            `Unable to read backup file; your existing data was not modified. (${extractErrorMessage(err)})`,
            true,
          );
          return;
        }

        let imported: { rulesCount: number; activitiesCount: number };
        try {
          imported = await budget.importBackup(rawJson);
        } catch (err) {
          importInput.value = "";
          await refresh();
          showBackupError(
            `Backup import failed and your existing data remains intact: ${extractErrorMessage(err)}`,
            true,
          );
          return;
        }

        importInput.value = "";
        onUserWrite?.();
        await refresh();
        await onDataMutated?.();
        showBackupStatus(
          `Backup imported (${pluralize(imported.rulesCount, "rule", "rules")}, ${pluralize(imported.activitiesCount, "activity", "activities")}).`,
        );
      } finally {
        setBackupControlsBusy(false);
      }
    })();
  });

  // ---------------------------------------------------------------------------
  // 8. Mount Recurring Rules Panel & Assemble Layout
  // ---------------------------------------------------------------------------
  recurringController = mountRecurringRules({
    container: recurringSlot,
    budget,
    confirm,
    idPrefix: "settings-recurring",
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(onUserWrite !== undefined ? { onUserWrite } : {}),
    onChanged: async () => {
      await refresh();
      await onDataMutated?.();
    },
  });

  const backupPane = el("div", { class: "settings-backup-pane" }, [
    durabilitySection,
    backupSection,
  ]);

  const rulesPane = el("div", { class: "settings-rules-pane" }, [
    recurringSection,
  ]);

  const layout = el("div", { class: "settings-layout" }, [
    backupPane,
    rulesPane,
  ]);

  replaceChildren(container, layout);

  return {
    refresh,
  };
}
