import { describe, expect, it } from "vitest";
import { shouldApplyInitialTrackerState } from "../src/renderer/stateInitialization";

describe("tracker state initialization", () => {
  it("does not let a delayed initial response overwrite a live update", () => {
    expect(shouldApplyInitialTrackerState(false)).toBe(true);
    expect(shouldApplyInitialTrackerState(true)).toBe(false);
  });
});
