export interface FrameGuardWindow {
  readonly top: unknown;
  readonly self: unknown;
}

export interface FrameGuardDocument {
  readonly documentElement: {
    replaceChildren(): void;
  };
}

export function assertNotFramed(
  win: FrameGuardWindow,
  doc: FrameGuardDocument,
): void {
  let isFramed: boolean;
  try {
    isFramed = win.top !== win.self;
  } catch {
    isFramed = true;
  }
  if (isFramed) {
    doc.documentElement.replaceChildren();
    throw new Error("Framing is not permitted");
  }
}

import { renderShell } from "./ui/shell";

if (typeof window !== "undefined" && typeof document !== "undefined") {
  assertNotFramed(window, document);

  // Phase 4A walking skeleton: render the accessible 3-tab shell into the
  // `#app` mount. `renderShell` is a DOM-only module (`src/ui/`) and the
  // shell carries placeholder panels until Phases 4B/4C wire up the
  // functional Budget/Insights/Settings views.
  const app = document.getElementById("app");
  if (app !== null) {
    renderShell(app);
  }
}
