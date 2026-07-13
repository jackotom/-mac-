import { describe, expect, it } from "vitest";
import { shouldHandleAppActivate, shouldShowMainWindowOnLaunch } from "../src/main/mainWindowVisibility";

describe("main window launch visibility", () => {
  it("keeps a normal launch in the background", () => {
    expect(shouldShowMainWindowOnLaunch({})).toBe(false);
  });

  it("shows the main window for a main-window QA screenshot", () => {
    expect(shouldShowMainWindowOnLaunch({ QA_SCREENSHOT_PATH: "/tmp/main.png", QA_EXIT_AFTER_SCREENSHOT: "1" })).toBe(true);
  });

  it("keeps the main window hidden when QA is capturing an overlay", () => {
    expect(shouldShowMainWindowOnLaunch({
      QA_SCREENSHOT_PATH: "/tmp/overlay.png",
      QA_EXIT_AFTER_SCREENSHOT: "1",
      QA_OPEN_OVERLAY: "1"
    })).toBe(false);
  });

  it("keeps the main window hidden when QA is capturing the board-attack overlay", () => {
    expect(shouldShowMainWindowOnLaunch({
      QA_SCREENSHOT_PATH: "/tmp/board-attack.png",
      QA_EXIT_AFTER_SCREENSHOT: "1",
      QA_OPEN_BOARD_ATTACK_OVERLAY: "1"
    })).toBe(false);
  });

  it("ignores the launch activate event and handles later user activation", () => {
    expect(shouldHandleAppActivate(false, false, 10_000, 9_000)).toBe(false);
    expect(shouldHandleAppActivate(true, false, 8_999, 9_000)).toBe(false);
    expect(shouldHandleAppActivate(true, false, 9_000, 9_000)).toBe(true);
    expect(shouldHandleAppActivate(true, true, 1_000, 9_000)).toBe(true);
  });
});
