import { describe, expect, it } from "vitest";
import { parsePublicTrackerState } from "../src/renderer/runtimeValidation";
import {
  createEmptyCardTracking,
  createPublicTrackerState
} from "./fixtures/publicTrackerState";

type CompleteTrackerState = ReturnType<typeof createPublicTrackerState>;

function overwriteZone(
  state: CompleteTrackerState,
  player: "friendly" | "opponent",
  zone: string,
  value: unknown
): void {
  const current = state.cardTracking[player].current as unknown as Record<string, unknown>;
  current[zone] = value;
}

function overwriteHistory(
  state: CompleteTrackerState,
  player: "friendly" | "opponent",
  group: "burned" | "used",
  value: unknown
): void {
  const tracking = state.cardTracking[player] as unknown as Record<string, unknown>;
  tracking[group] = value;
}

function overwriteSecretSlots(state: CompleteTrackerState, value: unknown): void {
  const tracking = state.cardTracking as unknown as Record<string, unknown>;
  tracking.opponentSecretSlots = value;
}

function overwriteDetailsByCardKey(state: CompleteTrackerState, value: unknown): void {
  const tracking = state.cardTracking as unknown as Record<string, unknown>;
  tracking.detailsByCardKey = value;
}

function createDetailsWithOutcomeSections() {
  return {
    dbfId: 315,
    name: "火球术",
    isSpell: true,
    relatedCards: [],
    cardOutcomeSections: [{
      key: "actual",
      title: "本次实际施放",
      emptyText: "无结果",
      cards: [{
        key: "result-1",
        card: { dbfId: 1001, name: "奥术飞弹" }
      }]
    }]
  };
}

describe("card tracking runtime validation", () => {
  it("rejects states without required card tracking", () => {
    const state = createPublicTrackerState() as unknown as Record<string, unknown>;
    delete state.cardTracking;

    expect(() => parsePublicTrackerState(state)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects empty game keys and invalid card tracking overrides in the normal factory", () => {
    expect(() => createPublicTrackerState({
      cardTracking: createEmptyCardTracking(" ")
    })).toThrow(/cardTracking/);

    const invalidTracking = structuredClone(createEmptyCardTracking("game-1"));
    const friendlyCurrent = invalidTracking.friendly.current as unknown as Record<string, unknown>;
    friendlyCurrent.hand = {
      status: "known",
      knownCount: 0,
      totalCount: 1,
      cards: []
    };
    expect(() => createPublicTrackerState({ cardTracking: invalidTracking })).toThrow(/cardTracking/);
  });

  it("creates independent nested arrays and objects for every normal state", () => {
    const first = createPublicTrackerState();
    const second = createPublicTrackerState();

    expect(first.cardTracking).not.toBe(second.cardTracking);
    expect(first.cardTracking.friendly.current.deck.cards)
      .not.toBe(second.cardTracking.friendly.current.deck.cards);
    expect(first.cardTracking.opponent.used.items)
      .not.toBe(second.cardTracking.opponent.used.items);
    expect(first.cardTracking.opponentSecretSlots)
      .not.toBe(second.cardTracking.opponentSecretSlots);
  });

  it("clones a supplied card tracking override instead of sharing it", () => {
    const supplied = createEmptyCardTracking("game-1");
    const first = createPublicTrackerState({ cardTracking: supplied });
    const second = createPublicTrackerState({ cardTracking: supplied });

    expect(first.cardTracking).not.toBe(supplied);
    expect(first.cardTracking).not.toBe(second.cardTracking);
    expect(first.cardTracking.friendly.used.items)
      .not.toBe(second.cardTracking.friendly.used.items);
  });

  it("deeply clones all caller-owned state overrides", () => {
    const overrides = {
      deck: [{
        name: "火球术",
        count: 1,
        remaining: 1,
        drawn: 0,
        played: 0
      }],
      events: [{
        id: "event-1",
        at: "2026-07-29T12:00:00.000Z",
        kind: "draw" as const,
        player: "friendly" as const,
        cardName: "火球术"
      }],
      summary: {
        totalCards: 1,
        remainingCards: 1,
        drawnCards: 0,
        opponentPlayedCount: 0
      }
    };

    const state = createPublicTrackerState(overrides);
    expect(state.deck).not.toBe(overrides.deck);
    expect(state.deck[0]).not.toBe(overrides.deck[0]);
    expect(state.events).not.toBe(overrides.events);
    expect(state.events[0]).not.toBe(overrides.events[0]);
    expect(state.summary).not.toBe(overrides.summary);
  });

  it("rejects known groups whose total differs from the known count", () => {
    const state = createPublicTrackerState();
    overwriteZone(state, "friendly", "hand", {
      status: "known",
      knownCount: 0,
      totalCount: 1,
      cards: []
    });

    expect(() => parsePublicTrackerState(state)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects partial groups without a larger total", () => {
    const state = createPublicTrackerState();
    overwriteZone(state, "opponent", "hand", {
      status: "partial",
      knownCount: 0,
      cards: []
    });

    expect(() => parsePublicTrackerState(state)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects unknown groups that claim a total", () => {
    const state = createPublicTrackerState();
    overwriteZone(state, "opponent", "deck", {
      status: "unknown",
      knownCount: 0,
      totalCount: 3,
      cards: []
    });

    expect(() => parsePublicTrackerState(state)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects a known count that differs from the sum of known cards", () => {
    const state = createPublicTrackerState();
    overwriteZone(state, "friendly", "deck", {
      status: "known",
      knownCount: 2,
      totalCount: 2,
      cards: [{ cardKey: "CS2_029", cardId: "CS2_029", name: "火球术", count: 1 }]
    });

    expect(() => parsePublicTrackerState(state)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects duplicate history ids and inconsistent truncation", () => {
    const duplicate = createPublicTrackerState();
    overwriteHistory(duplicate, "friendly", "used", {
      totalCount: 2,
      truncated: false,
      items: [
        { id: "same", sequence: 1, entityId: "1", confidence: "confirmed" },
        { id: "same", sequence: 2, entityId: "2", confidence: "confirmed" }
      ]
    });
    expect(() => parsePublicTrackerState(duplicate)).toThrow(/卡牌生命周期数据无效/);

    const truncated = createPublicTrackerState();
    overwriteHistory(truncated, "friendly", "used", {
      totalCount: 2,
      truncated: false,
      items: [{ id: "use-1", sequence: 1, entityId: "1", confidence: "confirmed" }]
    });
    expect(() => parsePublicTrackerState(truncated)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects history sequences that are not strictly decreasing", () => {
    const ascending = createPublicTrackerState();
    overwriteHistory(ascending, "friendly", "used", {
      totalCount: 2,
      truncated: false,
      items: [
        { id: "use-1", sequence: 1, entityId: "1", confidence: "confirmed" },
        { id: "use-2", sequence: 2, entityId: "2", confidence: "confirmed" }
      ]
    });
    expect(() => parsePublicTrackerState(ascending)).toThrow(/卡牌生命周期数据无效/);

    const equal = createPublicTrackerState();
    overwriteHistory(equal, "friendly", "used", {
      totalCount: 2,
      truncated: false,
      items: [
        { id: "use-2", sequence: 2, entityId: "2", confidence: "confirmed" },
        { id: "use-1", sequence: 2, entityId: "1", confidence: "confirmed" }
      ]
    });
    expect(() => parsePublicTrackerState(equal)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects secret counts derived from candidate cards instead of slots", () => {
    const state = createPublicTrackerState();
    overwriteZone(state, "opponent", "secret", {
      status: "known",
      knownCount: 5,
      totalCount: 5,
      cards: [
        { cardKey: "SECRET_1", name: "候选1", count: 1 },
        { cardKey: "SECRET_2", name: "候选2", count: 1 },
        { cardKey: "SECRET_3", name: "候选3", count: 1 },
        { cardKey: "SECRET_4", name: "候选4", count: 1 },
        { cardKey: "SECRET_5", name: "候选5", count: 1 }
      ]
    });
    overwriteSecretSlots(state, [{
      entityId: "slot-1",
      candidates: [
        { cardId: "SECRET_1", name: "候选1", status: "possible" },
        { cardId: "SECRET_2", name: "候选2", status: "possible" },
        { cardId: "SECRET_3", name: "候选3", status: "possible" },
        { cardId: "SECRET_4", name: "候选4", status: "possible" },
        { cardId: "SECRET_5", name: "候选5", status: "possible" }
      ]
    }]);

    expect(() => parsePublicTrackerState(state)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects actual outcome sections stored in base card details", () => {
    const indexedDetails = createPublicTrackerState();
    overwriteDetailsByCardKey(indexedDetails, {
      CS2_029: createDetailsWithOutcomeSections()
    });
    expect(() => parsePublicTrackerState(indexedDetails)).toThrow(/卡牌生命周期数据无效/);

    const secretDetails = createPublicTrackerState();
    overwriteZone(secretDetails, "opponent", "secret", {
      status: "partial",
      knownCount: 0,
      totalCount: 1,
      cards: []
    });
    overwriteSecretSlots(secretDetails, [{
      entityId: "slot-1",
      candidates: [{
        cardId: "EX1_287",
        name: "法术反制",
        status: "possible",
        details: createDetailsWithOutcomeSections()
      }]
    }]);
    expect(() => parsePublicTrackerState(secretDetails)).toThrow(/卡牌生命周期数据无效/);
  });

  it("accepts actual outcome sections on history items", () => {
    const state = createPublicTrackerState();
    overwriteHistory(state, "friendly", "used", {
      totalCount: 1,
      truncated: false,
      items: [{
        id: "use-1",
        sequence: 1,
        entityId: "1",
        confidence: "confirmed",
        outcomeSections: createDetailsWithOutcomeSections().cardOutcomeSections
      }]
    });

    expect(parsePublicTrackerState(state)).toBe(state);
  });

  it("rejects outcome trees deeper than 16 levels", () => {
    const state = createPublicTrackerState();
    let node: Record<string, unknown> = {
      key: "leaf",
      card: { dbfId: 1, name: "叶节点" }
    };
    for (let depth = 0; depth < 16; depth += 1) {
      node = {
        key: `depth-${depth}`,
        card: { dbfId: depth + 2, name: `第${depth + 1}层` },
        children: [node]
      };
    }
    overwriteHistory(state, "friendly", "used", {
      totalCount: 1,
      truncated: false,
      items: [{
        id: "use-1",
        sequence: 1,
        entityId: "1",
        confidence: "confirmed",
        outcomeSections: [{
          key: "actual",
          title: "本次实际施放",
          emptyText: "无结果",
          cards: [node]
        }]
      }]
    });

    expect(() => parsePublicTrackerState(state)).toThrow(/卡牌生命周期数据无效/);
  });

  it("rejects outcome trees with more than 512 nodes", () => {
    const state = createPublicTrackerState();
    const cards = Array.from({ length: 513 }, (_, index) => ({
      key: `node-${index}`,
      card: { dbfId: index + 1, name: `结果${index + 1}` }
    }));
    overwriteHistory(state, "friendly", "used", {
      totalCount: 1,
      truncated: false,
      items: [{
        id: "use-1",
        sequence: 1,
        entityId: "1",
        confidence: "confirmed",
        outcomeSections: [{
          key: "actual",
          title: "本次实际施放",
          emptyText: "无结果",
          cards
        }]
      }]
    });

    expect(() => parsePublicTrackerState(state)).toThrow(/卡牌生命周期数据无效/);
  });
});
