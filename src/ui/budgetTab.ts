/**
 * Budget tab core UI controller (`src/ui/budgetTab.ts`).
 *
 * Implements the Budget tab surface (`project-plan/frontend.md`):
 * - Sticky Available Funds hero header (`aria-live="polite"`, `aria-atomic="true"`,
 *   tabular numerals) derived from `budget.getAvailableFunds()`.
 * - Quick-Add manual transaction form (`expense` | `income` | `deposit`),
 *   calling `event.preventDefault()` on submit (CSP `form-action 'none'`),
 *   with accessible inline `role="alert"` validation.
 * - Dedicated Recurring Rules slot (`data-slot="recurring-rules"`) for the
 *   collapsible Recurring Rules panel.
 * - Reverse-chronological Activity Feed displaying manual and recurring-posted
 *   activities with local-timezone formatting, tag chips, and `>= 44x44 CSS px`
 *   Edit / Delete actions.
 * - Native `<dialog>` Edit/Backdate/Tag modal (`showModal()`) exposing only
 *   user-editable fields (`type`, `amount`, `dateTime`, `memo`, `tags`) and
 *   restoring focus on close.
 * - Native `<dialog>` Delete confirmation via the shell's `confirm(...)` handle.
 *
 * Built exclusively with `./dom` safe DOM helpers (`el`, `text`, `setAttrs`,
 * `replaceChildren`) so all user-controlled strings render strictly as inert
 * text nodes. Zero production dependencies.
 */

import type { BudgetApi } from "../budgetApi";
import type { Activity, ActivityType } from "../core/types";
import { el, replaceChildren, setAttrs, text } from "./dom";
import {
  formatCents,
  formatLocalDateTime,
  formatTagsInput,
  fromDateTimeLocalInputValue,
  parseDecimalInputToCents,
  parseTagsInput,
  toDateTimeLocalInputValue,
} from "./format";
import type { ShellHandle } from "./shell";

const ACTIVITY_TYPES: readonly ActivityType[] = [
  "expense",
  "income",
  "deposit",
];

/** Options accepted by `mountBudgetTab`. */
export interface MountBudgetTabOptions {
  /** Target container element (e.g. `#panel-budget`). */
  readonly container: HTMLElement;
  /** Public `BudgetApi` instance. */
  readonly budget: BudgetApi;
  /** Shell's promise-based native `<dialog>` confirmation prompt. */
  readonly confirm: ShellHandle["confirm"];
  /** Optional callback invoked after any successful local write (e.g. BroadcastChannel sync). */
  readonly onUserWrite?: () => void;
  /**
   * Optional mount hook for the collapsible Recurring Rules panel inside the
   * Budget primary pane.
   */
  readonly renderRecurringSlot?: (
    slot: HTMLElement,
    onChanged: () => Promise<void>,
  ) => void;
  /** Optional clock factory for defaulting Quick-Add date/time (injectable for tests). */
  readonly now?: () => Date;
}

/** Controller returned by `mountBudgetTab`. */
export interface BudgetTabController {
  /** Re-queries Available Funds and Activity Feed from `BudgetApi` and updates the DOM. */
  refresh(): Promise<void>;
}

function isActivityType(value: string): value is ActivityType {
  return value === "expense" || value === "income" || value === "deposit";
}

function labelForType(type: ActivityType): string {
  switch (type) {
    case "expense":
      return "Expense";
    case "income":
      return "Income";
    case "deposit":
      return "Deposit";
  }
}

function labelForSource(source: Activity["source"]): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "recurring":
      return "Recurring";
    case "file-import":
      return "Imported";
    case "bank-sync":
      return "Synced";
  }
}

function formatCentsForInput(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

function compareActivitiesNewestFirst(a: Activity, b: Activity): number {
  const dtDiff = Date.parse(b.dateTime) - Date.parse(a.dateTime);
  if (dtDiff !== 0) {
    return dtDiff;
  }
  const createdDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return b.id.localeCompare(a.id);
}

function createTypeSelect(id: string): HTMLSelectElement {
  const select = el(
    "select",
    {
      id,
      name: "type",
      class: "budget-input budget-select",
    },
    ACTIVITY_TYPES.map((t) =>
      el("option", { value: t }, [text(labelForType(t))]),
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
 * Mounts the Budget tab core UI into `options.container` and returns a
 * `BudgetTabController` whose `refresh()` method re-reads Available Funds and
 * the Activity Feed from `BudgetApi`.
 */
export function mountBudgetTab(
  options: MountBudgetTabOptions,
): BudgetTabController {
  const { container, budget, confirm, onUserWrite, renderRecurringSlot } =
    options;
  const getNow = options.now ?? (() => new Date());

  // ---------------------------------------------------------------------------
  // 1. Sticky Available Funds Header
  // ---------------------------------------------------------------------------
  const fundsAmountEl = el(
    "p",
    {
      id: "budget-available-funds",
      class: "budget-funds-amount",
      "aria-live": "polite",
      "aria-atomic": "true",
    },
    [text(formatCents(0))],
  ) as HTMLElement;

  const fundsHeader = el("header", { class: "budget-funds-header" }, [
    el("p", { class: "budget-funds-label" }, [text("Available Funds")]),
    fundsAmountEl,
  ]) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 2. Quick-Add Manual Transaction Form
  // ---------------------------------------------------------------------------
  const quickTypeSelect = createTypeSelect("quick-add-type");
  const quickAmountInput = el("input", {
    id: "quick-add-amount",
    name: "amount",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    placeholder: "0.00",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;

  const quickDateTimeInput = el("input", {
    id: "quick-add-datetime",
    name: "dateTime",
    type: "datetime-local",
    class: "budget-input",
  }) as HTMLInputElement;
  quickDateTimeInput.value = toDateTimeLocalInputValue(getNow().toISOString());

  const quickMemoInput = el("input", {
    id: "quick-add-memo",
    name: "memo",
    type: "text",
    autocomplete: "off",
    placeholder: "Optional note",
    class: "budget-input",
  }) as HTMLInputElement;

  const quickTagsInput = el("input", {
    id: "quick-add-tags",
    name: "tags",
    type: "text",
    autocomplete: "off",
    placeholder: "e.g. groceries, essentials",
    class: "budget-input",
  }) as HTMLInputElement;

  const quickErrorEl = el("div", {
    id: "quick-add-error",
    class: "budget-form-error",
    role: "alert",
    "aria-live": "assertive",
    hidden: "true",
  }) as HTMLElement;

  const quickSubmitBtn = el(
    "button",
    {
      type: "submit",
      class: "budget-btn budget-btn-primary",
    },
    [text("Add Activity")],
  ) as HTMLButtonElement;

  const quickControls: readonly HTMLElement[] = [
    quickTypeSelect,
    quickAmountInput,
    quickDateTimeInput,
    quickMemoInput,
    quickTagsInput,
  ];

  const quickForm = el(
    "form",
    {
      class: "budget-form",
      novalidate: "true",
    },
    [
      el("div", { class: "budget-form-row" }, [
        createField("Type", "quick-add-type", quickTypeSelect),
        createField("Amount", "quick-add-amount", quickAmountInput),
      ]),
      createField("Date & Time", "quick-add-datetime", quickDateTimeInput),
      createField("Memo", "quick-add-memo", quickMemoInput),
      createField("Tags (comma-separated)", "quick-add-tags", quickTagsInput),
      quickErrorEl,
      el("div", { class: "budget-form-actions" }, [quickSubmitBtn]),
    ],
  ) as HTMLFormElement;

  const quickAddSection = el(
    "section",
    {
      class: "budget-card budget-quick-add",
      "aria-labelledby": "budget-quick-add-heading",
    },
    [
      el(
        "h2",
        { id: "budget-quick-add-heading", class: "budget-section-title" },
        [text("Quick Add")],
      ),
      quickForm,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 3. Dedicated Recurring Rules Slot (mounted by Task 3)
  // ---------------------------------------------------------------------------
  const recurringSlot = el("div", {
    class: "budget-recurring-slot",
    "data-slot": "recurring-rules",
  }) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 4. Activity Feed Pane
  // ---------------------------------------------------------------------------
  const feedEmptyEl = el("p", { class: "budget-feed-empty" }, [
    text(
      "No activities yet. Add your first expense, income, or deposit to get started.",
    ),
  ]) as HTMLElement;

  const feedListEl = el("ul", {
    class: "budget-feed-list",
    hidden: "true",
  }) as HTMLUListElement;

  const feedPane = el(
    "section",
    {
      class: "budget-feed-pane",
      "aria-labelledby": "budget-feed-heading",
    },
    [
      el("div", { class: "budget-feed-header" }, [
        el("h2", { id: "budget-feed-heading", class: "budget-section-title" }, [
          text("Activity Feed"),
        ]),
      ]),
      feedEmptyEl,
      feedListEl,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 5. Native <dialog> Edit / Backdate / Tag Modal
  // ---------------------------------------------------------------------------
  const editTypeSelect = createTypeSelect("edit-activity-type");
  const editAmountInput = el("input", {
    id: "edit-activity-amount",
    name: "amount",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;

  const editDateTimeInput = el("input", {
    id: "edit-activity-datetime",
    name: "dateTime",
    type: "datetime-local",
    required: "true",
    class: "budget-input",
  }) as HTMLInputElement;

  const editMemoInput = el("input", {
    id: "edit-activity-memo",
    name: "memo",
    type: "text",
    autocomplete: "off",
    class: "budget-input",
  }) as HTMLInputElement;

  const editTagsInput = el("input", {
    id: "edit-activity-tags",
    name: "tags",
    type: "text",
    autocomplete: "off",
    class: "budget-input",
  }) as HTMLInputElement;

  const editErrorEl = el("div", {
    id: "edit-activity-error",
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
    [text("Save Changes")],
  ) as HTMLButtonElement;

  const editControls: readonly HTMLElement[] = [
    editTypeSelect,
    editAmountInput,
    editDateTimeInput,
    editMemoInput,
    editTagsInput,
  ];

  const editForm = el(
    "form",
    {
      class: "budget-form",
      novalidate: "true",
    },
    [
      el("div", { class: "budget-form-row" }, [
        createField("Type", "edit-activity-type", editTypeSelect),
        createField("Amount", "edit-activity-amount", editAmountInput),
      ]),
      createField("Date & Time", "edit-activity-datetime", editDateTimeInput),
      createField("Memo", "edit-activity-memo", editMemoInput),
      createField(
        "Tags (comma-separated)",
        "edit-activity-tags",
        editTagsInput,
      ),
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
      class: "budget-edit-dialog",
      "aria-labelledby": "budget-edit-dialog-title",
    },
    [
      el(
        "h2",
        { id: "budget-edit-dialog-title", class: "budget-dialog-title" },
        [text("Edit Activity")],
      ),
      editForm,
    ],
  ) as HTMLDialogElement;

  let editingActivityId: string | null = null;
  let editInvoker: HTMLElement | null = null;
  let focusActivityIdAfterClose: string | null = null;

  function findEditButtonForActivity(activityId: string): HTMLElement | null {
    const buttons = feedListEl.querySelectorAll("button.budget-edit-btn");
    for (const btn of buttons) {
      if (btn.getAttribute("data-activity-id") === activityId) {
        return btn as HTMLElement;
      }
    }
    return null;
  }

  function openEditDialog(activity: Activity, invoker: HTMLElement): void {
    editingActivityId = activity.id;
    editInvoker = invoker;
    focusActivityIdAfterClose = null;

    clearFormError(editErrorEl, editControls);
    editTypeSelect.value = activity.type;
    editAmountInput.value = formatCentsForInput(activity.amountCents);
    editDateTimeInput.value = toDateTimeLocalInputValue(activity.dateTime);
    editMemoInput.value = activity.memo ?? "";
    editTagsInput.value = formatTagsInput(activity.tags);

    if (!editDialog.open) {
      editDialog.showModal();
    }
  }

  editCancelBtn.addEventListener("click", () => {
    if (editDialog.open) {
      editDialog.close();
    }
  });

  editDialog.addEventListener("close", () => {
    if (editDialog.open) {
      return;
    }

    const invoker = editInvoker;
    const savedId = focusActivityIdAfterClose;

    editingActivityId = null;
    editInvoker = null;
    focusActivityIdAfterClose = null;

    if (savedId !== null) {
      const refreshedBtn = findEditButtonForActivity(savedId);
      if (refreshedBtn?.isConnected) {
        refreshedBtn.focus();
        return;
      }
    }
    if (invoker?.isConnected) {
      invoker.focus();
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Refresh & Activity Feed Rendering
  // ---------------------------------------------------------------------------
  let refreshSeq = 0;

  function renderActivityItem(activity: Activity): HTMLLIElement {
    const signedCents =
      activity.type === "expense"
        ? -activity.amountCents
        : activity.amountCents;
    const formattedAmount = formatCents(signedCents, activity.currency);
    const formattedDate = formatLocalDateTime(activity.dateTime);
    const typeLabel = labelForType(activity.type);
    const sourceLabel = labelForSource(activity.source);

    const badges = el("div", { class: "budget-feed-badges" }, [
      el("span", { class: `budget-badge budget-badge--${activity.type}` }, [
        text(typeLabel),
      ]),
      el(
        "span",
        { class: `budget-badge budget-badge--source-${activity.source}` },
        [text(sourceLabel)],
      ),
    ]);

    const amountEl = el(
      "span",
      {
        class: `budget-feed-amount budget-feed-amount--${activity.type}`,
      },
      [text(formattedAmount)],
    );

    const topRow = el("div", { class: "budget-feed-top" }, [badges, amountEl]);

    const timeEl = el(
      "time",
      {
        class: "budget-feed-time",
        datetime: activity.dateTime,
      },
      [text(formattedDate)],
    );

    const memoEl =
      activity.memo !== undefined && activity.memo.trim().length > 0
        ? el("p", { class: "budget-feed-memo" }, [text(activity.memo)])
        : null;

    const tagsEl =
      activity.tags.length > 0
        ? el(
            "ul",
            { class: "budget-tag-list", "aria-label": "Tags" },
            activity.tags.map((tag) =>
              el("li", { class: "budget-tag-chip" }, [text(tag)]),
            ),
          )
        : null;

    const editBtn = el(
      "button",
      {
        type: "button",
        class: "budget-btn budget-btn-secondary budget-edit-btn",
        "data-activity-id": activity.id,
        "aria-label": `Edit ${typeLabel} ${formattedAmount}`,
      },
      [text("Edit")],
    ) as HTMLButtonElement;

    const deleteBtn = el(
      "button",
      {
        type: "button",
        class: "budget-btn budget-btn-danger budget-delete-btn",
        "data-activity-id": activity.id,
        "aria-label": `Delete ${typeLabel} ${formattedAmount}`,
      },
      [text("Delete")],
    ) as HTMLButtonElement;

    editBtn.addEventListener("click", () => {
      openEditDialog(activity, editBtn);
    });

    deleteBtn.addEventListener("click", async () => {
      const confirmed = await confirm({
        title: "Delete activity",
        message: `Delete this ${activity.type} of ${formatCents(activity.amountCents, activity.currency)}? This action cannot be undone.`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        invoker: deleteBtn,
      });
      if (!confirmed) {
        return;
      }
      await budget.deleteActivity(activity.id);
      onUserWrite?.();
      await refresh();
    });

    const actionsRow = el("div", { class: "budget-feed-actions" }, [
      editBtn,
      deleteBtn,
    ]);

    return el(
      "li",
      {
        class: "budget-feed-item",
        "data-activity-id": activity.id,
      },
      [topRow, timeEl, memoEl, tagsEl, actionsRow],
    ) as HTMLLIElement;
  }

  async function refresh(): Promise<void> {
    const seq = ++refreshSeq;
    const [availableCents, activities] = await Promise.all([
      budget.getAvailableFunds(),
      budget.listActivities(),
    ]);

    if (seq !== refreshSeq) {
      return;
    }

    const currency = activities[0]?.currency ?? "USD";
    replaceChildren(fundsAmountEl, text(formatCents(availableCents, currency)));
    setAttrs(fundsAmountEl, {
      class:
        availableCents < 0
          ? "budget-funds-amount budget-funds-amount--negative"
          : "budget-funds-amount",
    });

    if (activities.length === 0) {
      replaceChildren(feedListEl);
      setAttrs(feedListEl, { hidden: "true" });
      setAttrs(feedEmptyEl, { hidden: null });
      return;
    }

    const sorted = [...activities].sort(compareActivitiesNewestFirst);
    replaceChildren(feedListEl, ...sorted.map(renderActivityItem));
    setAttrs(feedListEl, { hidden: null });
    setAttrs(feedEmptyEl, { hidden: "true" });
  }

  // ---------------------------------------------------------------------------
  // 7. Form Submit Handlers (CSP form-action 'none' compliant)
  // ---------------------------------------------------------------------------
  quickForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError(quickErrorEl, quickControls);

    const rawType = quickTypeSelect.value;
    if (!isActivityType(rawType)) {
      showFormError(
        quickErrorEl,
        "Select a valid activity type (expense, income, or deposit).",
        quickTypeSelect,
      );
      return;
    }

    let amountCents: number;
    try {
      amountCents = parseDecimalInputToCents(quickAmountInput.value);
    } catch (err) {
      showFormError(quickErrorEl, extractErrorMessage(err), quickAmountInput);
      return;
    }

    let dateTime: string;
    const rawDateTime = quickDateTimeInput.value.trim();
    if (rawDateTime.length > 0) {
      try {
        dateTime = fromDateTimeLocalInputValue(rawDateTime);
      } catch (err) {
        showFormError(
          quickErrorEl,
          extractErrorMessage(err),
          quickDateTimeInput,
        );
        return;
      }
    } else {
      dateTime = getNow().toISOString();
    }

    const tags = parseTagsInput(quickTagsInput.value);
    const trimmedMemo = quickMemoInput.value.trim();

    try {
      await budget.addActivity({
        type: rawType,
        amountCents,
        dateTime,
        tags,
        ...(trimmedMemo.length > 0 ? { memo: trimmedMemo } : {}),
      });
    } catch (err) {
      showFormError(quickErrorEl, extractErrorMessage(err));
      return;
    }

    onUserWrite?.();

    quickTypeSelect.value = "expense";
    quickAmountInput.value = "";
    quickDateTimeInput.value = toDateTimeLocalInputValue(
      getNow().toISOString(),
    );
    quickMemoInput.value = "";
    quickTagsInput.value = "";

    await refresh();
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError(editErrorEl, editControls);

    const targetId = editingActivityId;
    if (targetId === null) {
      return;
    }

    const rawType = editTypeSelect.value;
    if (!isActivityType(rawType)) {
      showFormError(
        editErrorEl,
        "Select a valid activity type (expense, income, or deposit).",
        editTypeSelect,
      );
      return;
    }

    let amountCents: number;
    try {
      amountCents = parseDecimalInputToCents(editAmountInput.value);
    } catch (err) {
      showFormError(editErrorEl, extractErrorMessage(err), editAmountInput);
      return;
    }

    let dateTime: string;
    try {
      dateTime = fromDateTimeLocalInputValue(editDateTimeInput.value);
    } catch (err) {
      showFormError(editErrorEl, extractErrorMessage(err), editDateTimeInput);
      return;
    }

    const tags = parseTagsInput(editTagsInput.value);
    const trimmedMemo = editMemoInput.value.trim();

    try {
      await budget.editActivity(targetId, {
        type: rawType,
        amountCents,
        dateTime,
        tags,
        memo: trimmedMemo,
      });
    } catch (err) {
      showFormError(editErrorEl, extractErrorMessage(err));
      return;
    }

    onUserWrite?.();
    await refresh();
    focusActivityIdAfterClose = targetId;
    if (editDialog.open) {
      editDialog.close();
    }
  });

  // ---------------------------------------------------------------------------
  // 8. Assemble Layout & Mount Optional Recurring Rules Slot
  // ---------------------------------------------------------------------------
  const primaryPane = el("div", { class: "budget-primary-pane" }, [
    fundsHeader,
    quickAddSection,
    recurringSlot,
  ]);

  const layout = el("div", { class: "budget-layout" }, [primaryPane, feedPane]);

  replaceChildren(container, layout, editDialog);

  if (renderRecurringSlot !== undefined) {
    renderRecurringSlot(recurringSlot, async () => {
      onUserWrite?.();
      await refresh();
    });
  }

  void refresh().catch(() => {
    // Callers that explicitly await controller.refresh() observe errors directly.
  });

  return {
    refresh,
  };
}
