// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mountUpdateBanner,
  UPDATE_BANNER_MESSAGE,
  type UpdateBannerHandle,
} from "./updateBanner";

describe("mountUpdateBanner", () => {
  let root: HTMLElement | null = null;
  let banner: UpdateBannerHandle | null = null;

  afterEach(() => {
    banner?.dispose();
    banner = null;
    root?.remove();
    root = null;
  });

  function createRoot(): HTMLElement {
    root = document.createElement("div");
    document.body.appendChild(root);
    return root;
  }

  it("renders hidden accessible role='status' banner with Update now and Dismiss buttons", () => {
    const container = createRoot();
    banner = mountUpdateBanner(container);

    const el = container.querySelector(".update-banner");
    expect(el).toBe(banner.element);
    expect(el?.getAttribute("role")).toBe("status");
    expect(el?.getAttribute("aria-live")).toBe("polite");
    expect(el?.hasAttribute("hidden")).toBe(true);
    expect(el?.textContent).toContain(UPDATE_BANNER_MESSAGE);

    const buttons = el?.querySelectorAll("button") ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toBe("Update now");
    expect(buttons[1]?.textContent).toBe("Dismiss");
  });

  it("shows on show(), invokes onAccept once when Update now is clicked, and disables the button", () => {
    const container = createRoot();
    banner = mountUpdateBanner(container);
    const onAccept = vi.fn();

    banner.show(onAccept);
    expect(banner.element.hasAttribute("hidden")).toBe(false);

    const updateBtn = banner.element.querySelector(
      ".update-banner-btn-primary",
    ) as HTMLButtonElement;
    expect(updateBtn.disabled).toBe(false);

    updateBtn.click();
    updateBtn.click();

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(updateBtn.hasAttribute("disabled")).toBe(true);
  });

  it("hides without invoking onAccept when Dismiss is clicked", () => {
    const container = createRoot();
    banner = mountUpdateBanner(container);
    const onAccept = vi.fn();

    banner.show(onAccept);
    expect(banner.element.hasAttribute("hidden")).toBe(false);

    const dismissBtn = banner.element.querySelector(
      ".update-banner-btn-secondary",
    ) as HTMLButtonElement;
    dismissBtn.click();

    expect(banner.element.hasAttribute("hidden")).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("detaches from DOM and ignores subsequent show() calls after dispose()", () => {
    const container = createRoot();
    banner = mountUpdateBanner(container);
    const onAccept = vi.fn();

    banner.dispose();
    expect(container.querySelector(".update-banner")).toBeNull();

    banner.show(onAccept);
    expect(banner.element.hasAttribute("hidden")).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
  });
});
