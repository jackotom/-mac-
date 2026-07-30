import { describe, expect, it } from "vitest";
import {
  resolveOpponentDefault,
  trackingLayoutModeForHeight
} from "../src/renderer/cardTrackingLayout";
import type {
  OverlayCardTrackingView,
  OverlayCardZoneView
} from "../src/renderer/types";
import type { PublicCardZone } from "../src/shared/types";

function zone(
  key: PublicCardZone,
  overrides: Partial<OverlayCardZoneView> = {}
): OverlayCardZoneView {
  return {
    key,
    status: "known",
    knownCount: 0,
    totalCount: 0,
    countLabel: "0",
    cards: [],
    ...overrides
  };
}

function opponentView(
  overrides: Partial<OverlayCardTrackingView> = {}
): OverlayCardTrackingView {
  return {
    status: "ready",
    gameKey: "game-1",
    side: "opponent",
    current: {
      deck: zone("deck"),
      hand: zone("hand"),
      play: zone("play"),
      secret: zone("secret"),
      graveyard: zone("graveyard"),
      removed: zone("removed")
    },
    burned: { key: "burned", totalCount: 0, countLabel: "0", truncated: false, items: [] },
    used: { key: "used", totalCount: 0, countLabel: "0", truncated: false, items: [] },
    secretSlots: [],
    ...overrides
  };
}

describe("card tracking layout", () => {
  it("maps real heights to short and tall while ignoring zero", () => {
    expect(trackingLayoutModeForHeight(0)).toBeUndefined();
    expect(trackingLayoutModeForHeight(1)).toBe("short");
    expect(trackingLayoutModeForHeight(399)).toBe("short");
    expect(trackingLayoutModeForHeight(400)).toBe("tall");
    expect(trackingLayoutModeForHeight(900)).toBe("tall");
  });

  it("uses opponent default priority 1: secret slot", () => {
    const result = resolveOpponentDefault(opponentView({
      secretSlots: [{ id: "slot-1", label: "? 1", candidates: [] }]
    }));
    expect(result.page).toBe("current");
    expect([...result.expanded]).toEqual(["secret"]);
  });

  it("uses opponent default priority 2: known hand", () => {
    const current = opponentView().current;
    const result = resolveOpponentDefault(opponentView({
      current: {
        ...current,
        hand: zone("hand", {
          knownCount: 1,
          totalCount: 1,
          countLabel: "1",
          cards: [{ id: "hand-1", name: "已知手牌", count: 1 }]
        })
      }
    }));
    expect([...result.expanded]).toEqual(["hand"]);
  });

  it("uses opponent default priority 3: undisclosed hand", () => {
    const current = opponentView().current;
    const result = resolveOpponentDefault(opponentView({
      current: {
        ...current,
        hand: zone("hand", {
          status: "partial",
          totalCount: 3,
          countLabel: "3"
        })
      }
    }));
    expect([...result.expanded]).toEqual(["hand"]);
  });

  it("uses opponent default priority 4: deck data or unknown deck", () => {
    const current = opponentView().current;
    const result = resolveOpponentDefault(opponentView({
      current: {
        ...current,
        deck: zone("deck", { status: "unknown", countLabel: "?" })
      }
    }));
    expect([...result.expanded]).toEqual(["deck"]);
  });

  it("uses opponent default priority 5: burned before used history", () => {
    const history = {
      key: "burned" as const,
      totalCount: 1,
      countLabel: "1",
      truncated: false,
      items: [{
        id: "burned-1",
        sequence: 1,
        displayName: "烧毁牌",
        hidden: false,
        confidence: "confirmed" as const
      }]
    };
    const result = resolveOpponentDefault(opponentView({
      burned: history,
      used: { ...history, key: "used", items: [{ ...history.items[0]!, id: "used-1" }] }
    }));
    expect(result.page).toBe("history");
    expect([...result.expanded]).toEqual(["burned"]);
  });

  it("uses opponent default priority 6: empty state opens deck", () => {
    const result = resolveOpponentDefault(opponentView());
    expect(result.page).toBe("current");
    expect([...result.expanded]).toEqual(["deck"]);
  });
});
