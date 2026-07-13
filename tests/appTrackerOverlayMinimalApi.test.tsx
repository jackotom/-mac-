import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("tracker overlay preload boundary", () => {
  it("renders with the minimal tracker-overlay API", async () => {
    const state = {
      status: "watching",
      gameActive: false,
      deckName: "测试牌库",
      deck: [],
      friendlyHand: [],
      friendlyOther: [],
      opponentPlayed: [],
      opponentSecrets: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
      lastUpdated: new Date().toISOString()
    };
    window.history.replaceState({}, "", "/?overlay=1");
    window.hearthstoneTracker = {
      getState: vi.fn(async () => state),
      onUpdate: vi.fn(() => () => undefined),
      showCardPreview: vi.fn(async () => undefined),
      hideCardPreview: vi.fn(async () => undefined),
      onCardPreviewPinnedChange: vi.fn(() => () => undefined)
    } as unknown as typeof window.hearthstoneTracker;
    const { default: App } = await import("../src/renderer/App.js");

    render(<App />);

    expect(await screen.findByLabelText("炉石记牌器置顶小窗")).toBeInTheDocument();
    expect(window.hearthstoneTracker?.getState).toHaveBeenCalled();
  });
});
