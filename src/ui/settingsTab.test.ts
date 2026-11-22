// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BudgetApi, createBudgetApi } from "../budgetApi";
import type { BudgetBackup } from "../core/types";
import { MAX_BACKUP_BYTES } from "../core/validate";
import type { PlatformServices } from "../platform/services";
import { InMemoryAdapter } from "../storage/memory";
import {
  type DurabilityReadableAdapter,
  mountSettingsTab,
  type SettingsTabController,
} from "./settingsTab";
import { renderShell, type ShellHandle } from "./shell";

let root: HTMLElement;
let shell: ShellHandle;
let adapter: InMemoryAdapter;
let budget: BudgetApi;
let platform: PlatformServices & {
  saveBackup: ReturnType<typeof vi.fn<PlatformServices["saveBackup"]>>;
  shareBackup: ReturnType<typeof vi.fn<PlatformServices["shareBackup"]>>;
};
let controller: SettingsTabController;
let onUserWrite: ReturnType<typeof vi.fn<() => void>>;
let onDataMutated: ReturnType<typeof vi.fn<() => Promise<void>>>;
let idCounter = 0;

async function setup(options?: {
  now?: () => Date;
  durabilityAdapter?: DurabilityReadableAdapter;
  backupReminderDays?: number;
  budgetOverride?: BudgetApi;
}) {
  idCounter = 0;
  root = document.createElement("div");
  document.body.appendChild(root);
  shell = renderShell(root);

  adapter = new InMemoryAdapter();
  const fixedNow = options?.now ?? (() => new Date("2026-06-15T14:30:00.000Z"));
  budget =
    options?.budgetOverride ??
    createBudgetApi({
      adapter,
      idFactory: () => `id-${++idCounter}`,
      now: fixedNow,
    });
  await budget.init();

  platform = {
    isNative: false,
    saveBackup: vi.fn<PlatformServices["saveBackup"]>().mockResolvedValue(),
    shareBackup: vi.fn<PlatformServices["shareBackup"]>().mockResolvedValue(),
  };

  onUserWrite = vi.fn<() => void>();
  onDataMutated = vi.fn<() => Promise<void>>().mockResolvedValue();

  controller = mountSettingsTab({
    container: shell.panels.settings,
    budget,
    platform,
    confirm: shell.confirm,
    ...(options?.durabilityAdapter !== undefined
      ? { adapter: options.durabilityAdapter }
      : {}),
    now: fixedNow,
    ...(options?.backupReminderDays !== undefined
      ? { backupReminderDays: options.backupReminderDays }
      : {}),
    onUserWrite,
    onDataMutated,
  });
  await controller.refresh();
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function selectFileOnInput(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function createValidBackupJson(overrides?: Partial<BudgetBackup>): string {
  const backup: BudgetBackup = {
    schemaVersion: 1,
    exportedAt: "2026-06-10T12:00:00.000Z",
    rules: [
      {
        id: "rule-imported-1",
        name: "Imported Rent",
        type: "expense",
        amountCents: 150000,
        currency: "USD",
        schedule: { cadence: "monthly", dayOfMonth: 1 },
        active: true,
        lastPostPeriod: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    activities: [
      {
        id: "act-imported-1",
        type: "income",
        amountCents: 300000,
        currency: "USD",
        dateTime: "2026-06-01T12:00:00.000Z",
        tags: ["salary"],
        memo: "Imported paycheck",
        source: "manual",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      },
    ],
    ...overrides,
  };
  return JSON.stringify(backup);
}

afterEach(() => {
  vi.restoreAllMocks();
  root?.remove();
  if (shell?.dialog.open) {
    shell.close();
  }
});

describe("mountSettingsTab", () => {
  it("renders honest best-effort durability status, iOS Safari guidance, Never backed up, and hidden nag when empty", async () => {
    await setup({
      durabilityAdapter: {
        getPersisted: async () => false,
      },
    });

    const panel = shell.panels.settings;

    const statusEl = panel.querySelector(
      "#settings-durability-status",
    ) as HTMLElement;
    expect(statusEl.getAttribute("data-persisted")).toBe("false");
    expect(statusEl.textContent).toBe("Best-effort browser storage");

    const guidanceEl = panel.querySelector(
      "#settings-durability-guidance",
    ) as HTMLElement;
    expect(guidanceEl.textContent).toContain("iOS Safari");

    const lastBackupEl = panel.querySelector(
      "#settings-last-backup",
    ) as HTMLElement;
    expect(lastBackupEl.textContent).toBe("Never backed up");

    // No data exists yet -> backup nag stays hidden
    const nagEl = panel.querySelector("#settings-backup-nag") as HTMLElement;
    expect(nagEl.hidden).toBe(true);

    // Programmatic label for file input
    const fileInput = panel.querySelector(
      "#settings-import-file",
    ) as HTMLInputElement;
    const fileLabel = panel.querySelector(
      'label[for="settings-import-file"]',
    ) as HTMLLabelElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.getAttribute("accept")).toBe("application/json,.json");
    expect(fileLabel).not.toBeNull();
    expect(fileLabel.textContent).toContain("Import JSON Backup");
  });

  it("renders Persistent storage granted when adapter.getPersisted() resolves true", async () => {
    await setup({
      durabilityAdapter: {
        getPersisted: async () => true,
      },
    });

    const statusEl = shell.panels.settings.querySelector(
      "#settings-durability-status",
    ) as HTMLElement;
    expect(statusEl.getAttribute("data-persisted")).toBe("true");
    expect(statusEl.textContent).toBe("Persistent storage granted");
  });

  it("gracefully treats absent navigator.storage as non-persistent", async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(
      navigator,
      "storage",
    );
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: undefined,
    });
    try {
      await setup();
      const statusEl = shell.panels.settings.querySelector(
        "#settings-durability-status",
      ) as HTMLElement;
      expect(statusEl.getAttribute("data-persisted")).toBe("false");
      expect(statusEl.textContent).toBe("Best-effort browser storage");
    } finally {
      if (originalStorage) {
        Object.defineProperty(navigator, "storage", originalStorage);
      }
    }
  });

  it("shows never-backed-up nag when data exists and clears it via one-tap Export Backup Now", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => false },
    });

    await budget.addActivity({
      type: "deposit",
      amountCents: 25000,
      tags: ["savings"],
      memo: "Initial deposit",
    });
    await controller.refresh();

    const panel = shell.panels.settings;
    const nagEl = panel.querySelector("#settings-backup-nag") as HTMLElement;
    expect(nagEl.hidden).toBe(false);
    expect(nagEl.getAttribute("data-nag-reason")).toBe("never");

    // One-tap Export Backup Now inside nag banner
    const nagBtn = panel.querySelector(
      "#settings-nag-export-btn",
    ) as HTMLButtonElement;
    nagBtn.click();
    await flushAsync();

    expect(platform.saveBackup).toHaveBeenCalledTimes(1);
    const [filename, json] = platform.saveBackup.mock.calls[0] as [
      string,
      string,
    ];
    expect(filename).toBe("simple-budget-backup-2026-06-15.json");
    const parsed = JSON.parse(json) as BudgetBackup;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.activities).toHaveLength(1);

    expect(onUserWrite).toHaveBeenCalledTimes(1);
    expect(onDataMutated).toHaveBeenCalledTimes(1);
    expect(nagEl.hidden).toBe(true);

    const lastBackupTime = panel.querySelector("#settings-last-backup time");
    expect(lastBackupTime).not.toBeNull();
    expect(lastBackupTime?.getAttribute("datetime")).toBe(
      "2026-06-15T14:30:00.000Z",
    );
  });

  it("shows stale backup nag when lastBackupAt is >= 30 days old and hides it when < 30 days", async () => {
    let currentNow = new Date("2026-05-01T12:00:00.000Z");
    await setup({
      now: () => currentNow,
      durabilityAdapter: { getPersisted: async () => true },
    });

    // Export on May 1 -> lastBackupAt = 2026-05-01T12:00:00.000Z
    await budget.exportBackup();
    await controller.refresh();

    const nagEl = shell.panels.settings.querySelector(
      "#settings-backup-nag",
    ) as HTMLElement;
    expect(nagEl.hidden).toBe(true);

    // Advance 29 days -> still hidden
    currentNow = new Date("2026-05-30T11:59:59.000Z");
    await controller.refresh();
    expect(nagEl.hidden).toBe(true);

    // Advance 31 days -> stale nag visible
    currentNow = new Date("2026-06-01T12:00:00.000Z");
    await controller.refresh();
    expect(nagEl.hidden).toBe(false);
    expect(nagEl.getAttribute("data-nag-reason")).toBe("stale");
    expect(
      shell.panels.settings.querySelector("#settings-backup-nag-message")
        ?.textContent,
    ).toContain("31 days ago");
  });

  it("exports via saveBackup and shares via shareBackup while updating lastBackupAt and status", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => true },
    });

    const panel = shell.panels.settings;
    const exportBtn = panel.querySelector(
      "#settings-export-btn",
    ) as HTMLButtonElement;
    const shareBtn = panel.querySelector(
      "#settings-share-btn",
    ) as HTMLButtonElement;

    exportBtn.click();
    await flushAsync();

    expect(platform.saveBackup).toHaveBeenCalledTimes(1);
    const statusEl = panel.querySelector(
      "#settings-backup-status",
    ) as HTMLElement;
    expect(statusEl.hidden).toBe(false);
    expect(statusEl.textContent).toContain("Backup exported");

    shareBtn.click();
    await flushAsync();

    expect(platform.shareBackup).toHaveBeenCalledTimes(1);
    expect(statusEl.textContent).toContain("Backup shared");
    expect(onUserWrite).toHaveBeenCalledTimes(2);
  });

  it("rejects > 10 MB import files BEFORE calling file.text() with accessible role=alert error", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => true },
    });

    const panel = shell.panels.settings;
    const importInput = panel.querySelector(
      "#settings-import-file",
    ) as HTMLInputElement;

    const oversizedFile = new File(["{}"], "huge.json", {
      type: "application/json",
    });
    Object.defineProperty(oversizedFile, "size", {
      value: MAX_BACKUP_BYTES + 1,
    });
    const textSpy = vi.spyOn(oversizedFile, "text");
    const importSpy = vi.spyOn(budget, "importBackup");

    selectFileOnInput(importInput, oversizedFile);
    await flushAsync();

    expect(textSpy).not.toHaveBeenCalled();
    expect(shell.dialog.open).toBe(false);
    expect(platform.saveBackup).not.toHaveBeenCalled();
    expect(importSpy).not.toHaveBeenCalled();

    const errorEl = panel.querySelector(
      "#settings-backup-error",
    ) as HTMLElement;
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.getAttribute("role")).toBe("alert");
    expect(errorEl.textContent).toContain("10 MB");
    expect(importInput.getAttribute("aria-invalid")).toBe("true");
    expect(importInput.getAttribute("aria-describedby")).toBe(
      "settings-backup-error",
    );
  });

  it("aborts import cleanly when confirmation dialog is cancelled without reading or mutating data", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => true },
    });

    await budget.addActivity({
      type: "deposit",
      amountCents: 10000,
      tags: ["existing"],
    });

    const panel = shell.panels.settings;
    const importInput = panel.querySelector(
      "#settings-import-file",
    ) as HTMLInputElement;

    const validFile = new File([createValidBackupJson()], "backup.json", {
      type: "application/json",
    });
    const textSpy = vi.spyOn(validFile, "text");

    selectFileOnInput(importInput, validFile);
    await flushAsync();

    expect(shell.dialog.open).toBe(true);
    expect(
      shell.dialog.querySelector(".confirm-dialog-message")?.textContent,
    ).toContain("replace all existing local recurring rules and activities");

    // Click Cancel
    const cancelBtn = shell.dialog.querySelector(
      ".confirm-dialog-cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();
    await flushAsync();

    expect(shell.dialog.open).toBe(false);
    expect(textSpy).not.toHaveBeenCalled();
    expect(platform.saveBackup).not.toHaveBeenCalled();

    const activities = await budget.listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]?.tags).toEqual(["existing"]);
  });

  it("executes confirm -> automatic pre-import safety snapshot -> importBackup in strict order", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => true },
    });

    await budget.addActivity({
      type: "deposit",
      amountCents: 5000,
      tags: ["original"],
    });

    const callOrder: string[] = [];
    const origExport = budget.exportBackup.bind(budget);
    const origImport = budget.importBackup.bind(budget);

    vi.spyOn(budget, "exportBackup").mockImplementation(async () => {
      callOrder.push("exportBackup");
      return origExport();
    });
    platform.saveBackup.mockImplementation(async () => {
      callOrder.push("saveBackup");
    });
    vi.spyOn(budget, "importBackup").mockImplementation(
      async (json: string) => {
        callOrder.push("importBackup");
        return origImport(json);
      },
    );

    const panel = shell.panels.settings;
    const importInput = panel.querySelector(
      "#settings-import-file",
    ) as HTMLInputElement;
    const validFile = new File([createValidBackupJson()], "restore.json", {
      type: "application/json",
    });

    selectFileOnInput(importInput, validFile);
    await flushAsync();

    expect(shell.dialog.open).toBe(true);
    const confirmBtn = shell.dialog.querySelector(
      ".confirm-dialog-confirm",
    ) as HTMLButtonElement;
    confirmBtn.click();
    await flushAsync();

    expect(callOrder).toEqual(["exportBackup", "saveBackup", "importBackup"]);

    // Verify safety snapshot filename and content (original data)
    const [snapFilename, snapJson] = platform.saveBackup.mock.calls[0] as [
      string,
      string,
    ];
    expect(snapFilename).toContain("simple-budget-pre-import-snapshot-");
    const snapParsed = JSON.parse(snapJson) as BudgetBackup;
    expect(snapParsed.activities).toHaveLength(1);
    expect(snapParsed.activities[0]?.tags).toEqual(["original"]);

    // Verify imported data replaced prior data
    const rules = await budget.listRules();
    const activities = await budget.listActivities();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe("Imported Rent");
    expect(activities).toHaveLength(1);
    expect(activities[0]?.memo).toBe("Imported paycheck");

    // Verify callbacks & accessible status
    expect(onUserWrite).toHaveBeenCalledTimes(1);
    expect(onDataMutated).toHaveBeenCalledTimes(1);
    const statusEl = panel.querySelector(
      "#settings-backup-status",
    ) as HTMLElement;
    expect(statusEl.hidden).toBe(false);
    expect(statusEl.textContent).toContain(
      "Backup imported (1 rule, 1 activity)",
    );
  });

  it("aborts import without mutating stored data when pre-import safety snapshot fails", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => true },
    });

    await budget.addActivity({
      type: "deposit",
      amountCents: 7500,
      tags: ["keep-me"],
    });

    platform.saveBackup.mockRejectedValueOnce(new Error("Disk full"));
    const importSpy = vi.spyOn(budget, "importBackup");

    const panel = shell.panels.settings;
    const importInput = panel.querySelector(
      "#settings-import-file",
    ) as HTMLInputElement;
    const validFile = new File([createValidBackupJson()], "restore.json", {
      type: "application/json",
    });

    selectFileOnInput(importInput, validFile);
    await flushAsync();

    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    expect(importSpy).not.toHaveBeenCalled();
    const activities = await budget.listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]?.tags).toEqual(["keep-me"]);

    const errorEl = panel.querySelector(
      "#settings-backup-error",
    ) as HTMLElement;
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.getAttribute("role")).toBe("alert");
    expect(errorEl.textContent).toContain("Pre-import safety backup failed");
    expect(errorEl.textContent).toContain("Disk full");
    expect(importInput.getAttribute("aria-invalid")).toBe("true");
  });

  it("rejects malformed and prototype-polluting JSON payloads while preserving prior data 100% intact", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => true },
    });

    await budget.addActivity({
      type: "deposit",
      amountCents: 4200,
      tags: ["safe"],
    });

    const panel = shell.panels.settings;
    const importInput = panel.querySelector(
      "#settings-import-file",
    ) as HTMLInputElement;

    // 1. Malformed JSON
    const malformedFile = new File(["{ not valid json"], "broken.json", {
      type: "application/json",
    });
    selectFileOnInput(importInput, malformedFile);
    await flushAsync();
    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    const errorEl = panel.querySelector(
      "#settings-backup-error",
    ) as HTMLElement;
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.getAttribute("role")).toBe("alert");
    expect(errorEl.textContent).toContain("existing data remains intact");

    // 2. Prototype-polluting payload
    const protoJson =
      '{"__proto__":{"polluted":true},"schemaVersion":1,"exportedAt":"2026-06-10T12:00:00.000Z","rules":[],"activities":[]}';
    const protoFile = new File([protoJson], "proto.json", {
      type: "application/json",
    });
    selectFileOnInput(importInput, protoFile);
    await flushAsync();
    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toContain("existing data remains intact");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    // Prior data remains 100% intact
    const activities = await budget.listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]?.tags).toEqual(["safe"]);
  });

  it("mounts recurring rule management inside Settings with isolated IDs and syncs mutations", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => true },
    });

    const panel = shell.panels.settings;
    const details = panel.querySelector(
      "details.budget-recurring-details",
    ) as HTMLDetailsElement;
    expect(details).not.toBeNull();
    details.open = true;

    const nameInput = panel.querySelector(
      "#settings-recurring-add-name",
    ) as HTMLInputElement;
    const amountInput = panel.querySelector(
      "#settings-recurring-add-amount",
    ) as HTMLInputElement;
    const dayInput = panel.querySelector(
      "#settings-recurring-add-day",
    ) as HTMLInputElement;
    const addForm = panel.querySelector(
      "form.budget-recurring-add-form",
    ) as HTMLFormElement;

    expect(nameInput).not.toBeNull();
    nameInput.value = "Internet Bill";
    amountInput.value = "79.99";
    dayInput.value = "10";

    addForm.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    await flushAsync();

    const rules = await budget.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe("Internet Bill");
    expect(onUserWrite).toHaveBeenCalled();
    expect(onDataMutated).toHaveBeenCalled();
    expect(panel.querySelector(".budget-recurring-count")?.textContent).toBe(
      "1",
    );
  });

  it("guards against stale out-of-order refresh() calls via refreshSeq", async () => {
    let resolveFirst!: (val: boolean) => void;
    let callCount = 0;

    await setup({
      durabilityAdapter: {
        getPersisted: () => {
          callCount += 1;
          if (callCount === 2) {
            return new Promise<boolean>((resolve) => {
              resolveFirst = resolve;
            });
          }
          return Promise.resolve(true);
        },
      },
    });

    // Trigger slow refresh #1 (will resolve false later)
    const slowRefresh = controller.refresh();
    // Trigger fast refresh #2 (resolves true immediately)
    const fastRefresh = controller.refresh();
    await fastRefresh;

    const statusEl = shell.panels.settings.querySelector(
      "#settings-durability-status",
    ) as HTMLElement;
    expect(statusEl.getAttribute("data-persisted")).toBe("true");

    // Now resolve stale refresh #1 with false -> must NOT overwrite newer DOM
    resolveFirst(false);
    await slowRefresh;
    expect(statusEl.getAttribute("data-persisted")).toBe("true");
  });

  it("renders XSS payloads in imported backup rules strictly as inert text nodes", async () => {
    await setup({
      durabilityAdapter: { getPersisted: async () => true },
    });

    const xssPayload = '<img src=x onerror="alert(1)"><script>bad()</script>';
    const xssBackupJson = createValidBackupJson({
      rules: [
        {
          id: "rule-xss",
          name: xssPayload,
          type: "expense",
          amountCents: 1234,
          currency: "USD",
          schedule: { cadence: "monthly", dayOfMonth: 5 },
          active: true,
          lastPostPeriod: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    const panel = shell.panels.settings;
    const importInput = panel.querySelector(
      "#settings-import-file",
    ) as HTMLInputElement;
    const file = new File([xssBackupJson], `${xssPayload}.json`, {
      type: "application/json",
    });

    selectFileOnInput(importInput, file);
    await flushAsync();

    // Confirm dialog message renders filename as inert text
    expect(shell.dialog.querySelector("img")).toBeNull();
    expect(shell.dialog.querySelector("script")).toBeNull();
    expect(
      shell.dialog.querySelector(".confirm-dialog-message")?.textContent,
    ).toContain(xssPayload);

    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    // Settings panel renders rule name as inert text
    expect(panel.querySelector("img")).toBeNull();
    expect(panel.querySelector("script")).toBeNull();
    expect(panel.querySelector(".budget-recurring-name")?.textContent).toBe(
      xssPayload,
    );
  });
});
