import { describe, expect, it } from "vitest";
import { createBudgetApi } from "./index";

describe("createBudgetApi", () => {
  it("returns an object with a version", () => {
    const api = createBudgetApi();
    expect(api.version).toBe("0.1.0");
  });
});
