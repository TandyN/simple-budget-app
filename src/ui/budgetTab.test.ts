// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BudgetApi, createBudgetApi } from "../budgetApi";
import { InMemoryAdapter } from "../storage/memory";
import { type BudgetTabController, mountBudgetTab } from "./budgetTab";
import { renderShell, type ShellHandle } from "./shell";

let root: HTMLElement;
let shell: ShellHandle;
let budget: BudgetApi;
let controller: BudgetTabController;
let onUserWrite: ReturnType<typeof vi.fn<() => void>>;
let idCounter = 0;

async function setup(options?: {
  now?: () => Date;
  renderRecurringSlot?: (
    slot: HTMLElement,
    onChanged: () => Promise<void>,
  ) => void;
}) {
  idCounter = 0;
  root = document.createElement("div");
  document.body.appendChild(root);
  shell = renderShell(root);

  const adapter = new InMemoryAdapter();
  const fixedNow = options?.now ?? (() => new Date("2026-06-15T14:30:00.000Z"));
  budget = createBudgetApi({
    adapter,
    idFactory: () => `act-${++idCounter}`,
    now: fixedNow,
  });
  await budget.init();

  onUserWrite = vi.fn<() => void>();
  controller = mountBudgetTab({
    container: shell.panels.budget,
    budget,
    confirm: shell.confirm,
    onUserWrite,
    now: fixedNow,
    ...(options?.renderRecurringSlot !== undefined
      ? { renderRecurringSlot: options.renderRecurringSlot }
      : {}),
  });
  await controller.refresh();
}

function submitForm(form: HTMLFormElement): SubmitEvent {
  const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return event;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  root?.remove();
  if (shell?.dialog.open) {
    shell.close();
  }
});

describe("mountBudgetTab", () => {
  it("renders initial Available Funds ($0.00) with aria-live='polite' and empty state", async () => {
    await setup();

    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl).not.toBeNull();
    expect(fundsEl.getAttribute("aria-live")).toBe("polite");
    expect(fundsEl.getAttribute("aria-atomic")).toBe("true");
    expect(fundsEl.textContent).toBe("$0.00");

    const emptyEl = shell.panels.budget.querySelector(
      ".budget-feed-empty",
    ) as HTMLElement;
    expect(emptyEl.hidden).toBe(false);
    expect(emptyEl.textContent).toContain("No activities yet");

    const listEl = shell.panels.budget.querySelector(
      ".budget-feed-list",
    ) as HTMLUListElement;
    expect(listEl.hidden).toBe(true);
    expect(listEl.children).toHaveLength(0);
  });

  it("Quick-Add supports income, deposit, and expense, updates Available Funds & Feed, calls preventDefault and onUserWrite", async () => {
    await setup();

    const form = shell.panels.budget.querySelector(
      ".budget-quick-add form",
    ) as HTMLFormElement;
    const typeSelect = form.querySelector(
      "#quick-add-type",
    ) as HTMLSelectElement;
    const amountInput = form.querySelector(
      "#quick-add-amount",
    ) as HTMLInputElement;
    const dateInput = form.querySelector(
      "#quick-add-datetime",
    ) as HTMLInputElement;
    const memoInput = form.querySelector("#quick-add-memo") as HTMLInputElement;
    const tagsInput = form.querySelector("#quick-add-tags") as HTMLInputElement;

    // 1. Income: $1,000.00
    typeSelect.value = "income";
    amountInput.value = "1000.00";
    dateInput.value = "2026-06-10T09:00";
    memoInput.value = "Paycheck";
    tagsInput.value = "salary, primary";
    const ev1 = submitForm(form);
    expect(ev1.defaultPrevented).toBe(true);
    await flushAsync();

    // 2. Deposit: $250.50
    typeSelect.value = "deposit";
    amountInput.value = "250.50";
    dateInput.value = "2026-06-12T10:15";
    memoInput.value = "Refund";
    tagsInput.value = "rebate";
    submitForm(form);
    await flushAsync();

    // 3. Expense: $45.25
    typeSelect.value = "expense";
    amountInput.value = "45.25";
    dateInput.value = "2026-06-15T12:00";
    memoInput.value = "Weekly groceries";
    tagsInput.value = "groceries, food";
    submitForm(form);
    await flushAsync();

    // 1000.00 + 250.50 - 45.25 = 1205.25
    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("$1,205.25");
    expect(onUserWrite).toHaveBeenCalledTimes(3);

    // Form resets after submit
    expect(typeSelect.value).toBe("expense");
    expect(amountInput.value).toBe("");
    expect(memoInput.value).toBe("");
    expect(tagsInput.value).toBe("");

    // Reverse-chronological order (newest first)
    const items = Array.from(
      shell.panels.budget.querySelectorAll(".budget-feed-item"),
    );
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("Weekly groceries");
    expect(items[0]?.textContent).toContain("-$45.25");
    expect(items[0]?.textContent).toContain("Manual");
    expect(items[1]?.textContent).toContain("Refund");
    expect(items[1]?.textContent).toContain("$250.50");
    expect(items[2]?.textContent).toContain("Paycheck");
    expect(items[2]?.textContent).toContain("$1,000.00");
  });

  it("displays auto-posted recurring activities alongside manual activities", async () => {
    await setup({ now: () => new Date("2026-06-15T14:30:00.000Z") });

    await budget.addRule({
      name: "Monthly Rent",
      type: "expense",
      amountCents: 150000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
    });
    await budget.runRecurringEngine(new Date("2026-06-15T14:30:00.000Z"));
    await controller.refresh();

    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("-$1,500.00");
    expect(fundsEl.classList.contains("budget-funds-amount--negative")).toBe(
      true,
    );

    const items = shell.panels.budget.querySelectorAll(".budget-feed-item");
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain("Recurring");
    expect(items[0]?.textContent).toContain("Expense");
    expect(items[0]?.textContent).toContain("-$1,500.00");
  });

  it("shows accessible role='alert' validation error on invalid amount without mutating storage", async () => {
    await setup();

    const form = shell.panels.budget.querySelector(
      ".budget-quick-add form",
    ) as HTMLFormElement;
    const amountInput = form.querySelector(
      "#quick-add-amount",
    ) as HTMLInputElement;
    const errorEl = form.querySelector("#quick-add-error") as HTMLElement;

    amountInput.value = "-12.345";
    submitForm(form);
    await flushAsync();

    expect(errorEl.hidden).toBe(false);
    expect(errorEl.getAttribute("role")).toBe("alert");
    expect(errorEl.textContent).toContain("Invalid amount");
    expect(amountInput.getAttribute("aria-invalid")).toBe("true");
    expect(amountInput.getAttribute("aria-describedby")).toBe(
      "quick-add-error",
    );

    expect(await budget.listActivities()).toHaveLength(0);
    expect(await budget.getAvailableFunds()).toBe(0);
    expect(onUserWrite).not.toHaveBeenCalled();
  });

  it("edits an activity (type, amount, backdated dateTime, memo, tags) via <dialog> and recalculates Available Funds", async () => {
    await setup();

    const created = await budget.addActivity({
      type: "expense",
      amountCents: 5000,
      dateTime: "2026-06-15T12:00:00.000Z",
      memo: "Original memo",
      tags: ["initial"],
    });
    await controller.refresh();

    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("-$50.00");

    const editBtn = shell.panels.budget.querySelector(
      ".budget-edit-btn",
    ) as HTMLButtonElement;
    editBtn.click();

    const editDialog = shell.panels.budget.querySelector(
      "dialog.budget-edit-dialog",
    ) as HTMLDialogElement;
    expect(editDialog.open).toBe(true);

    // Immutable provenance fields must not be present in the edit modal
    expect(editDialog.querySelector('[name="source"]')).toBeNull();
    expect(editDialog.querySelector('[name="sourceRuleId"]')).toBeNull();
    expect(editDialog.querySelector('[name="period"]')).toBeNull();
    expect(editDialog.querySelector('[name="createdAt"]')).toBeNull();
    expect(editDialog.querySelector('[name="updatedAt"]')).toBeNull();

    const editForm = editDialog.querySelector("form") as HTMLFormElement;
    const typeSelect = editForm.querySelector(
      "#edit-activity-type",
    ) as HTMLSelectElement;
    const amountInput = editForm.querySelector(
      "#edit-activity-amount",
    ) as HTMLInputElement;
    const dateInput = editForm.querySelector(
      "#edit-activity-datetime",
    ) as HTMLInputElement;
    const memoInput = editForm.querySelector(
      "#edit-activity-memo",
    ) as HTMLInputElement;
    const tagsInput = editForm.querySelector(
      "#edit-activity-tags",
    ) as HTMLInputElement;

    expect(typeSelect.value).toBe("expense");
    expect(amountInput.value).toBe("50.00");
    expect(memoInput.value).toBe("Original memo");
    expect(tagsInput.value).toBe("initial");

    // Reclassify to deposit, change amount, backdate, update memo & tags
    typeSelect.value = "deposit";
    amountInput.value = "125.75";
    dateInput.value = "2026-01-05T08:30";
    memoInput.value = "Backdated reimbursement";
    tagsInput.value = "work, travel";

    const ev = submitForm(editForm);
    expect(ev.defaultPrevented).toBe(true);
    await flushAsync();

    expect(editDialog.open).toBe(false);
    expect(fundsEl.textContent).toBe("$125.75");
    expect(onUserWrite).toHaveBeenCalledTimes(1);

    const updated = (await budget.listActivities())[0];
    expect(updated?.id).toBe(created.id);
    expect(updated?.source).toBe("manual");
    expect(updated?.type).toBe("deposit");
    expect(updated?.amountCents).toBe(12575);
    expect(updated?.memo).toBe("Backdated reimbursement");
    expect(updated?.tags).toEqual(["work", "travel"]);
    expect(updated?.dateTime.startsWith("2026-01-0")).toBe(true);
  });

  it("cancelling the edit <dialog> preserves data and returns focus to the invoking button", async () => {
    await setup();

    await budget.addActivity({
      type: "expense",
      amountCents: 2000,
      dateTime: "2026-06-15T12:00:00.000Z",
      memo: "Keep me",
    });
    await controller.refresh();

    const editBtn = shell.panels.budget.querySelector(
      ".budget-edit-btn",
    ) as HTMLButtonElement;
    editBtn.click();

    const editDialog = shell.panels.budget.querySelector(
      "dialog.budget-edit-dialog",
    ) as HTMLDialogElement;
    const amountInput = editDialog.querySelector(
      "#edit-activity-amount",
    ) as HTMLInputElement;
    amountInput.value = "999.99";

    const cancelBtn = editDialog.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    cancelBtn.click();
    await flushAsync();

    expect(editDialog.open).toBe(false);
    expect(document.activeElement).toBe(editBtn);
    expect(await budget.getAvailableFunds()).toBe(-2000);
    expect(onUserWrite).not.toHaveBeenCalled();
  });

  it("deletes an activity only after confirmation (cancel preserves, confirm deletes and updates Available Funds)", async () => {
    await setup();

    await budget.addActivity({
      type: "income",
      amountCents: 30000,
      dateTime: "2026-06-15T12:00:00.000Z",
      memo: "Bonus",
    });
    await controller.refresh();

    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("$300.00");

    // 1. Click Delete, then Cancel
    const deleteBtn = shell.panels.budget.querySelector(
      ".budget-delete-btn",
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushAsync();

    expect(shell.dialog.open).toBe(true);
    (
      shell.dialog.querySelector(".confirm-dialog-cancel") as HTMLButtonElement
    ).click();
    await flushAsync();

    expect(shell.dialog.open).toBe(false);
    expect(await budget.listActivities()).toHaveLength(1);
    expect(fundsEl.textContent).toBe("$300.00");
    expect(onUserWrite).not.toHaveBeenCalled();

    // 2. Click Delete, then Confirm
    deleteBtn.click();
    await flushAsync();

    expect(shell.dialog.open).toBe(true);
    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    expect(shell.dialog.open).toBe(false);
    expect(await budget.listActivities()).toHaveLength(0);
    expect(fundsEl.textContent).toBe("$0.00");
    expect(onUserWrite).toHaveBeenCalledTimes(1);
  });

  it("renders DOM XSS payloads in memo and tags strictly as inert literal text", async () => {
    await setup();

    const imgPayload = "<img src=x onerror=window.__xss=1>";
    const scriptPayload = "<script>window.__xss=1</script>";

    const form = shell.panels.budget.querySelector(
      ".budget-quick-add form",
    ) as HTMLFormElement;
    (form.querySelector("#quick-add-amount") as HTMLInputElement).value =
      "10.00";
    (form.querySelector("#quick-add-memo") as HTMLInputElement).value =
      imgPayload;
    (form.querySelector("#quick-add-tags") as HTMLInputElement).value =
      `${scriptPayload}, ${imgPayload}`;

    submitForm(form);
    await flushAsync();

    // Zero injected <img> or <script> elements anywhere in the panel
    expect(shell.panels.budget.querySelectorAll("img")).toHaveLength(0);
    expect(shell.panels.budget.querySelectorAll("script")).toHaveLength(0);
    expect(
      (window as unknown as Record<string, unknown>).__xss,
    ).toBeUndefined();

    const memoEl = shell.panels.budget.querySelector(
      ".budget-feed-memo",
    ) as HTMLElement;
    expect(memoEl.textContent).toBe(imgPayload);

    const tagChips = Array.from(
      shell.panels.budget.querySelectorAll(".budget-tag-chip"),
    ).map((node) => node.textContent);
    expect(tagChips).toEqual([scriptPayload, imgPayload]);
  });

  it("exposes the Recurring Rules slot and refreshes when onChanged is called", async () => {
    const captured: {
      slot: HTMLElement | null;
      triggerChanged: (() => Promise<void>) | null;
    } = {
      slot: null,
      triggerChanged: null,
    };

    await setup({
      renderRecurringSlot(slot, onChanged) {
        captured.slot = slot;
        captured.triggerChanged = onChanged;
        slot.textContent = "Recurring slot mounted";
      },
    });

    expect(captured.slot).not.toBeNull();
    expect(captured.slot?.getAttribute("data-slot")).toBe("recurring-rules");
    expect(shell.panels.budget.textContent).toContain("Recurring slot mounted");

    await budget.addActivity({
      type: "income",
      amountCents: 4200,
      dateTime: "2026-06-15T12:00:00.000Z",
    });
    await captured.triggerChanged?.();

    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("$42.00");
    expect(onUserWrite).toHaveBeenCalledTimes(1);
  });

  it("surfaces a role='alert' error banner and restores focus when deleteActivity fails", async () => {
    await setup();

    await budget.addActivity({
      type: "expense",
      amountCents: 1500,
      dateTime: "2026-06-15T12:00:00.000Z",
      memo: "Will fail delete",
    });
    await controller.refresh();

    vi.spyOn(budget, "deleteActivity").mockRejectedValueOnce(
      new Error("IndexedDB write failed"),
    );

    const deleteBtn = shell.panels.budget.querySelector(
      ".budget-delete-btn",
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushAsync();

    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    const feedErrorEl = shell.panels.budget.querySelector(
      "#budget-feed-error",
    ) as HTMLElement;
    expect(feedErrorEl.hidden).toBe(false);
    expect(feedErrorEl.getAttribute("role")).toBe("alert");
    expect(feedErrorEl.textContent).toContain("IndexedDB write failed");
    expect(deleteBtn.disabled).toBe(false);
    expect(document.activeElement).toBe(deleteBtn);
    expect(await budget.listActivities()).toHaveLength(1);
  });

  it("moves focus to a surviving feed item button after confirmed delete, and to Quick-Add submit when feed becomes empty", async () => {
    await setup();

    const older = await budget.addActivity({
      type: "expense",
      amountCents: 1000,
      dateTime: "2026-06-10T12:00:00.000Z",
      memo: "Older",
    });
    const newer = await budget.addActivity({
      type: "expense",
      amountCents: 2000,
      dateTime: "2026-06-15T12:00:00.000Z",
      memo: "Newer",
    });
    await controller.refresh();

    // Delete the first (newer) item -> focus moves to the remaining (older) item's action button
    const firstDeleteBtn = shell.panels.budget.querySelector(
      `button.budget-delete-btn[data-activity-id="${newer.id}"]`,
    ) as HTMLButtonElement;
    firstDeleteBtn.click();
    await flushAsync();
    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    const remainingEditBtn = shell.panels.budget.querySelector(
      `button.budget-edit-btn[data-activity-id="${older.id}"]`,
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(remainingEditBtn);

    // Delete the last remaining item -> focus moves to the surviving Quick-Add submit button
    const lastDeleteBtn = shell.panels.budget.querySelector(
      `button.budget-delete-btn[data-activity-id="${older.id}"]`,
    ) as HTMLButtonElement;
    lastDeleteBtn.click();
    await flushAsync();
    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    const quickSubmitBtn = shell.panels.budget.querySelector(
      '.budget-quick-add button[type="submit"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(quickSubmitBtn);
  });

  it("ignores concurrent rapid submissions on quickForm while addActivity is in flight", async () => {
    await setup();

    const form = shell.panels.budget.querySelector(
      ".budget-quick-add form",
    ) as HTMLFormElement;
    const amountInput = form.querySelector(
      "#quick-add-amount",
    ) as HTMLInputElement;
    const submitBtn = form.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;

    const originalAdd = budget.addActivity.bind(budget);
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });

    const addSpy = vi
      .spyOn(budget, "addActivity")
      .mockImplementationOnce(async (input) => {
        await firstWriteGate;
        return originalAdd(input);
      });

    amountInput.value = "25.00";
    submitForm(form);
    expect(submitBtn.disabled).toBe(true);

    // Rapid second submit while the first is still pending
    const ev2 = submitForm(form);
    expect(ev2.defaultPrevented).toBe(true);
    expect(addSpy).toHaveBeenCalledTimes(1);

    releaseFirstWrite?.();
    await flushAsync();

    expect(submitBtn.disabled).toBe(false);
    expect(await budget.listActivities()).toHaveLength(1);
    expect(onUserWrite).toHaveBeenCalledTimes(1);
  });

  it("ignores concurrent rapid submissions on editForm while editActivity is in flight", async () => {
    await setup();

    await budget.addActivity({
      type: "expense",
      amountCents: 4000,
      dateTime: "2026-06-15T12:00:00.000Z",
      memo: "Editable",
    });
    await controller.refresh();

    const editBtn = shell.panels.budget.querySelector(
      ".budget-edit-btn",
    ) as HTMLButtonElement;
    editBtn.click();

    const editDialog = shell.panels.budget.querySelector(
      "dialog.budget-edit-dialog",
    ) as HTMLDialogElement;
    const editForm = editDialog.querySelector("form") as HTMLFormElement;
    const amountInput = editForm.querySelector(
      "#edit-activity-amount",
    ) as HTMLInputElement;
    const saveBtn = editForm.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;

    const originalEdit = budget.editActivity.bind(budget);
    let releaseEdit: (() => void) | undefined;
    const editGate = new Promise<void>((resolve) => {
      releaseEdit = resolve;
    });

    const editSpy = vi
      .spyOn(budget, "editActivity")
      .mockImplementationOnce(async (id, patch) => {
        await editGate;
        return originalEdit(id, patch);
      });

    amountInput.value = "75.50";
    submitForm(editForm);
    expect(saveBtn.disabled).toBe(true);

    // Rapid second submit while the first is still pending
    const ev2 = submitForm(editForm);
    expect(ev2.defaultPrevented).toBe(true);
    expect(editSpy).toHaveBeenCalledTimes(1);

    releaseEdit?.();
    await flushAsync();

    expect(saveBtn.disabled).toBe(false);
    expect(editDialog.open).toBe(false);
    expect(await budget.getAvailableFunds()).toBe(-7550);
    expect(onUserWrite).toHaveBeenCalledTimes(1);
  });

  it("pre-populates the Edit modal amount with exact integer arithmetic for large safe-integer cent values", async () => {
    await setup();

    await budget.addActivity({
      type: "income",
      amountCents: Number.MAX_SAFE_INTEGER,
      dateTime: "2026-06-15T12:00:00.000Z",
      memo: "Max safe integer",
    });
    await controller.refresh();

    const editBtn = shell.panels.budget.querySelector(
      ".budget-edit-btn",
    ) as HTMLButtonElement;
    editBtn.click();

    const editAmountInput = shell.panels.budget.querySelector(
      "#edit-activity-amount",
    ) as HTMLInputElement;
    expect(editAmountInput.value).toBe("90071992547409.91");
  });
});
