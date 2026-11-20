import { describe, expect, it, vi } from "vitest";
import {
  assertNotFramed,
  type FrameGuardDocument,
  type FrameGuardWindow,
} from "./main";

describe("assertNotFramed", () => {
  it("does not clear DOM or throw in a top-level browsing context", () => {
    const replaceChildren = vi.fn();
    const selfRef = {};
    const win: FrameGuardWindow = { top: selfRef, self: selfRef };
    const doc: FrameGuardDocument = {
      documentElement: { replaceChildren },
    };

    expect(() => assertNotFramed(win, doc)).not.toThrow();
    expect(replaceChildren).not.toHaveBeenCalled();
  });

  it("clears the document and throws when loaded inside a frame", () => {
    const replaceChildren = vi.fn();
    const win: FrameGuardWindow = { top: {}, self: {} };
    const doc: FrameGuardDocument = {
      documentElement: { replaceChildren },
    };

    expect(() => assertNotFramed(win, doc)).toThrow("Framing is not permitted");
    expect(replaceChildren).toHaveBeenCalledTimes(1);
  });

  it("clears the document and throws when top is null", () => {
    const replaceChildren = vi.fn();
    const win: FrameGuardWindow = { top: null, self: {} };
    const doc: FrameGuardDocument = {
      documentElement: { replaceChildren },
    };

    expect(() => assertNotFramed(win, doc)).toThrow("Framing is not permitted");
    expect(replaceChildren).toHaveBeenCalledTimes(1);
  });
});
