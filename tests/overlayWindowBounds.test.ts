import { describe, expect, it } from "vitest";
import * as overlayWindowBounds from "../src/main/overlayWindowBounds";
import {
  getAnchoredOverlayWindowBounds,
  getDefaultOpponentOverlayWindowBounds,
  getDefaultOverlayWindowBounds,
  normalizeOpponentOverlayWindowBounds,
  normalizeOverlayWindowBounds
} from "../src/main/overlayWindowBounds";

describe("overlay window bounds", () => {
  const display = { x: 0, y: 0, width: 1440, height: 900 };

  it("keeps a legal compact 100x200 friendly window", () => {
    expect(normalizeOverlayWindowBounds({ x: 100, y: 80, width: 100, height: 200 }, [display])).toEqual({
      x: 100,
      y: 80,
      width: 100,
      height: 200
    });
  });

  it("keeps a legal tall 100x900 friendly window", () => {
    expect(normalizeOverlayWindowBounds({ x: 1340, y: 0, width: 100, height: 900 }, [display])).toEqual({
      x: 1340,
      y: 0,
      width: 100,
      height: 900
    });
  });

  it("repairs saved bounds below the compact minimum", () => {
    expect(normalizeOverlayWindowBounds({ x: 100, y: 80, width: 260, height: 560 }, [display])).toEqual({
      x: 100,
      y: 80,
      width: 260,
      height: 560
    });
  });

  it("migrates the old 300px default width to the compact default", () => {
    expect(normalizeOverlayWindowBounds({ x: 100, y: 80, width: 300, height: 500 }, [display])).toEqual({
      x: 100,
      y: 80,
      width: 100,
      height: 500
    });
  });

  it("moves off-screen saved bounds back into the visible work area", () => {
    expect(normalizeOverlayWindowBounds({ x: 5000, y: 4000, width: 80, height: 560 }, [display])).toEqual({
      x: 1340,
      y: 340,
      width: 100,
      height: 560
    });
  });

  it("uses the default size when saved data is invalid", () => {
    expect(normalizeOverlayWindowBounds({ x: "bad", width: -1 }, [display])).toEqual({ width: 100, height: 900 });
  });

  it("fits the minimum height inside a shorter display", () => {
    expect(normalizeOverlayWindowBounds({ x: 20, y: 50, width: 300, height: 500 }, [{ ...display, height: 800 }])).toEqual({
      x: 20,
      y: 50,
      width: 100,
      height: 500
    });
  });

  it("repairs historical arena hero ranking bounds to the new smaller minimum", () => {
    const normalizeWithOptions = normalizeOverlayWindowBounds as unknown as (
      value: unknown,
      workAreas: readonly typeof display[],
      options: {
        readonly defaultBounds: typeof display;
        readonly minWidth: number;
        readonly minHeight: number;
        readonly migrateLegacyWidth?: number;
      }
    ) => ReturnType<typeof normalizeOverlayWindowBounds>;

    expect(normalizeWithOptions(
      { x: 5000, y: 4000, width: 80, height: 160 },
      [display],
      {
        defaultBounds: { x: 0, y: 170, width: 100, height: 560 },
        minWidth: 100,
        minHeight: 200
      }
    )).toEqual({
      x: 1340,
      y: 700,
      width: 100,
      height: 200
    });
  });

  it("places a first-run friendly tracker against the right edge", () => {
    expect(getDefaultOverlayWindowBounds(display)).toEqual({
      x: 1340,
      y: 0,
      width: 100,
      height: 900
    });
  });

  it("places a first-run hero ranking at the narrow left inset", () => {
    const getDefaultArenaHeroRankingWindowBounds = (
      overlayWindowBounds as typeof overlayWindowBounds & {
        getDefaultArenaHeroRankingWindowBounds?: (
          workArea: typeof display
        ) => Required<overlayWindowBounds.WindowBounds>;
      }
    ).getDefaultArenaHeroRankingWindowBounds;

    expect(getDefaultArenaHeroRankingWindowBounds).toBeTypeOf("function");
    expect(getDefaultArenaHeroRankingWindowBounds?.(display)).toEqual({
      x: 0,
      y: 170,
      width: 100,
      height: 560
    });
  });

  it("places a first-run opponent tracker 24px to the right of the hero ranking", () => {
    expect(getDefaultOpponentOverlayWindowBounds(display)).toEqual({
      x: 124,
      y: 365,
      width: 250,
      height: 170
    });
    expect(getDefaultOpponentOverlayWindowBounds(display).x - 100).toBe(24);
  });

  it("moves a legacy left-edge opponent tracker beside the new hero ranking", () => {
    expect(normalizeOpponentOverlayWindowBounds(
      { x: 0, y: 33, width: 154, height: 664 },
      [display],
      display
    )).toEqual({
      x: 124,
      y: 33,
      width: 154,
      height: 664
    });
  });

  it("anchors a window to the configured edge, applies offsets, and keeps it visible", () => {
    const bounds = { x: 400, y: 300, width: 250, height: 170 };

    expect(getAnchoredOverlayWindowBounds(bounds, display, {
      position: "left",
      offsetX: 20,
      offsetY: -15
    })).toEqual({ x: 20, y: 350, width: 250, height: 170 });
    expect(getAnchoredOverlayWindowBounds(bounds, display, {
      position: "right",
      offsetX: 200,
      offsetY: 200
    })).toEqual({ x: 1190, y: 565, width: 250, height: 170 });
  });

  it("restores an opponent window on its saved secondary display", () => {
    const primary = { x: 0, y: 0, width: 1440, height: 900 };
    const secondary = { x: -1920, y: 0, width: 1920, height: 1080 };
    const saved = { x: -1700, y: 240, width: 300, height: 420 };

    expect(normalizeOpponentOverlayWindowBounds(saved, [primary, secondary], display)).toEqual(saved);
  });
});
