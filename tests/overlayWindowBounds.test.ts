import { describe, expect, it } from "vitest";
import { normalizeOverlayWindowBounds } from "../src/main/overlayWindowBounds";

describe("overlay window bounds", () => {
  const display = { x: 0, y: 0, width: 1440, height: 900 };

  it("restores valid saved bounds", () => {
    expect(normalizeOverlayWindowBounds({ x: 100, y: 80, width: 260, height: 560 }, [display])).toEqual({
      x: 100,
      y: 80,
      width: 300,
      height: 560
    });
  });

  it("moves off-screen saved bounds back into the visible work area", () => {
    expect(normalizeOverlayWindowBounds({ x: 5000, y: 4000, width: 260, height: 560 }, [display])).toEqual({
      x: 1140,
      y: 340,
      width: 300,
      height: 560
    });
  });

  it("uses the default size when saved data is invalid", () => {
    expect(normalizeOverlayWindowBounds({ x: "bad", width: -1 }, [display])).toEqual({ width: 300, height: 500 });
  });
});
