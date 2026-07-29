import { describe, expect, it } from "vitest";
import { toCardTrackingView } from "../src/renderer/cardTrackingView";
import type {
  PublicCardHistoryGroup,
  PublicCardTracking,
  PublicCardZoneGroup
} from "../src/shared/types";
import { createEmptyCardTracking } from "./fixtures/publicTrackerState";

function tracking(): PublicCardTracking {
  return structuredClone(createEmptyCardTracking("game-1"));
}

function setHistory(
  value: PublicCardTracking,
  side: "friendly" | "opponent",
  key: "burned" | "used",
  group: PublicCardHistoryGroup
): void {
  const player = value[side] as unknown as Record<string, unknown>;
  player[key] = group;
}

function setZone(
  value: PublicCardTracking,
  side: "friendly" | "opponent",
  key: string,
  group: PublicCardZoneGroup
): void {
  const current = value[side].current as unknown as Record<string, unknown>;
  current[key] = group;
}

function setTrackingField(value: PublicCardTracking, key: string, field: unknown): void {
  (value as unknown as Record<string, unknown>)[key] = field;
}

function baseDetails(name: string) {
  return {
    dbfId: 103_270,
    name,
    isSpell: true,
    relatedCards: [],
    cardPoolSections: [{
      key: "spell-pool",
      title: "可能施放",
      emptyText: "无候选",
      cards: [{ dbfId: 1, name: "理论法术" }]
    }]
  };
}

function actualOutcome(name: string, dbfId: number) {
  return [{
    key: "actual",
    title: "本次实际施放",
    emptyText: "无结果",
    cards: [{
      key: `actual-${dbfId}`,
      card: { dbfId, name }
    }]
  }];
}

describe("card tracking renderer mapping", () => {
  it("keeps a hidden history action without inventing a card name", () => {
    const value = tracking();
    setHistory(value, "friendly", "burned", {
      totalCount: 1,
      truncated: false,
      items: [{
        id: "burn-1",
        sequence: 4,
        entityId: "44",
        confidence: "inferred"
      }]
    });

    const view = toCardTrackingView(value, "friendly", { showSecretCandidates: true });

    expect(view.burned.totalCount).toBe(1);
    expect(view.burned.items).toEqual([{
      id: "burn-1",
      sequence: 4,
      displayName: undefined,
      hidden: true,
      confidence: "inferred",
      details: undefined
    }]);
    expect(view.burned.items[0]).not.toHaveProperty("name");
  });

  it("preserves two same-name uses as separate history items by id", () => {
    const value = tracking();
    setHistory(value, "friendly", "used", {
      totalCount: 2,
      truncated: false,
      items: [
        {
          id: "use-2",
          sequence: 2,
          entityId: "12",
          card: { cardKey: "id:toy_372", cardId: "TOY_372", name: "匣中古神" },
          confidence: "confirmed"
        },
        {
          id: "use-1",
          sequence: 1,
          entityId: "11",
          card: { cardKey: "id:toy_372", cardId: "TOY_372", name: "匣中古神" },
          confidence: "confirmed"
        }
      ]
    });

    const view = toCardTrackingView(value, "friendly", { showSecretCandidates: true });

    expect(view.used.items.map((item) => [item.id, item.displayName])).toEqual([
      ["use-2", "匣中古神"],
      ["use-1", "匣中古神"]
    ]);
  });

  it("merges shared theoretical details with only that usage's actual outcomes", () => {
    const value = tracking();
    setTrackingField(value, "detailsByCardKey", {
      "id:toy_372": baseDetails("匣中古神")
    });
    setHistory(value, "friendly", "used", {
      totalCount: 2,
      truncated: false,
      items: [
        {
          id: "use-2",
          sequence: 2,
          entityId: "12",
          card: { cardKey: "id:toy_372", cardId: "TOY_372", name: "匣中古神" },
          confidence: "confirmed",
          outcomeSections: actualOutcome("第二次结果", 2)
        },
        {
          id: "use-1",
          sequence: 1,
          entityId: "11",
          card: { cardKey: "id:toy_372", cardId: "TOY_372", name: "匣中古神" },
          confidence: "confirmed",
          outcomeSections: actualOutcome("第一次结果", 1)
        }
      ]
    });

    const view = toCardTrackingView(value, "friendly", { showSecretCandidates: true });

    expect(view.used.items[0]?.details?.cardPoolSections?.[0]?.cards[0]?.name).toBe("理论法术");
    expect(view.used.items[1]?.details?.cardPoolSections?.[0]?.cards[0]?.name).toBe("理论法术");
    expect(view.used.items[0]?.details?.cardOutcomeSections?.[0]?.cards[0]?.card.name).toBe("第二次结果");
    expect(view.used.items[1]?.details?.cardOutcomeSections?.[0]?.cards[0]?.card.name).toBe("第一次结果");
    expect(value.detailsByCardKey["id:toy_372"]).not.toHaveProperty("cardOutcomeSections");
  });

  describe("history detail combinations", () => {
    it("keeps base details and adds this usage's outcomes when both exist", () => {
      const value = tracking();
      setTrackingField(value, "detailsByCardKey", {
        "id:with_base": baseDetails("有基础牌")
      });
      setHistory(value, "friendly", "used", {
        totalCount: 1,
        truncated: false,
        items: [{
          id: "use-1",
          sequence: 1,
          entityId: "1",
          card: { cardKey: "id:with_base", cardId: "WITH_BASE", name: "有基础牌" },
          confidence: "confirmed",
          outcomeSections: actualOutcome("实际结果", 11)
        }]
      });

      const details = toCardTrackingView(value, "friendly", {
        showSecretCandidates: true
      }).used.items[0]?.details;

      expect(details?.cardPoolSections?.[0]?.cards[0]?.name).toBe("理论法术");
      expect(details?.cardOutcomeSections?.[0]?.cards[0]?.card.name).toBe("实际结果");
    });

    it("keeps base details unchanged when outcomes are absent", () => {
      const value = tracking();
      const base = baseDetails("只有基础牌");
      setTrackingField(value, "detailsByCardKey", {
        "id:base_only": base
      });
      setHistory(value, "friendly", "used", {
        totalCount: 1,
        truncated: false,
        items: [{
          id: "use-1",
          sequence: 1,
          entityId: "1",
          card: { cardKey: "id:base_only", cardId: "BASE_ONLY", name: "只有基础牌" },
          confidence: "confirmed"
        }]
      });

      const details = toCardTrackingView(value, "friendly", {
        showSecretCandidates: true
      }).used.items[0]?.details;

      expect(details).toBe(base);
      expect(details).not.toHaveProperty("cardOutcomeSections");
    });

    it("creates renderable minimal details from the recorded identity when only outcomes exist", () => {
      const value = tracking();
      setHistory(value, "friendly", "used", {
        totalCount: 1,
        truncated: false,
        items: [{
          id: "use-1",
          sequence: 1,
          entityId: "1",
          card: {
            cardKey: "id:outcome_only",
            cardId: "OUTCOME_ONLY",
            name: "日志记录真名"
          },
          confidence: "confirmed",
          outcomeSections: actualOutcome("仅有实际结果", 12)
        }]
      });

      const details = toCardTrackingView(value, "friendly", {
        showSecretCandidates: true
      }).used.items[0]?.details;

      expect(details).toMatchObject({
        name: "日志记录真名",
        cardId: "OUTCOME_ONLY",
        relatedCards: [],
        cardOutcomeSections: actualOutcome("仅有实际结果", 12)
      });
      expect(details).not.toHaveProperty("cardPoolSections");
      expect(details?.name).not.toBe("未公开");
    });

    it("keeps details absent when neither base details nor outcomes exist", () => {
      const value = tracking();
      setHistory(value, "friendly", "used", {
        totalCount: 1,
        truncated: false,
        items: [{
          id: "use-1",
          sequence: 1,
          entityId: "1",
          card: {
            cardKey: "id:no_details",
            cardId: "NO_DETAILS",
            name: "只有记录名称"
          },
          confidence: "confirmed"
        }]
      });

      expect(toCardTrackingView(value, "friendly", {
        showSecretCandidates: true
      }).used.items[0]?.details).toBeUndefined();
    });
  });

  it("formats unknown, partial, secret, and truncated counts without using candidate totals", () => {
    const value = tracking();
    setZone(value, "opponent", "deck", {
      status: "unknown",
      knownCount: 0,
      cards: []
    });
    setZone(value, "opponent", "hand", {
      status: "partial",
      knownCount: 1,
      totalCount: 3,
      cards: [{ cardKey: "id:known", name: "已知手牌", count: 1 }]
    });
    setZone(value, "opponent", "secret", {
      status: "partial",
      knownCount: 0,
      totalCount: 1,
      cards: []
    });
    setTrackingField(value, "opponentSecretSlots", [{
      entityId: "secret-1",
      candidates: Array.from({ length: 5 }, (_, index) => ({
        cardId: `SECRET_${index + 1}`,
        name: `候选${index + 1}`,
        status: "possible"
      }))
    }]);
    setHistory(value, "opponent", "used", {
      totalCount: 31,
      truncated: true,
      items: [{
        id: "use-31",
        sequence: 31,
        entityId: "31",
        confidence: "confirmed"
      }]
    });

    const view = toCardTrackingView(value, "opponent", { showSecretCandidates: false });

    expect(view.current.deck.countLabel).toBe("?");
    expect(view.current.hand.countLabel).toBe("≥1");
    expect(view.current.secret.countLabel).toBe("当前 1");
    expect(view.used.countLabel).toBe("最近 1 / 共 31");
    expect(view.secretSlots).toHaveLength(1);
    expect(view.secretSlots[0]?.candidates).toEqual([]);
  });
});
