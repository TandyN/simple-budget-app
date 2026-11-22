/**
 * Accessible 3-tab application shell for `simple-budget-app`.
 *
 * `project-plan/frontend.md → Semantic HTML & WCAG 2.2 AA Accessibility`:
 * the shell is a `<nav role="tablist">` with three `<button role="tab">`
 * controls (`Budget`, `Insights`, `Settings`) paired with
 * `<section role="tabpanel">` landmarks, a native `<dialog>` helper for
 * confirmation prompts (built-in focus trapping, backdrop inert handling,
 * `Escape` dismissal — no modal library), roving `tabindex` + arrow-key
 * navigation, and `>= 44×44 CSS px` touch-target semantics on every
 * interactive element.
 *
 * Built **exclusively** through the `./dom` safe-DOM helpers
 * (`el` / `text` / `setAttrs` / `replaceChildren`) — the only DOM API set in
 * use — so no HTML-parsing DOM sinks or dynamic-code-evaluation sinks appear
 * anywhere (`project-plan/frontend.md → DOM XSS Ban (Safe DOM APIs Only)`,
 * enforced by Gate 4 of `scripts/verify-build-gates.mjs`). Zero production
 * dependencies: only built-in Web-platform DOM APIs are used
 * (`project-plan/dependency-strategy.md`).
 *
 * Panels carry **placeholder** content only; the functional Budget/Insights/
 * Settings workflows are deferred to Phases 4B/4C
 * (`project-plan/build-order.md`).
 */

import { el, replaceChildren, setAttrs, text } from "./dom";

/** The three shell tabs, in fixed display order. */
const TABS = ["budget", "insights", "settings"] as const;

type Tab = (typeof TABS)[number];

/**
 * Title-case display label for a tab (`budget` → `Budget`). All labels are
 * static developer-controlled strings, so plain string interpolation is safe.
 */
function labelFor(tab: Tab): string {
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}

/**
 * A single interactive control with `>= 44×44 CSS px` hit-target semantics
 * (`project-plan/frontend.md`: `min-height: 2.75rem; min-width: 2.75rem` —
 * the CSS task in #276 carries the full design system; the shell guarantees
 * the WCAG 2.5.8 touch-target floor by construction).
 */
function control(
  tag: string,
  attrs: Record<string, string | null>,
  label: string,
): HTMLElement {
  const node = el(tag, attrs, [text(label)]);
  const style = (node as HTMLElement).style;
  style.minWidth = "44px";
  style.minHeight = "44px";
  return node as HTMLElement;
}

/**
 * The `<dialog>` confirmation helper: a native `<dialog>` with `Confirm`
 * and `Cancel` actions. `open()` shows it modal via `showModal()` (native
 * focus trap + backdrop inert); `confirm(options)` updates the dialog copy
 * via safe DOM text nodes, opens it modally, and resolves `true` on Confirm
 * or `false` on Cancel / `Escape` dismissal. On close, focus returns to
 * `options.invoker` (when provided and connected) or the active tab button,
 * satisfying WCAG 2.2 AA focus-return.
 *
 * @param getActiveTab returns the currently active tab button (fallback focus
 *   return target on close)
 * @returns the confirm-dialog handle (`dialog`, `open`, `close`, `confirm`)
 */
function createConfirmDialog(getActiveTab: () => HTMLButtonElement): {
  readonly dialog: HTMLDialogElement;
  open(): void;
  close(): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
} {
  const dialog = el("dialog", { class: "confirm-dialog" }) as HTMLDialogElement;

  const heading = el("h2", { class: "confirm-dialog-title" }, [
    text("Please confirm"),
  ]);
  const message = el("p", { class: "confirm-dialog-message" }, [
    text("Do you want to continue?"),
  ]);

  const cancelButton = control(
    "button",
    { class: "confirm-dialog-cancel", type: "button" },
    "Cancel",
  ) as HTMLButtonElement;
  const confirmButton = control(
    "button",
    { class: "confirm-dialog-confirm", type: "button" },
    "Confirm",
  ) as HTMLButtonElement;

  let pendingResolve: ((confirmed: boolean) => void) | null = null;
  let pendingResult = false;
  let currentInvoker: HTMLElement | null = null;

  const close = (): void => {
    if (!dialog.open) {
      return;
    }
    // The native `close` event (below) resolves any pending prompt and
    // restores focus to the invoker or active tab.
    dialog.close();
  };

  cancelButton.addEventListener("click", () => {
    pendingResult = false;
    close();
  });

  confirmButton.addEventListener("click", () => {
    pendingResult = true;
    close();
  });

  const actions = el("div", { class: "confirm-dialog-actions" }, [
    cancelButton,
    confirmButton,
  ]);

  // Native `Escape` dismissal and programmatic `close()` both fire `close`:
  // resolve any pending `confirm(...)` promise and restore focus so focus is
  // never stranded in the closed dialog (WCAG 2.2 AA focus return).
  dialog.addEventListener("close", () => {
    const resolve = pendingResolve;
    const result = pendingResult;
    const invoker = currentInvoker;

    pendingResolve = null;
    pendingResult = false;
    currentInvoker = null;

    if (invoker?.isConnected) {
      invoker.focus();
    } else {
      getActiveTab().focus();
    }

    if (resolve !== null) {
      resolve(result);
    }
  });

  replaceChildren(dialog, heading, message, actions);

  return {
    dialog,
    open(): void {
      if (!dialog.open) {
        currentInvoker = null;
        pendingResult = false;
        dialog.showModal();
      }
    },
    close,
    confirm(options: ConfirmOptions): Promise<boolean> {
      if (dialog.open) {
        pendingResult = false;
        close();
      }
      if (pendingResolve !== null) {
        const priorResolve = pendingResolve;
        pendingResolve = null;
        priorResolve(false);
      }

      replaceChildren(heading, text(options.title));
      replaceChildren(message, text(options.message));
      replaceChildren(cancelButton, text(options.cancelLabel ?? "Cancel"));
      replaceChildren(confirmButton, text(options.confirmLabel ?? "Confirm"));

      currentInvoker = options.invoker ?? null;
      pendingResult = false;

      return new Promise<boolean>((resolve) => {
        pendingResolve = resolve;
        dialog.showModal();
      });
    },
  };
}

/**
 * Renders the accessible 3-tab shell into `container`.
 *
 * - Builds `<nav role="tablist">` with three `<button role="tab"
 *   aria-selected aria-controls tabindex>` controls, `Budget` selected by
 *   default (roving `tabindex`: selected tab `0`, others `-1`).
 * - Builds three `<section role="tabpanel" id="panel-<tab>"
 *   aria-labelledby="tab-<tab>">` landmarks; only the selected panel is
 *   visible (`hidden` on the rest).
 * - Tab clicks switch panels and update `aria-selected` / `tabindex`.
 * - `ArrowLeft` / `ArrowRight` on the tablist move the selection (wrapping),
 *   per the WAI-ARIA tabs pattern.
 * - Provides a native `<dialog>` confirmation helper (`open()` / `close()` /
 *   promise-based `confirm(options)` with focus returned to the invoking
 *   element or active tab).
 *
 * Every interactive element (tabs and dialog buttons) enforces the
 * `>= 44×44 CSS px` minimum hit target.
 *
 * @param container the element the shell is rendered into (e.g. `#app`)
 * @returns the `ShellHandle` (backwards-compatible with `ConfirmDialog`)
 *   exposing panel mount nodes and the native confirmation dialog API
 */
export function renderShell(container: HTMLElement): ShellHandle {
  const tablist = el("nav", { role: "tablist" }) as HTMLElement;
  const panels = {} as Record<Tab, HTMLElement>;
  const tabs = {} as Record<Tab, HTMLButtonElement>;

  for (const tab of TABS) {
    const selected = tab === "budget";
    const tabButton = control(
      "button",
      {
        id: `tab-${tab}`,
        role: "tab",
        type: "button",
        "aria-selected": selected ? "true" : "false",
        "aria-controls": `panel-${tab}`,
        tabindex: selected ? "0" : "-1",
      },
      labelFor(tab),
    ) as HTMLButtonElement;
    tabs[tab] = tabButton;

    const panel = el(
      "section",
      {
        id: `panel-${tab}`,
        role: "tabpanel",
        "aria-labelledby": `tab-${tab}`,
        hidden: selected ? null : "true",
      },
      [text(`${labelFor(tab)} placeholder — content ships in a later phase.`)],
    ) as HTMLElement;
    panels[tab] = panel;
  }

  let activeTab: Tab = "budget";

  const selectTab = (tab: Tab, focus: boolean): void => {
    activeTab = tab;
    for (const other of TABS) {
      const isSelected = other === tab;
      setAttrs(tabs[other], {
        "aria-selected": isSelected ? "true" : "false",
        tabindex: isSelected ? "0" : "-1",
      });
      const hidden = isSelected ? null : "true";
      setAttrs(panels[other], { hidden });
    }
    if (focus) {
      tabs[tab].focus();
    }
  };

  const moveTab = (direction: 1 | -1, focus: boolean): void => {
    const index = TABS.indexOf(activeTab);
    const next = (index + direction + TABS.length) % TABS.length;
    const nextTab = TABS[next] as Tab;
    selectTab(nextTab, focus);
  };

  for (const tab of TABS) {
    tabs[tab].addEventListener("click", () => selectTab(tab, true));
  }

  tablist.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTab(1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTab(-1, true);
    }
  });

  replaceChildren(tablist, ...TABS.map((tab) => tabs[tab]));

  const dialogHelper = createConfirmDialog(() => tabs[activeTab]);

  replaceChildren(
    container,
    tablist,
    ...TABS.map((tab) => panels[tab]),
    dialogHelper.dialog,
  );

  return {
    dialog: dialogHelper.dialog,
    open: dialogHelper.open,
    close: dialogHelper.close,
    confirm: dialogHelper.confirm,
    panels: {
      budget: panels.budget,
      insights: panels.insights,
      settings: panels.settings,
    },
  };
}

/** Options for the shell's promise-based native `<dialog>` confirmation prompt. */
export interface ConfirmOptions {
  /** Dialog heading text. */
  readonly title: string;
  /** Dialog body message text. */
  readonly message: string;
  /** Label for the confirm action button (defaults to `"Confirm"`). */
  readonly confirmLabel?: string;
  /** Label for the cancel action button (defaults to `"Cancel"`). */
  readonly cancelLabel?: string;
  /** Element to restore focus to on close (defaults to the active tab button). */
  readonly invoker?: HTMLElement | null;
}

/** Direct references to the three shell tabpanel mount elements. */
export interface ShellPanels {
  readonly budget: HTMLElement;
  readonly insights: HTMLElement;
  readonly settings: HTMLElement;
}

/** Handle for the shell's native `<dialog>` confirmation helper. */
export interface ConfirmDialog {
  /** The underlying native `<dialog>` element. */
  readonly dialog: HTMLDialogElement;
  /** Opens the dialog modally (`showModal()`). */
  open(): void;
  /** Closes the dialog and returns focus to the invoking tab. */
  close(): void;
}

/**
 * Full shell handle returned by `renderShell(container)`.
 * Extends `ConfirmDialog` for backwards compatibility while exposing direct
 * tabpanel mount handles and a promise-based `confirm(options)` API.
 */
export interface ShellHandle extends ConfirmDialog {
  /** Direct references to `#panel-budget`, `#panel-insights`, and `#panel-settings`. */
  readonly panels: ShellPanels;
  /** Opens the native `<dialog>` with custom copy and resolves `true` on Confirm, `false` on Cancel/Escape. */
  confirm(options: ConfirmOptions): Promise<boolean>;
}
