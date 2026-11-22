// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BudgetApi, createBudgetApi } from "../budgetApi";
import { InMemoryAdapter } from "../storage/memory";
import { type BudgetTabController, mountBudgetTab } from "./budgetTab";
import { renderShell, type ShellHandle } from "./shell";

let root: HTMLElement;
let shell: ShellHandle;
let budget: BudgetApi;
let budgetController: BudgetTabController;
let onUserWrite: ReturnType<typeof vi.fn<() => void>>;
let idCounter = 0;

async function setup(options?: { now?: () => Date }) {
  idCounter = 0;
  root = document.createElement("div");
  document.body.appendChild(root);
  shell = renderShell(root);

  const adapter = new InMemoryAdapter();
  const fixedNow = options?.now ?? (() => new Date("2026-06-15T14:30:00.000Z"));
  budget = createBudgetApi({
    adapter,
    idFactory: () => `rec-${++idCounter}`,
    now: fixedNow,
  });
  await budget.init();

  onUserWrite = vi.fn<() => void>();
  budgetController = mountBudgetTab({
    container: shell.panels.budget,
    budget,
    confirm: shell.confirm,
    onUserWrite,
    now: fixedNow,
  });
  await budgetController.refresh();
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

function getSlot(): HTMLElement {
  return shell.panels.budget.querySelector(
    '[data-slot="recurring-rules"]',
  ) as HTMLElement;
}

afterEach(() => {
  root?.remove();
  if (shell?.dialog.open) {
    shell.close();
  }
});

describe("mountRecurringRules (wired into Budget tab)", () => {
  it("mounts collapsed <details>/<summary> with count badge, empty state, and income/expense-only type selector", async () => {
    await setup();

    const slot = getSlot();
    const details = slot.querySelector(
      "details.budget-recurring-details",
    ) as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);

    const summary = details.querySelector("summary") as HTMLElement;
    expect(summary.textContent).toContain("Recurring Rules");

    const countBadge = details.querySelector(
      ".budget-recurring-count",
    ) as HTMLElement;
    expect(countBadge.textContent).toBe("0");
    expect(countBadge.getAttribute("aria-label")).toBe("0 rules");

    const emptyEl = details.querySelector(
      ".budget-recurring-empty",
    ) as HTMLElement;
    expect(emptyEl.hidden).toBe(false);

    const listEl = details.querySelector(
      ".budget-recurring-list",
    ) as HTMLUListElement;
    expect(listEl.hidden).toBe(true);

    // Recurring rules never expose "deposit"
    const typeOptions = Array.from(
      details.querySelectorAll("#recurring-add-type option"),
    ).map((opt) => (opt as HTMLOptionElement).value);
    expect(typeOptions).toEqual(["expense", "income"]);
  });

  it("adds active income & expense recurring rules with custom dayOfMonth, runs engine, and updates Available Funds & Activity Feed", async () => {
    await setup({ now: () => new Date("2026-06-15T14:30:00.000Z") });

    const slot = getSlot();
    const details = slot.querySelector(
      "details.budget-recurring-details",
    ) as HTMLDetailsElement;
    details.open = true;

    const form = details.querySelector(
      "form.budget-recurring-add-form",
    ) as HTMLFormElement;
    const typeSelect = form.querySelector(
      "#recurring-add-type",
    ) as HTMLSelectElement;
    const nameInput = form.querySelector(
      "#recurring-add-name",
    ) as HTMLInputElement;
    const amountInput = form.querySelector(
      "#recurring-add-amount",
    ) as HTMLInputElement;
    const dayInput = form.querySelector(
      "#recurring-add-day",
    ) as HTMLInputElement;
    const activeCheckbox = form.querySelector(
      "#recurring-add-active",
    ) as HTMLInputElement;

    // 1. Active monthly income on day 5 ($3,000.00 -> due on June 5, posts immediately)
    typeSelect.value = "income";
    nameInput.value = "Monthly Salary";
    amountInput.value = "3000.00";
    dayInput.value = "5";
    activeCheckbox.checked = true;

    const ev1 = submitForm(form);
    expect(ev1.defaultPrevented).toBe(true);
    await flushAsync();

    // 2. Active monthly expense on day 1 ($1,250.50 -> due on June 1, posts immediately)
    typeSelect.value = "expense";
    nameInput.value = "Apartment Rent";
    amountInput.value = "1250.50";
    dayInput.value = "1";
    activeCheckbox.checked = true;

    const ev2 = submitForm(form);
    expect(ev2.defaultPrevented).toBe(true);
    await flushAsync();

    // Form resets after submit
    expect(typeSelect.value).toBe("expense");
    expect(nameInput.value).toBe("");
    expect(amountInput.value).toBe("");
    expect(dayInput.value).toBe("1");
    expect(activeCheckbox.checked).toBe(true);

    // Count badge & rule items updated
    const countBadge = details.querySelector(
      ".budget-recurring-count",
    ) as HTMLElement;
    expect(countBadge.textContent).toBe("2");

    const items = Array.from(
      details.querySelectorAll(".budget-recurring-item"),
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Monthly Salary");
    expect(items[0]?.textContent).toContain("$3,000.00");
    expect(items[0]?.textContent).toContain("Monthly · Day 5");
    expect(items[0]?.textContent).toContain("Active");
    expect(items[1]?.textContent).toContain("Apartment Rent");
    expect(items[1]?.textContent).toContain("$1,250.50");
    expect(items[1]?.textContent).toContain("Monthly · Day 1");
    expect(items[1]?.textContent).toContain("Active");

    // Available Funds & Activity Feed synchronized: 3000.00 - 1250.50 = 1749.50
    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("$1,749.50");
    expect(onUserWrite).toHaveBeenCalledTimes(2);

    const feedItems = shell.panels.budget.querySelectorAll(".budget-feed-item");
    expect(feedItems).toHaveLength(2);
  });

  it("shows accessible role='alert' validation errors on empty name, invalid amount, and out-of-range dayOfMonth without mutating storage", async () => {
    await setup();

    const form = getSlot().querySelector(
      "form.budget-recurring-add-form",
    ) as HTMLFormElement;
    const nameInput = form.querySelector(
      "#recurring-add-name",
    ) as HTMLInputElement;
    const amountInput = form.querySelector(
      "#recurring-add-amount",
    ) as HTMLInputElement;
    const dayInput = form.querySelector(
      "#recurring-add-day",
    ) as HTMLInputElement;
    const errorEl = form.querySelector("#recurring-add-error") as HTMLElement;

    // 1. Empty name
    nameInput.value = "   ";
    amountInput.value = "50.00";
    dayInput.value = "1";
    submitForm(form);
    await flushAsync();

    expect(errorEl.hidden).toBe(false);
    expect(errorEl.getAttribute("role")).toBe("alert");
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(nameInput.getAttribute("aria-describedby")).toBe(
      "recurring-add-error",
    );

    // 2. Invalid amount (sub-cent / negative)
    nameInput.value = "Gym";
    amountInput.value = "-15.999";
    dayInput.value = "1";
    submitForm(form);
    await flushAsync();

    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toContain("Invalid amount");
    expect(amountInput.getAttribute("aria-invalid")).toBe("true");
    expect(nameInput.getAttribute("aria-invalid")).toBeNull();

    // 3. Out-of-range dayOfMonth (0, 32, fractional)
    amountInput.value = "15.00";
    for (const badDay of ["0", "32", "1.5", ""]) {
      dayInput.value = badDay;
      submitForm(form);
      await flushAsync();

      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain("Invalid day of month");
      expect(dayInput.getAttribute("aria-invalid")).toBe("true");
    }

    expect(await budget.listRules()).toHaveLength(0);
    expect(await budget.listActivities()).toHaveLength(0);
    expect(onUserWrite).not.toHaveBeenCalled();
  });

  it("edits an existing rule via <dialog> modal without altering prior posted activities and restores focus on cancel", async () => {
    await setup({ now: () => new Date("2026-06-15T14:30:00.000Z") });

    const created = await budget.addRule({
      name: "Internet",
      type: "expense",
      amountCents: 7500,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
    });
    await budget.runRecurringEngine();
    await budgetController.refresh();

    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("-$75.00");

    const slot = getSlot();
    const details = slot.querySelector(
      "details.budget-recurring-details",
    ) as HTMLDetailsElement;
    details.open = true;

    const editBtn = slot.querySelector(
      ".budget-rule-edit-btn",
    ) as HTMLButtonElement;
    editBtn.click();

    const editDialog = slot.querySelector(
      "dialog.budget-rule-edit-dialog",
    ) as HTMLDialogElement;
    expect(editDialog.open).toBe(true);

    // System-managed fields must never be present in the edit modal
    expect(editDialog.querySelector('[name="id"]')).toBeNull();
    expect(editDialog.querySelector('[name="lastPostPeriod"]')).toBeNull();
    expect(editDialog.querySelector('[name="createdAt"]')).toBeNull();
    expect(editDialog.querySelector('[name="updatedAt"]')).toBeNull();

    // Cancel first and verify focus restoration + unchanged data
    const cancelBtn = editDialog.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    cancelBtn.click();
    await flushAsync();

    expect(editDialog.open).toBe(false);
    expect(document.activeElement).toBe(editBtn);
    expect(onUserWrite).not.toHaveBeenCalled();

    // Re-open and save updated values
    editBtn.click();
    expect(editDialog.open).toBe(true);

    const editForm = editDialog.querySelector("form") as HTMLFormElement;
    const typeSelect = editForm.querySelector(
      "#recurring-edit-type",
    ) as HTMLSelectElement;
    const nameInput = editForm.querySelector(
      "#recurring-edit-name",
    ) as HTMLInputElement;
    const amountInput = editForm.querySelector(
      "#recurring-edit-amount",
    ) as HTMLInputElement;
    const dayInput = editForm.querySelector(
      "#recurring-edit-day",
    ) as HTMLInputElement;

    expect(typeSelect.value).toBe("expense");
    expect(nameInput.value).toBe("Internet");
    expect(amountInput.value).toBe("75.00");
    expect(dayInput.value).toBe("1");

    nameInput.value = "Fiber Internet";
    amountInput.value = "95.25";
    dayInput.value = "10";

    const ev = submitForm(editForm);
    expect(ev.defaultPrevented).toBe(true);
    await flushAsync();

    expect(editDialog.open).toBe(false);
    expect(onUserWrite).toHaveBeenCalledTimes(1);

    // Rule is updated
    const updatedRules = await budget.listRules();
    expect(updatedRules).toHaveLength(1);
    expect(updatedRules[0]?.id).toBe(created.id);
    expect(updatedRules[0]?.name).toBe("Fiber Internet");
    expect(updatedRules[0]?.amountCents).toBe(9525);
    expect(updatedRules[0]?.schedule.dayOfMonth).toBe(10);

    // Prior posted activity is untouched (still $75.00)
    const activities = await budget.listActivities();
    expect(activities).toHaveLength(1);
    expect(activities[0]?.amountCents).toBe(7500);
    expect(fundsEl.textContent).toBe("-$75.00");
  });

  it("formats large safe-integer cent amounts in Edit modal without float64 precision loss", async () => {
    await setup();

    await budget.addRule({
      name: "Large Safe Amount",
      type: "income",
      amountCents: 9007199254740991,
      schedule: { cadence: "monthly", dayOfMonth: 28 },
      active: false,
    });
    await budgetController.refresh();

    const slot = getSlot();
    const editBtn = slot.querySelector(
      ".budget-rule-edit-btn",
    ) as HTMLButtonElement;
    editBtn.click();

    const amountInput = slot.querySelector(
      "#recurring-edit-amount",
    ) as HTMLInputElement;
    expect(amountInput.value).toBe("90071992547409.91");
  });

  it("toggles Pause and Resume via setRuleActive, preserving posted history and posting due periods on resume", async () => {
    await setup({ now: () => new Date("2026-06-15T14:30:00.000Z") });

    // Start with a paused rule due on day 1
    await budget.addRule({
      name: "Streaming",
      type: "expense",
      amountCents: 1999,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: false,
    });
    await budgetController.refresh();

    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("$0.00");
    expect(await budget.listActivities()).toHaveLength(0);

    const slot = getSlot();
    let toggleBtn = slot.querySelector(
      ".budget-rule-toggle-btn",
    ) as HTMLButtonElement;
    expect(toggleBtn.textContent).toBe("Resume");

    // 1. Resume -> becomes Active, runs recurring engine, posts June period
    toggleBtn.click();
    await flushAsync();

    expect((await budget.listRules())[0]?.active).toBe(true);
    expect(await budget.listActivities()).toHaveLength(1);
    expect(fundsEl.textContent).toBe("-$19.99");
    expect(onUserWrite).toHaveBeenCalledTimes(1);

    toggleBtn = slot.querySelector(
      ".budget-rule-toggle-btn",
    ) as HTMLButtonElement;
    expect(toggleBtn.textContent).toBe("Pause");
    expect(slot.textContent).toContain("Active");

    // 2. Pause -> becomes Paused, preserves previously auto-posted activity
    toggleBtn.click();
    await flushAsync();

    expect((await budget.listRules())[0]?.active).toBe(false);
    expect(await budget.listActivities()).toHaveLength(1);
    expect(fundsEl.textContent).toBe("-$19.99");
    expect(onUserWrite).toHaveBeenCalledTimes(2);
    expect(slot.textContent).toContain("Paused");
  });

  it("deletes a rule only after shell confirmation and preserves previously auto-posted activities", async () => {
    await setup({ now: () => new Date("2026-06-15T14:30:00.000Z") });

    await budget.addRule({
      name: "Cloud Storage",
      type: "expense",
      amountCents: 999,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
    });
    await budget.runRecurringEngine();
    await budgetController.refresh();

    const fundsEl = shell.panels.budget.querySelector(
      "#budget-available-funds",
    ) as HTMLElement;
    expect(fundsEl.textContent).toBe("-$9.99");

    const slot = getSlot();
    const details = slot.querySelector(
      "details.budget-recurring-details",
    ) as HTMLDetailsElement;
    details.open = true;

    const deleteBtn = slot.querySelector(
      ".budget-rule-delete-btn",
    ) as HTMLButtonElement;

    // 1. Click Delete, verify confirmation copy, then Cancel
    deleteBtn.click();
    await flushAsync();

    expect(shell.dialog.open).toBe(true);
    expect(shell.dialog.textContent).toContain("Cloud Storage");
    expect(shell.dialog.textContent).toContain(
      "Previously auto-posted activities remain in the activity log",
    );

    (
      shell.dialog.querySelector(".confirm-dialog-cancel") as HTMLButtonElement
    ).click();
    await flushAsync();

    expect(shell.dialog.open).toBe(false);
    expect(await budget.listRules()).toHaveLength(1);
    expect(await budget.listActivities()).toHaveLength(1);
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
    expect(await budget.listRules()).toHaveLength(0);
    // Previously auto-posted activity and Available Funds MUST remain intact
    expect(await budget.listActivities()).toHaveLength(1);
    expect(fundsEl.textContent).toBe("-$9.99");
    expect(onUserWrite).toHaveBeenCalledTimes(1);

    const countBadge = slot.querySelector(
      ".budget-recurring-count",
    ) as HTMLElement;
    expect(countBadge.textContent).toBe("0");

    // Focus returns safely to <summary> after row deletion
    const summaryEl = slot.querySelector(
      "summary.budget-recurring-summary",
    ) as HTMLElement;
    expect(document.activeElement).toBe(summaryEl);
  });

  it("handles deleteRule and setRuleActive failures gracefully with inline role='alert' feedback", async () => {
    await setup();

    await budget.addRule({
      name: "Utilities",
      type: "expense",
      amountCents: 8000,
      schedule: { cadence: "monthly", dayOfMonth: 28 },
      active: false,
    });
    await budgetController.refresh();

    const slot = getSlot();
    const panelErrorEl = slot.querySelector(
      "#recurring-panel-error",
    ) as HTMLElement;

    const toggleSpy = vi
      .spyOn(budget, "setRuleActive")
      .mockRejectedValueOnce(new Error("Storage write failed"));

    const toggleBtn = slot.querySelector(
      ".budget-rule-toggle-btn",
    ) as HTMLButtonElement;
    toggleBtn.click();
    await flushAsync();

    expect(panelErrorEl.hidden).toBe(false);
    expect(panelErrorEl.getAttribute("role")).toBe("alert");
    expect(panelErrorEl.textContent).toContain("Storage write failed");
    toggleSpy.mockRestore();

    const deleteSpy = vi
      .spyOn(budget, "deleteRule")
      .mockRejectedValueOnce(new Error("Delete failed"));

    const deleteBtn = slot.querySelector(
      ".budget-rule-delete-btn",
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushAsync();
    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await flushAsync();

    expect(panelErrorEl.hidden).toBe(false);
    expect(panelErrorEl.textContent).toContain("Delete failed");
    deleteSpy.mockRestore();
  });

  it("renders DOM XSS payloads in rule name strictly as inert literal text", async () => {
    await setup({ now: () => new Date("2026-06-15T14:30:00.000Z") });

    const imgPayload = "<img src=x onerror=window.__xss=1>";
    const scriptPayload = "<script>window.__xss=1</script>";

    const form = getSlot().querySelector(
      "form.budget-recurring-add-form",
    ) as HTMLFormElement;
    (form.querySelector("#recurring-add-name") as HTMLInputElement).value =
      `${imgPayload} ${scriptPayload}`;
    (form.querySelector("#recurring-add-amount") as HTMLInputElement).value =
      "25.00";
    (form.querySelector("#recurring-add-day") as HTMLInputElement).value = "1";

    submitForm(form);
    await flushAsync();

    expect(shell.panels.budget.querySelectorAll("img")).toHaveLength(0);
    expect(shell.panels.budget.querySelectorAll("script")).toHaveLength(0);
    expect(
      (window as unknown as Record<string, unknown>).__xss,
    ).toBeUndefined();

    const nameEl = getSlot().querySelector(
      ".budget-recurring-name",
    ) as HTMLElement;
    expect(nameEl.textContent).toBe(`${imgPayload} ${scriptPayload}`);

    // Opening delete confirmation also renders the payload strictly as inert text
    const deleteBtn = getSlot().querySelector(
      ".budget-rule-delete-btn",
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushAsync();

    expect(shell.dialog.querySelectorAll("img")).toHaveLength(0);
    expect(shell.dialog.querySelectorAll("script")).toHaveLength(0);
    expect(shell.dialog.textContent).toContain(
      `${imgPayload} ${scriptPayload}`,
    );
  });
});
