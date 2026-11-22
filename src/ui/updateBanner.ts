/**
 * Accessible non-blocking Service Worker "Update available" banner
 * (`src/ui/updateBanner.ts`).
 *
 * Built strictly with `./dom` safe DOM helpers (zero HTML-parsing or
 * dynamic-code sinks — Gate 4). Renders a `role="status"` / `aria-live="polite"`
 * notification with `>= 44×44 CSS px` `"Update now"` and `"Dismiss"` controls
 * when a waiting Service Worker is detected.
 */

import { el, setAttrs, text } from "./dom";

export const UPDATE_BANNER_MESSAGE =
  "A new version of Simple Budget App is available.";

/** Handle returned by `mountUpdateBanner`. */
export interface UpdateBannerHandle {
  /** Root banner element (`role="status"`, `aria-live="polite"`). */
  readonly element: HTMLElement;
  /** Reveal the banner and bind the user-acceptance callback (`applyUpdate`). */
  show(onAccept: () => void): void;
  /** Hide the banner without triggering an update. */
  hide(): void;
  /** Remove event listeners and detach the banner from the DOM. */
  dispose(): void;
}

/**
 * Mounts the accessible "Update available" banner (hidden initially) into
 * `container`.
 */
export function mountUpdateBanner(container: HTMLElement): UpdateBannerHandle {
  const message = el("p", { class: "update-banner-message" }, [
    text(UPDATE_BANNER_MESSAGE),
  ]);

  const updateButton = el(
    "button",
    {
      type: "button",
      class: "update-banner-btn update-banner-btn-primary",
    },
    [text("Update now")],
  ) as HTMLButtonElement;

  const dismissButton = el(
    "button",
    {
      type: "button",
      class: "update-banner-btn update-banner-btn-secondary",
    },
    [text("Dismiss")],
  ) as HTMLButtonElement;

  const actions = el("div", { class: "update-banner-actions" }, [
    updateButton,
    dismissButton,
  ]);

  const banner = el(
    "div",
    {
      class: "update-banner",
      role: "status",
      "aria-live": "polite",
      hidden: "true",
    },
    [message, actions],
  ) as HTMLElement;

  let currentOnAccept: (() => void) | null = null;
  let disposed = false;

  const hide = (): void => {
    currentOnAccept = null;
    setAttrs(banner, { hidden: "true" });
  };

  const handleUpdateClick = (): void => {
    if (disposed || currentOnAccept === null) {
      return;
    }
    const accept = currentOnAccept;
    currentOnAccept = null;
    setAttrs(updateButton, { disabled: "true" });
    accept();
  };

  const handleDismissClick = (): void => {
    if (disposed) {
      return;
    }
    hide();
  };

  updateButton.addEventListener("click", handleUpdateClick);
  dismissButton.addEventListener("click", handleDismissClick);

  container.appendChild(banner);

  return {
    element: banner,
    show(onAccept: () => void): void {
      if (disposed) {
        return;
      }
      currentOnAccept = onAccept;
      setAttrs(updateButton, { disabled: null });
      setAttrs(banner, { hidden: null });
    },
    hide,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      currentOnAccept = null;
      updateButton.removeEventListener("click", handleUpdateClick);
      dismissButton.removeEventListener("click", handleDismissClick);
      banner.remove();
    },
  };
}
