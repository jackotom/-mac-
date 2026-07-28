import { describe, expect, it } from "vitest";
import {
  HEARTHSTONE_DISPLAY_CAPTURE_TYPES,
  HEARTHSTONE_WINDOW_CAPTURE_TYPES,
  selectHearthstoneWindowCaptureSource,
  selectTargetDisplayCaptureSource
} from "../src/main/screenCaptureSource";

const sources = [
  { id: "screen:1:0", name: "Entire Screen", display_id: "1" },
  { id: "window:20:0", name: "Hearthstone", display_id: "" },
  { id: "screen:2:0", name: "Screen 2", display_id: "2" }
];

describe("screen capture source selection", () => {
  it("keeps window and display requests separate", () => {
    expect(HEARTHSTONE_WINDOW_CAPTURE_TYPES).toEqual(["window"]);
    expect(HEARTHSTONE_DISPLAY_CAPTURE_TYPES).toEqual(["screen"]);
  });

  it("prefers the Hearthstone window even when another display is active", () => {
    expect(selectHearthstoneWindowCaptureSource(sources)?.id).toBe("window:20:0");
  });

  it("recognizes a Chinese Hearthstone window title", () => {
    expect(
      selectHearthstoneWindowCaptureSource(
        [{ id: "window:21:0", name: "炉石传说", display_id: "" }, ...sources]
      )?.id
    ).toBe("window:21:0");
  });

  it("chooses the largest Hearthstone window when the game exposes helper windows", () => {
    const smallWindow = {
      id: "window:21:0",
      name: "Hearthstone",
      display_id: "",
      thumbnail: { getSize: () => ({ width: 500, height: 500 }) }
    };
    const gameWindow = {
      id: "window:22:0",
      name: "Hearthstone",
      display_id: "",
      thumbnail: { getSize: () => ({ width: 3076, height: 1802 }) }
    };

    expect(selectHearthstoneWindowCaptureSource([smallWindow, gameWindow, ...sources])?.id).toBe("window:22:0");
  });

  it("uses only the target display when fullscreen Hearthstone has no window source", () => {
    const screens = sources.filter((source) => source.id.startsWith("screen:"));
    expect(selectTargetDisplayCaptureSource(screens, 2)?.id).toBe("screen:2:0");
    expect(selectTargetDisplayCaptureSource(screens, 99)).toBeUndefined();
  });

  it("rejects an empty Hearthstone window thumbnail so the caller can request the display", () => {
    const emptyWindow = {
      id: "window:20:0",
      name: "Hearthstone",
      display_id: "",
      thumbnail: { getSize: () => ({ width: 0, height: 0 }) }
    };
    expect(selectHearthstoneWindowCaptureSource([emptyWindow])).toBeUndefined();
  });
});
