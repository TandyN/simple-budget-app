/**
 * Collapsible Recurring Rules panel UI controller (`src/ui/recurringRules.ts`).
 *
 * Implements the Recurring Rules management surface inside the Budget tab
 * (`project-plan/frontend.md → Recurring income / expense (req 5)`):
 * - Collapsible native `<details>` / `<summary>` disclosure (`>= 44×44 CSS px`
 *   touch target) labeled "Recurring Rules" with a live rule-count badge so
 *   folded viewports stay compact while giving one-tap access.
 * - Rule list (`budget.listRules()`): displays each rule's `name`, `type`
 *   (`income` | `expense`), formatted amount (`formatCents`), schedule
 *   (`Monthly · Day <dayOfMonth>`), and status (`Active` / `Paused`), plus
 *   `>= 44×44 CSS px` Edit, Pause/Resume, and Delete buttons.
 * - Add Rule form (`type`, `name`, `amount`, `dayOfMonth` 1–31, `active`):
 *   calls `event.preventDefault()` (CSP `form-action 'none'`), validates with
 *   inline `role="alert"` feedback, creates the rule via `budget.addRule(...)`,
 *   runs `budget.runRecurringEngine()` so any currently due period posts
 *   immediately, resets the form, and refreshes both panels.
 * - Edit Rule modal (`<dialog class="budget-rule-edit-dialog">`): opens via
 *   `showModal()`, exposes only user-editable `RecurringRule` fields (`type`,
 *   `name`, `amount`, `dayOfMonth`, `active` — never system-managed fields),
 *   guards against async stale `close` events (`if (dialog.open) return`), and
 *   restores focus on close.
 * - Pause / Resume toggle (`budget.setRuleActive`) and Delete confirmation via
 *   the shell's native `<dialog>` `confirm(...)` handle, preserving all
 *   previously auto-posted activities.
 *
 * Built exclusively with `./dom` safe DOM helpers (`el`, `text`, `setAttrs`,
 * `replaceChildren`) so all user-controlled strings render strictly as inert
 * text nodes. Zero production dependencies.
 */

import type { BudgetApi } from "../budgetApi";
import type { RecurringRule, RuleType } from "../core/types";
import { validateRuleName } from "../core/validate";
import { el, replaceChildren, setAttrs, text } from "./dom";
import {
  formatCents,
  formatCentsForInput,
  parseDecimalInputToCents,
} from "./format";
import type { ShellHandle } from "./shell";

const RULE_TYPES: readonly RuleType[] = ["expense", "income"];
const INTEGER_INPUT_RE = /^\d+$/;

/** Options accepted by `mountRecurringRules`. */
export interface MountRecurringRulesOptions {
  /** Target slot element inside the Budget tab (e.g. `[data-slot="recurring-rules"]`). */
  readonly container: HTMLElement;
  /** Public `BudgetApi` instance. */
  readonly budget: BudgetApi;
  /** Shell's promise-based native `<dialog>` confirmation prompt. */
  readonly confirm: ShellHandle["confirm"];
  /** Optional callback invoked after any successful local write. */
  readonly onUserWrite?: () => void;
  /** Callback invoked after a rule mutation so the Budget tab refreshes Available Funds & Activity Feed. */
  readonly onChanged: () => Promise<void>;
}

/** Controller returned by `mountRecurringRules`. */
export interface RecurringRulesController {
  /** Re-queries `budget.listRules()` and updates the Recurring Rules list and count badge. */
  refresh(): Promise<void>;
}

function isRuleType(value: string): value is RuleType {
  return value === "expense" || value === "income";
}

function labelForRuleType(type: RuleType): string {
  return type === "expense" ? "Expense" : "Income";
}

function parseDayOfMonthInput(raw: string): number {
  const trimmed = raw.trim();
  if (!INTEGER_INPUT_RE.test(trimmed)) {
    throw new Error("Invalid day of month: enter an integer between 1 and 31");
  }
  const day = Number(trimmed);
  if (!Number.isSafeInteger(day) || day < 1 || day > 31) {
    throw new Error("Invalid day of month: must be between 1 and 31");
  }
  return day;
}

function createRuleTypeSelect(id: string): HTMLSelectElement {
  const select = el(
    "select",
    {
      id,
      name: "type",
      class: "budget-input budget-select",
    },
    RULE_TYPES.map((t) =>
      el("option", { value: t }, [text(labelForRuleType(t))]),
    ),
  ) as HTMLSelectElement;
  select.value = "expense";
  return select;
}

function createField(
  labelText: string,
  inputId: string,
  control: HTMLElement,
): HTMLElement {
  const label = el("label", { for: inputId, class: "budget-label" }, [
    text(labelText),
  ]);
  return el("div", { class: "budget-field" }, [label, control]) as HTMLElement;
}

function clearFormError(
  errorEl: HTMLElement,
  controls: readonly HTMLElement[],
): void {
  replaceChildren(errorEl);
  setAttrs(errorEl, { hidden: "true" });
  for (const control of controls) {
    setAttrs(control, {
      "aria-invalid": null,
      "aria-describedby": null,
    });
  }
}

function showFormError(
  errorEl: HTMLElement,
  message: string,
  invalidControl?: HTMLElement,
): void {
  replaceChildren(errorEl, text(message));
  setAttrs(errorEl, { hidden: null });
  if (invalidControl !== undefined) {
    setAttrs(invalidControl, {
      "aria-invalid": "true",
      "aria-describedby": errorEl.id,
    });
    invalidControl.focus();
  }
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return "An unexpected error occurred. Please check your input and try again.";
}

/**
 * Mounts the collapsible Recurring Rules panel into `options.container` and
 * returns a `RecurringRulesController` whose `refresh()` method re-reads rules
 * from `BudgetApi`.
 */
export function mountRecurringRules(
  options: MountRecurringRulesOptions,
): RecurringRulesController {
  const { container, budget, confirm, onUserWrite, onChanged } = options;

  // ---------------------------------------------------------------------------
  // 1. Collapsible <details> / <summary> Header with Count Badge
  // ---------------------------------------------------------------------------
  const countBadgeEl = el(
    "span",
    {
      class: "budget-recurring-count",
      "aria-label": "0 rules",
    },
    [text("0")],
  ) as HTMLElement;

  const summaryEl = el("summary", { class: "budget-recurring-summary" }, [
    el("span", { class: "budget-recurring-summary-label" }, [
      text("Recurring Rules"),
    ]),
    countBadgeEl,
  ]) as HTMLElement;

  const panelErrorEl = el("div", {
    id: "recurring-panel-error",
    class: "budget-form-error",
    role: "alert",
    "aria-live": "assertive",
    hidden: "true",
  }) as HTMLElement;

  function clearPanelError(): void {
    replaceChildren(panelErrorEl);
    setAttrs(panelErrorEl, { hidden: "true" });
  }

  function showPanelError(message: string): void {
    replaceChildren(panelErrorEl, text(message));
    setAttrs(panelErrorEl, { hidden: null });
  }

  // ---------------------------------------------------------------------------
  // 2. Rules List & Empty State
  // ---------------------------------------------------------------------------
  const emptyEl = el("p", { class: "budget-recurring-empty" }, [
    text("No recurring rules yet. Add a monthly income or expense rule below."),
  ]) as HTMLElement;

  const listEl = el("ul", {
    class: "budget-recurring-list",
    hidden: "true",
  }) as HTMLUListElement;

  // ---------------------------------------------------------------------------
  // 3. Add Recurring Rule Form (CSP form-action 'none' compliant)
  // ---------------------------------------------------------------------------
  const addTypeSelect = createRuleTypeSelect("recurring-add-type");

  const addNameInput = el("input", {
    id: "recurring-add-name",
    name: "name",
    type: "text",
    autocomplete: "off",
    placeholder: "e.g. Monthly Rent, Salary",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;

  const addAmountInput = el("input", {
    id: "recurring-add-amount",
    name: "amount",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    placeholder: "0.00",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;

  const addDayInput = el("input", {
    id: "recurring-add-day",
    name: "dayOfMonth",
    type: "number",
    inputmode: "numeric",
    min: "1",
    max: "31",
    step: "1",
    value: "1",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;
  addDayInput.value = "1";

  const addActiveCheckbox = el("input", {
    id: "recurring-add-active",
    name: "active",
    type: "checkbox",
    checked: "true",
    class: "budget-checkbox",
  }) as HTMLInputElement;
  addActiveCheckbox.checked = true;

  const addActiveRow = el(
    "label",
    {
      for: "recurring-add-active",
      class: "budget-checkbox-label",
    },
    [addActiveCheckbox, el("span", {}, [text("Active (auto-post monthly)")])],
  ) as HTMLElement;

  const addErrorEl = el("div", {
    id: "recurring-add-error",
    class: "budget-form-error",
    role: "alert",
    "aria-live": "assertive",
    hidden: "true",
  }) as HTMLElement;

  const addSubmitBtn = el(
    "button",
    {
      type: "submit",
      class: "budget-btn budget-btn-primary",
    },
    [text("Add Rule")],
  ) as HTMLButtonElement;

  const addControls: readonly HTMLElement[] = [
    addTypeSelect,
    addNameInput,
    addAmountInput,
    addDayInput,
    addActiveCheckbox,
  ];

  const addForm = el(
    "form",
    {
      class: "budget-form budget-recurring-add-form",
      novalidate: "true",
    },
    [
      el("h3", { class: "budget-subsection-title" }, [
        text("Add Recurring Rule"),
      ]),
      el("div", { class: "budget-form-row" }, [
        createField("Type", "recurring-add-type", addTypeSelect),
        createField("Amount", "recurring-add-amount", addAmountInput),
      ]),
      createField("Rule Name", "recurring-add-name", addNameInput),
      createField("Day of Month (1–31)", "recurring-add-day", addDayInput),
      addActiveRow,
      addErrorEl,
      el("div", { class: "budget-form-actions" }, [addSubmitBtn]),
    ],
  ) as HTMLFormElement;

  // ---------------------------------------------------------------------------
  // 4. Native <dialog> Edit Rule Modal
  // ---------------------------------------------------------------------------
  const editTypeSelect = createRuleTypeSelect("recurring-edit-type");

  const editNameInput = el("input", {
    id: "recurring-edit-name",
    name: "name",
    type: "text",
    autocomplete: "off",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;

  const editAmountInput = el("input", {
    id: "recurring-edit-amount",
    name: "amount",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;

  const editDayInput = el("input", {
    id: "recurring-edit-day",
    name: "dayOfMonth",
    type: "number",
    inputmode: "numeric",
    min: "1",
    max: "31",
    step: "1",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;

  const editActiveCheckbox = el("input", {
    id: "recurring-edit-active",
    name: "active",
    type: "checkbox",
    class: "budget-checkbox",
  }) as HTMLInputElement;

  const editActiveRow = el(
    "label",
    {
      for: "recurring-edit-active",
      class: "budget-checkbox-label",
    },
    [editActiveCheckbox, el("span", {}, [text("Active (auto-post monthly)")])],
  ) as HTMLElement;

  const editErrorEl = el("div", {
    id: "recurring-edit-error",
    class: "budget-form-error",
    role: "alert",
    "aria-live": "assertive",
    hidden: "true",
  }) as HTMLElement;

  const editCancelBtn = el(
    "button",
    {
      type: "button",
      class: "budget-btn budget-btn-secondary",
    },
    [text("Cancel")],
  ) as HTMLButtonElement;

  const editSaveBtn = el(
    "button",
    {
      type: "submit",
      class: "budget-btn budget-btn-primary",
    },
    [text("Save Rule")],
  ) as HTMLButtonElement;

  const editControls: readonly HTMLElement[] = [
    editTypeSelect,
    editNameInput,
    editAmountInput,
    editDayInput,
    editActiveCheckbox,
  ];

  const editForm = el(
    "form",
    {
      class: "budget-form",
      novalidate: "true",
    },
    [
      el("div", { class: "budget-form-row" }, [
        createField("Type", "recurring-edit-type", editTypeSelect),
        createField("Amount", "recurring-edit-amount", editAmountInput),
      ]),
      createField("Rule Name", "recurring-edit-name", editNameInput),
      createField("Day of Month (1–31)", "recurring-edit-day", editDayInput),
      editActiveRow,
      editErrorEl,
      el("div", { class: "budget-dialog-actions" }, [
        editCancelBtn,
        editSaveBtn,
      ]),
    ],
  ) as HTMLFormElement;

  const editDialog = el(
    "dialog",
    {
      class: "budget-rule-edit-dialog",
      "aria-labelledby": "budget-rule-edit-dialog-title",
    },
    [
      el(
        "h2",
        {
          id: "budget-rule-edit-dialog-title",
          class: "budget-dialog-title",
        },
        [text("Edit Recurring Rule")],
      ),
      editForm,
    ],
  ) as HTMLDialogElement;

  let editingRuleId: string | null = null;
  let editInvoker: HTMLElement | null = null;
  let focusRuleIdAfterClose: string | null = null;

  function findRuleButton(
    selector: string,
    ruleId: string,
  ): HTMLElement | null {
    const buttons = listEl.querySelectorAll(selector);
    for (const btn of buttons) {
      if (btn.getAttribute("data-rule-id") === ruleId) {
        return btn as HTMLElement;
      }
    }
    return null;
  }

  function openEditDialog(rule: RecurringRule, invoker: HTMLElement): void {
    editingRuleId = rule.id;
    editInvoker = invoker;
    focusRuleIdAfterClose = null;

    clearFormError(editErrorEl, editControls);
    editTypeSelect.value = rule.type;
    editNameInput.value = rule.name;
    editAmountInput.value = formatCentsForInput(rule.amountCents);
    editDayInput.value = String(rule.schedule.dayOfMonth);
    editActiveCheckbox.checked = rule.active;

    if (!editDialog.open) {
      editDialog.showModal();
    }
  }

  editCancelBtn.addEventListener("click", () => {
    if (editDialog.open) {
      editDialog.close();
    }
  });

  // Per HTML Living Standard, `dialog.close()` queues `close` asynchronously.
  // Ignore stale `close` events if the dialog was already re-opened.
  editDialog.addEventListener("close", () => {
    if (editDialog.open) {
      return;
    }

    const invoker = editInvoker;
    const savedId = focusRuleIdAfterClose;

    editingRuleId = null;
    editInvoker = null;
    focusRuleIdAfterClose = null;

    if (savedId !== null) {
      const refreshedBtn = findRuleButton(
        "button.budget-rule-edit-btn",
        savedId,
      );
      if (refreshedBtn?.isConnected) {
        refreshedBtn.focus();
        return;
      }
    }
    if (invoker?.isConnected) {
      invoker.focus();
    } else if (summaryEl.isConnected) {
      summaryEl.focus();
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Render Rule Items & Refresh
  // ---------------------------------------------------------------------------
  let refreshSeq = 0;

  function renderRuleItem(rule: RecurringRule): HTMLLIElement {
    const typeLabel = labelForRuleType(rule.type);
    const statusLabel = rule.active ? "Active" : "Paused";
    const formattedAmount = formatCents(rule.amountCents, rule.currency);
    const scheduleLabel = `Monthly · Day ${rule.schedule.dayOfMonth}`;

    const nameEl = el("h3", { class: "budget-recurring-name" }, [
      text(rule.name),
    ]);

    const amountEl = el(
      "span",
      {
        class: `budget-recurring-amount budget-feed-amount--${rule.type}`,
      },
      [text(formattedAmount)],
    );

    const topRow = el("div", { class: "budget-recurring-top" }, [
      nameEl,
      amountEl,
    ]);

    const metaRow = el("div", { class: "budget-recurring-meta" }, [
      el("span", { class: `budget-badge budget-badge--${rule.type}` }, [
        text(typeLabel),
      ]),
      el(
        "span",
        {
          class: `budget-badge budget-badge--status-${rule.active ? "active" : "paused"}`,
        },
        [text(statusLabel)],
      ),
      el("span", { class: "budget-recurring-schedule" }, [text(scheduleLabel)]),
    ]);

    const editBtn = el(
      "button",
      {
        type: "button",
        class: "budget-btn budget-btn-secondary budget-rule-edit-btn",
        "data-rule-id": rule.id,
        "aria-label": `Edit ${rule.name}`,
      },
      [text("Edit")],
    ) as HTMLButtonElement;

    const toggleLabel = rule.active ? "Pause" : "Resume";
    const toggleBtn = el(
      "button",
      {
        type: "button",
        class: "budget-btn budget-btn-secondary budget-rule-toggle-btn",
        "data-rule-id": rule.id,
        "aria-label": `${toggleLabel} ${rule.name}`,
      },
      [text(toggleLabel)],
    ) as HTMLButtonElement;

    const deleteBtn = el(
      "button",
      {
        type: "button",
        class: "budget-btn budget-btn-danger budget-rule-delete-btn",
        "data-rule-id": rule.id,
        "aria-label": `Delete ${rule.name}`,
      },
      [text("Delete")],
    ) as HTMLButtonElement;

    editBtn.addEventListener("click", () => {
      clearPanelError();
      openEditDialog(rule, editBtn);
    });

    toggleBtn.addEventListener("click", async () => {
      clearPanelError();
      const nextActive = !rule.active;
      try {
        await budget.setRuleActive(rule.id, nextActive);
        onUserWrite?.();
        if (nextActive) {
          await budget.runRecurringEngine();
        }
        await refresh();
        await onChanged();
      } catch (err) {
        showPanelError(extractErrorMessage(err));
        if (toggleBtn.isConnected) {
          toggleBtn.focus();
        } else if (summaryEl.isConnected) {
          summaryEl.focus();
        }
        return;
      }

      const refreshedToggle = findRuleButton(
        "button.budget-rule-toggle-btn",
        rule.id,
      );
      if (refreshedToggle?.isConnected) {
        refreshedToggle.focus();
      } else if (summaryEl.isConnected) {
        summaryEl.focus();
      }
    });

    deleteBtn.addEventListener("click", async () => {
      clearPanelError();
      const confirmed = await confirm({
        title: "Delete recurring rule",
        message: `Delete "${rule.name}"? Previously auto-posted activities remain in the activity log.`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        invoker: deleteBtn,
      });
      if (!confirmed) {
        return;
      }

      try {
        await budget.deleteRule(rule.id);
        onUserWrite?.();
        await refresh();
        await onChanged();
      } catch (err) {
        showPanelError(extractErrorMessage(err));
        if (deleteBtn.isConnected) {
          deleteBtn.focus();
        } else if (summaryEl.isConnected) {
          summaryEl.focus();
        }
        return;
      }

      if (summaryEl.isConnected) {
        summaryEl.focus();
      }
    });

    const actionsRow = el("div", { class: "budget-recurring-actions" }, [
      editBtn,
      toggleBtn,
      deleteBtn,
    ]);

    return el(
      "li",
      {
        class: "budget-recurring-item",
        "data-rule-id": rule.id,
      },
      [topRow, metaRow, actionsRow],
    ) as HTMLLIElement;
  }

  async function refresh(): Promise<void> {
    const seq = ++refreshSeq;
    const rules = await budget.listRules();
    if (seq !== refreshSeq) {
      return;
    }

    const count = rules.length;
    replaceChildren(countBadgeEl, text(String(count)));
    setAttrs(countBadgeEl, {
      "aria-label": `${count} ${count === 1 ? "rule" : "rules"}`,
    });

    if (count === 0) {
      replaceChildren(listEl);
      setAttrs(listEl, { hidden: "true" });
      setAttrs(emptyEl, { hidden: null });
      return;
    }

    replaceChildren(listEl, ...rules.map(renderRuleItem));
    setAttrs(listEl, { hidden: null });
    setAttrs(emptyEl, { hidden: "true" });
  }

  // ---------------------------------------------------------------------------
  // 6. Form Submit Handlers (CSP form-action 'none' compliant)
  // ---------------------------------------------------------------------------
  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError(addErrorEl, addControls);
    clearPanelError();

    const rawType = addTypeSelect.value;
    if (!isRuleType(rawType)) {
      showFormError(
        addErrorEl,
        "Select a valid rule type (expense or income).",
        addTypeSelect,
      );
      return;
    }

    let validName: string;
    try {
      validName = validateRuleName(addNameInput.value.trim(), "name");
    } catch (err) {
      showFormError(addErrorEl, extractErrorMessage(err), addNameInput);
      return;
    }

    let amountCents: number;
    try {
      amountCents = parseDecimalInputToCents(addAmountInput.value);
    } catch (err) {
      showFormError(addErrorEl, extractErrorMessage(err), addAmountInput);
      return;
    }

    let dayOfMonth: number;
    try {
      dayOfMonth = parseDayOfMonthInput(addDayInput.value);
    } catch (err) {
      showFormError(addErrorEl, extractErrorMessage(err), addDayInput);
      return;
    }

    const active = addActiveCheckbox.checked;

    try {
      await budget.addRule({
        name: validName,
        type: rawType,
        amountCents,
        schedule: { cadence: "monthly", dayOfMonth },
        active,
      });
      onUserWrite?.();
      if (active) {
        await budget.runRecurringEngine();
      }
    } catch (err) {
      showFormError(addErrorEl, extractErrorMessage(err));
      return;
    }

    addTypeSelect.value = "expense";
    addNameInput.value = "";
    addAmountInput.value = "";
    addDayInput.value = "1";
    addActiveCheckbox.checked = true;

    await refresh();
    await onChanged();
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError(editErrorEl, editControls);

    const targetId = editingRuleId;
    if (targetId === null) {
      return;
    }

    const rawType = editTypeSelect.value;
    if (!isRuleType(rawType)) {
      showFormError(
        editErrorEl,
        "Select a valid rule type (expense or income).",
        editTypeSelect,
      );
      return;
    }

    let validName: string;
    try {
      validName = validateRuleName(editNameInput.value.trim(), "name");
    } catch (err) {
      showFormError(editErrorEl, extractErrorMessage(err), editNameInput);
      return;
    }

    let amountCents: number;
    try {
      amountCents = parseDecimalInputToCents(editAmountInput.value);
    } catch (err) {
      showFormError(editErrorEl, extractErrorMessage(err), editAmountInput);
      return;
    }

    let dayOfMonth: number;
    try {
      dayOfMonth = parseDayOfMonthInput(editDayInput.value);
    } catch (err) {
      showFormError(editErrorEl, extractErrorMessage(err), editDayInput);
      return;
    }

    const active = editActiveCheckbox.checked;

    try {
      await budget.editRule(targetId, {
        name: validName,
        type: rawType,
        amountCents,
        schedule: { cadence: "monthly", dayOfMonth },
        active,
      });
      onUserWrite?.();
      if (active) {
        await budget.runRecurringEngine();
      }
      await refresh();
      await onChanged();
    } catch (err) {
      showFormError(editErrorEl, extractErrorMessage(err));
      return;
    }

    focusRuleIdAfterClose = targetId;
    if (editDialog.open) {
      editDialog.close();
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Assemble & Mount
  // ---------------------------------------------------------------------------
  const bodyEl = el("div", { class: "budget-recurring-body" }, [
    panelErrorEl,
    emptyEl,
    listEl,
    addForm,
  ]);

  const detailsEl = el(
    "details",
    { class: "budget-card budget-recurring-details" },
    [summaryEl, bodyEl],
  );

  replaceChildren(container, detailsEl, editDialog);

  void refresh().catch(() => {
    // Callers that explicitly await controller.refresh() observe errors directly.
  });

  return {
    refresh,
  };
}
