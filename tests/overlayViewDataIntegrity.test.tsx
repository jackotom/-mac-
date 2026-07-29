import { describe, expect, it } from "vitest";
import { toOverlayPanelViewModel } from "../src/renderer/overlayView";
import { createEmptyCardTracking, createPublicTrackerState } from "./fixtures/publicTrackerState";

describe("overlay view data integrity", () => {
  it("ignores poisoned legacy card-location fields", () => {
    const tracking = createEmptyCardTracking("truthful-view");
    const state = createPublicTrackerState({
      friendlyHand: [{ name: "旧手牌假数据", count: 99 }],
      friendlyOther: [{ name: "旧其他区假数据", count: 967 }],
      opponentDeck: [{ name: "旧对手牌库假数据", count: 88 }],
      opponentHand: [{ name: "旧对手手牌假数据", count: 77 }],
      opponentOther: [{ name: "旧对手其他区假数据", count: 66 }],
      opponentDeckCount: 55,
      opponentHandCount: 44,
      opponentPlayed: [{ name: "旧使用记录假数据", count: 1, remaining: 0, drawn: 0, played: 33 }],
      opponentSecrets: [{ entityId: "legacy-secret", candidates: [] }],
      cardTracking: tracking
    });

    const friendly = toOverlayPanelViewModel(state);
    const opponent = toOverlayPanelViewModel(state, { side: "opponent" });

    expect(friendly.cardTracking.current.hand.cards).toEqual([]);
    expect(friendly.cardTracking.current.graveyard.cards).toEqual([]);
    expect(opponent.cardTracking.current.deck.cards).toEqual([]);
    expect(opponent.cardTracking.current.hand.cards).toEqual([]);
    expect(opponent.cardTracking.used.items).toEqual([]);
    expect(opponent.cardTracking.secretSlots).toEqual([]);
  });

  it("keeps global effects because they are not card locations", () => {
    const state = createPublicTrackerState({
      globalEffects: [{ name: "友方全局效果", count: 1 }],
      opponentGlobalEffects: [{ name: "对手全局效果", count: 1 }]
    });

    const view = toOverlayPanelViewModel(state);

    expect(view.globalEffects).toEqual([expect.objectContaining({ name: "友方全局效果" })]);
    expect(view.opponentGlobalEffects).toEqual([expect.objectContaining({ name: "对手全局效果" })]);
  });
});
