import { describe, expect, it } from "vitest";
import { getLadderDeckOverlayBounds } from "../src/main/ladderDeckOverlayBounds";

describe("getLadderDeckOverlayBounds", () => {
  it("places a compact panel on the left edge and vertically centers it", () => {
    expect(getLadderDeckOverlayBounds({ x: 0, y: 24, width: 1920, height: 1056 })).toEqual({
      x: 8,
      y: 302,
      width: 210,
      height: 500
    });
  });

  it("hides when the display cannot fit a readable panel", () => {
    expect(getLadderDeckOverlayBounds({ x: 0, y: 0, width: 350, height: 500 })).toBeUndefined();
  });

  it("clamps height on a shorter display", () => {
    expect(getLadderDeckOverlayBounds({ x: 100, y: 50, width: 1200, height: 440 })).toEqual({
      x: 108,
      y: 70,
      width: 210,
      height: 400
    });
  });
});
