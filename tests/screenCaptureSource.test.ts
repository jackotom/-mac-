import { describe, expect, it } from "vitest";
import { selectHearthstoneCaptureSource } from "../src/main/screenCaptureSource";

const sources = [
  { id: "screen:1:0", name: "Entire Screen", display_id: "1" },
  { id: "window:20:0", name: "Hearthstone", display_id: "" },
  { id: "screen:2:0", name: "Screen 2", display_id: "2" }
];

describe("screen capture source selection", () => {
  it("prefers the Hearthstone window even when another display is active", () => {
    expect(selectHearthstoneCaptureSource(sources, 2)?.id).toBe("window:20:0");
  });

  it("recognizes a Chinese Hearthstone window title", () => {
    expect(
      selectHearthstoneCaptureSource(
        [{ id: "window:21:0", name: "炉石传说", display_id: "" }, ...sources],
        2
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

    expect(selectHearthstoneCaptureSource([smallWindow, gameWindow, ...sources], 2)?.id).toBe("window:22:0");
  });

  it("falls back to the active display and then the first screen", () => {
    const screens = sources.filter((source) => source.id.startsWith("screen:"));
    expect(selectHearthstoneCaptureSource(screens, 2)?.id).toBe("screen:2:0");
    expect(selectHearthstoneCaptureSource(screens, 99)?.id).toBe("screen:1:0");
  });
});
