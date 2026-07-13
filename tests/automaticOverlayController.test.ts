import { describe, expect, it, vi } from "vitest";
import { AutomaticOverlayController, type AutomaticOverlayHost } from "../src/main/automaticOverlayController";
import type { PublicTrackerState } from "../src/shared/types";

function makeState(overrides: Partial<PublicTrackerState> = {}): PublicTrackerState {
  return {
    status: "watching",
    deck: [],
    opponentPlayed: [],
    events: [],
    summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
    ...overrides
  };
}

function makeHost(initialState: PublicTrackerState) {
  let state = initialState;
  let frontmostAppName: string | undefined = "Hearthstone";
  let overlayExists = false;
  let overlayVisible = false;
  let overlayFocused = false;
  let overlayInteractionActive = false;

  const createOverlayWindow = vi.fn(async () => {
    overlayExists = true;
  });
  const showOverlayWindow = vi.fn(() => {
    overlayVisible = true;
  });
  const hideOverlayWindow = vi.fn(() => {
    overlayVisible = false;
  });

  const host: AutomaticOverlayHost = {
    getState: () => state,
    getFrontmostAppName: async () => frontmostAppName,
    hasOverlayWindow: () => overlayExists,
    isOverlayVisible: () => overlayVisible,
    isOverlayFocused: () => overlayFocused,
    isOverlayInteractionActive: () => overlayInteractionActive,
    createOverlayWindow,
    showOverlayWindow,
    hideOverlayWindow
  };

  return {
    host,
    createOverlayWindow,
    showOverlayWindow,
    hideOverlayWindow,
    setState(nextState: PublicTrackerState) {
      state = nextState;
    },
    setFrontmostAppName(nextName: string | undefined) {
      frontmostAppName = nextName;
    },
    setOverlayFocused(nextFocused: boolean) {
      overlayFocused = nextFocused;
    },
    setOverlayInteractionActive(nextActive: boolean) {
      overlayInteractionActive = nextActive;
    },
    closeOverlayWindow() {
      overlayExists = false;
      overlayVisible = false;
    }
  };
}

describe("AutomaticOverlayController", () => {
  it("creates and shows the overlay as soon as a constructed deck is selected", async () => {
    const fixture = makeHost(makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "standard-deck",
      deckName: "标准测试套牌",
      deck: [{ name: "测试牌", count: 2, remaining: 2, drawn: 0, played: 0 }],
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0, opponentPlayedCount: 0 }
    }));
    const controller = new AutomaticOverlayController(fixture.host);

    await controller.refresh();

    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(1);
    expect(fixture.showOverlayWindow).toHaveBeenCalledTimes(1);
  });

  it("shows a waiting overlay when the constructed mode is known but the deck is not", async () => {
    const fixture = makeHost(makeState({ constructedScreenMode: "wild" }));
    const controller = new AutomaticOverlayController(fixture.host);

    await controller.refresh();

    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(1);
    expect(fixture.showOverlayWindow).toHaveBeenCalledTimes(1);
  });

  it("keeps a waiting overlay visible during an active constructed game", async () => {
    const fixture = makeHost(makeState({ gameActive: true }));
    const controller = new AutomaticOverlayController(fixture.host);

    await controller.refresh();

    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(1);
    expect(fixture.showOverlayWindow).toHaveBeenCalledTimes(1);
  });

  it("hides outside Hearthstone and restores without creating a second window", async () => {
    const fixture = makeHost(makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "测试牌", count: 2, remaining: 2, drawn: 0, played: 0 }]
    }));
    const controller = new AutomaticOverlayController(fixture.host);
    await controller.refresh();

    fixture.setFrontmostAppName("Finder");
    await controller.refresh();
    fixture.setFrontmostAppName("Hearthstone");
    await controller.refresh();

    expect(fixture.hideOverlayWindow).toHaveBeenCalledTimes(1);
    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(1);
    expect(fixture.showOverlayWindow).toHaveBeenCalledTimes(2);
  });

  it("keeps the overlay visible while the user resizes or interacts with it", async () => {
    const fixture = makeHost(makeState({
      constructedScreenMode: "wild",
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "测试牌", count: 2, remaining: 2, drawn: 0, played: 0 }]
    }));
    const controller = new AutomaticOverlayController(fixture.host);
    await controller.refresh();

    fixture.setFrontmostAppName("炉石记牌器");
    fixture.setOverlayFocused(true);
    await controller.refresh();
    expect(fixture.hideOverlayWindow).not.toHaveBeenCalled();

    fixture.setOverlayFocused(false);
    fixture.setOverlayInteractionActive(true);
    await controller.refresh();
    expect(fixture.hideOverlayWindow).not.toHaveBeenCalled();

    fixture.setOverlayInteractionActive(false);
    fixture.setFrontmostAppName("Finder");
    await controller.refresh();
    expect(fixture.hideOverlayWindow).toHaveBeenCalledTimes(1);
  });

  it("keeps the overlay visible while the tracker itself is frontmost after dragging", async () => {
    const fixture = makeHost(makeState({ constructedScreenMode: "standard" }));
    const controller = new AutomaticOverlayController(fixture.host);
    await controller.refresh();
    fixture.setFrontmostAppName("炉石记牌器");
    fixture.setOverlayFocused(false);
    fixture.setOverlayInteractionActive(false);

    await controller.refresh();

    expect(fixture.hideOverlayWindow).not.toHaveBeenCalled();
  });

  it("keeps a manual close suppressed until the deck or mode changes", async () => {
    const fixture = makeHost(makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "测试牌", count: 2, remaining: 2, drawn: 0, played: 0 }]
    }));
    const controller = new AutomaticOverlayController(fixture.host);
    await controller.refresh();

    controller.suppressCurrentContext();
    fixture.closeOverlayWindow();
    await controller.refresh();
    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(1);

    fixture.setState(makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "deck-b",
      deck: [{ name: "另一张牌", count: 2, remaining: 2, drawn: 0, played: 0 }]
    }));
    await controller.refresh();

    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(2);
    expect(fixture.showOverlayWindow).toHaveBeenCalledTimes(2);
  });

  it("keeps the same selected deck suppressed when the deck-select screen disappears", async () => {
    const fixture = makeHost(makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "测试牌", count: 2, remaining: 2, drawn: 0, played: 0 }]
    }));
    const controller = new AutomaticOverlayController(fixture.host);
    await controller.refresh();

    controller.suppressCurrentContext();
    fixture.closeOverlayWindow();
    fixture.setState(makeState({
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "测试牌", count: 2, remaining: 1, drawn: 1, played: 0 }]
    }));
    await controller.refresh();

    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(1);
    expect(fixture.showOverlayWindow).toHaveBeenCalledTimes(1);
  });

  it("restores a manually closed overlay when the same deck changes mode", async () => {
    const fixture = makeHost(makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "测试牌", count: 2, remaining: 2, drawn: 0, played: 0 }]
    }));
    const controller = new AutomaticOverlayController(fixture.host);
    await controller.refresh();

    controller.suppressCurrentContext();
    fixture.closeOverlayWindow();
    fixture.setState(makeState({
      constructedScreenMode: "wild",
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "测试牌", count: 2, remaining: 2, drawn: 0, played: 0 }]
    }));
    await controller.refresh();

    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(2);
    expect(fixture.showOverlayWindow).toHaveBeenCalledTimes(2);
  });

  it("switches to Arena as a new automatic context", async () => {
    const fixture = makeHost(makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "测试牌", count: 2, remaining: 2, drawn: 0, played: 0 }]
    }));
    const controller = new AutomaticOverlayController(fixture.host);
    await controller.refresh();

    controller.suppressCurrentContext();
    fixture.closeOverlayWindow();
    fixture.setState(makeState({
      arena: { status: "drafting", draftCount: 0, currentChoices: [], picks: [], deck: [] }
    }));
    await controller.refresh();

    expect(fixture.createOverlayWindow).toHaveBeenCalledTimes(2);
    expect(fixture.showOverlayWindow).toHaveBeenCalledTimes(2);
  });

  it("does not let an older refresh reopen a newly suppressed context", async () => {
    let state = makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "deck-a",
      deck: [{ name: "套牌 A", count: 2, remaining: 2, drawn: 0, played: 0 }]
    });
    let resolveFrontmost: ((name: string | undefined) => void) | undefined;
    const frontmost = new Promise<string | undefined>((resolve) => {
      resolveFrontmost = resolve;
    });
    const createOverlayWindow = vi.fn(async () => undefined);
    const showOverlayWindow = vi.fn();
    const controller = new AutomaticOverlayController({
      getState: () => state,
      getFrontmostAppName: () => frontmost,
      hasOverlayWindow: () => false,
      isOverlayVisible: () => false,
      isOverlayFocused: () => false,
      createOverlayWindow,
      showOverlayWindow,
      hideOverlayWindow: vi.fn()
    });

    const refresh = controller.refresh();
    state = makeState({
      constructedScreenMode: "standard",
      autoMatchedDeckId: "deck-b",
      deck: [{ name: "套牌 B", count: 2, remaining: 2, drawn: 0, played: 0 }]
    });
    controller.suppressCurrentContext();
    resolveFrontmost?.("Hearthstone");
    await refresh;

    expect(createOverlayWindow).not.toHaveBeenCalled();
    expect(showOverlayWindow).not.toHaveBeenCalled();
  });
});
