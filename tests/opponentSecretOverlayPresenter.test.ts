import { describe, expect, it, vi } from "vitest";
import {
  presentOpponentSecretOverlay,
  type OpponentSecretOverlayPresenterHost
} from "../src/main/opponentSecretOverlayPresenter";

interface TestWindow {
  readonly id: string;
  readonly show: ReturnType<typeof vi.fn>;
  readonly focus: ReturnType<typeof vi.fn>;
}

describe("opponent secret overlay presenter", () => {
  it("ensures a hidden window and shows it inactive without exposing a focus path", async () => {
    const window: TestWindow = {
      id: "opponent",
      show: vi.fn(),
      focus: vi.fn()
    };
    const ensureWindow = vi.fn(async () => window);
    const showInactive = vi.fn();
    const host: OpponentSecretOverlayPresenterHost<TestWindow> = {
      ensureWindow,
      isStillValid: (candidate) => candidate === window,
      showInactive
    };

    await presentOpponentSecretOverlay(host);

    expect(ensureWindow).toHaveBeenCalledWith({ showWhenReady: false });
    expect(showInactive).toHaveBeenCalledOnce();
    expect(window.show).not.toHaveBeenCalled();
    expect(window.focus).not.toHaveBeenCalled();
  });

  it.each(["setting disabled", "generation changed"])(
    "does not show when %s while the window is being created",
    async () => {
      const window: TestWindow = {
        id: "stale",
        show: vi.fn(),
        focus: vi.fn()
      };
      let finishCreation!: (window: TestWindow) => void;
      const creation = new Promise<TestWindow>((resolve) => {
        finishCreation = resolve;
      });
      let valid = true;
      const showInactive = vi.fn();
      const presentation = presentOpponentSecretOverlay({
        ensureWindow: vi.fn(() => creation),
        isStillValid: () => valid,
        showInactive
      });

      valid = false;
      finishCreation(window);
      await presentation;

      expect(showInactive).not.toHaveBeenCalled();
      expect(window.show).not.toHaveBeenCalled();
      expect(window.focus).not.toHaveBeenCalled();
    }
  );
});
