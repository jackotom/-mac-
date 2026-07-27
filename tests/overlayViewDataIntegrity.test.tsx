import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import { toOverlayPanelViewModel } from "../src/renderer/overlayView";
import type { PublicTrackerState, TrackerZoneCard } from "../src/shared/types";

function trackerState({
  deck = [],
  friendlyHand = [],
  friendlyOther = [],
  remainingCards = 18
}: {
  readonly deck?: PublicTrackerState["deck"];
  readonly friendlyHand?: readonly TrackerZoneCard[];
  readonly friendlyOther?: readonly TrackerZoneCard[];
  readonly remainingCards?: number;
} = {}): PublicTrackerState {
  return {
    status: "watching",
    gameActive: true,
    deck,
    friendlyHand: [...friendlyHand],
    friendlyOther: [...friendlyOther],
    opponentPlayed: [],
    events: [],
    summary: {
      totalCards: 30,
      remainingCards,
      drawnCards: 30 - remainingCards,
      opponentPlayedCount: 0
    }
  };
}

describe("overlay view data integrity", () => {
  it("does not amplify a normal friendly-other row count", () => {
    const view = toOverlayPanelViewModel(trackerState({
      friendlyOther: [{ name: "场外测试牌", count: 1 }]
    }));

    expect(view.otherCards).toEqual([
      expect.objectContaining({ name: "场外测试牌", count: 1 })
    ]);
  });

  it("passes a suspicious friendly-other count through unchanged for diagnosis", () => {
    const view = toOverlayPanelViewModel(trackerState({
      friendlyOther: [{ name: "异常来源实体", count: 967 }]
    }));

    expect(view.otherCards).toEqual([
      expect.objectContaining({ name: "异常来源实体", count: 967 })
    ]);
  });

  it("keeps hand and other totals identical across the full renderer chain", () => {
    const initialState = trackerState({
      friendlyHand: [{ name: "已知手牌", count: 1 }],
      friendlyOther: [{ name: "异常来源实体", count: 967 }]
    });
    const nextState = trackerState({
      friendlyHand: [{ name: "已知手牌", count: 1 }],
      friendlyOther: [{ name: "异常来源实体", count: 5696 }]
    });
    const { rerender } = render(<OverlayPanel view={toOverlayPanelViewModel(initialState)} />);

    expect(screen.getByRole("region", { name: "手牌中 1 张" })).toHaveTextContent("手牌中 (1)");
    expect(screen.getByRole("region", { name: "其他 967 张" })).toHaveTextContent("其他 (967)");

    rerender(<OverlayPanel view={toOverlayPanelViewModel(nextState)} />);

    expect(screen.getByRole("region", { name: "手牌中 1 张" })).toHaveTextContent("手牌中 (1)");
    expect(screen.getByRole("region", { name: "其他 5696 张" })).toHaveTextContent("其他 (5696)");
  });

  it("shows all five hand cards when the input state contains five", () => {
    render(<OverlayPanel view={toOverlayPanelViewModel(trackerState({
      friendlyHand: [
        { name: "手牌一", count: 1 },
        { name: "手牌二", count: 2 },
        { name: "手牌三", count: 2 }
      ]
    }))} />);

    expect(screen.getByRole("region", { name: "手牌中 5 张" })).toHaveTextContent("手牌中 (5)");
  });

  it("does not invent or filter deck rows when the summary and source rows disagree", () => {
    const missingRows = toOverlayPanelViewModel(trackerState({ deck: [], remainingCards: 18 }));
    const knownRow = toOverlayPanelViewModel(trackerState({
      deck: [{
        name: "已知牌库牌",
        cardId: "TEST_DECK_001",
        count: 18,
        remaining: 18,
        drawn: 0,
        played: 0
      }],
      remainingCards: 18
    }));

    expect(missingRows.summary.remainingCards).toBe(18);
    expect(missingRows.remainingDeck).toEqual([]);
    expect(knownRow.remainingDeck).toEqual([
      expect.objectContaining({ name: "已知牌库牌", count: 18, detail: "剩 18/18" })
    ]);
  });
});
