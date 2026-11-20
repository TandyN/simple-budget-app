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
  if (win.top !== win.self) {
    doc.documentElement.replaceChildren();
    throw new Error("Framing is not permitted");
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  assertNotFramed(window, document);
}
