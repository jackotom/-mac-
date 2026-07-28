import { describe, expect, it } from "vitest";
import { toOverlayPanelViewModel } from "../src/renderer/overlayView";
import type { PublicTrackerState } from "../src/shared/types";

describe("overlay view", () => {
  it("maps an idle watcher to one green waiting-for-game message", () => {
    const state: PublicTrackerState = {
      status: "watching",
      gameActive: false,
      error: "已识别炉石，等待开局。",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };

    expect(toOverlayPanelViewModel(state).status).toMatchObject({
      tone: "tracking",
      label: "已识别炉石，等待开局",
      detail: "进入对局后自动开始记牌"
    });
  });

  it("keeps a distinct watcher warning without turning the waiting state into a repair error", () => {
    const state: PublicTrackerState = {
      status: "watching",
      gameActive: false,
      error: "套牌识别暂不可用，但日志监听正常。",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };

    expect(toOverlayPanelViewModel(state).status).toMatchObject({
      tone: "tracking",
      label: "已识别炉石，等待开局",
      detail: "套牌识别暂不可用，但日志监听正常。"
    });
  });

  it("uses the backend waiting-for-game message without repeating its status prefix", () => {
    const state: PublicTrackerState = {
      status: "watching",
      gameActive: false,
      error: "已识别炉石，正在等待开局；开始对局后会自动连接 Power.log。",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };

    expect(toOverlayPanelViewModel(state).status).toMatchObject({
      tone: "tracking",
      label: "已识别炉石，等待开局",
      detail: "开始对局后会自动连接 Power.log。"
    });
  });

  it("keeps a real missing log as an explicit repair state", () => {
    const state: PublicTrackerState = {
      status: "missing-log",
      error: "缺少 Power.log。",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };

    expect(toOverlayPanelViewModel(state).status).toMatchObject({
      tone: "offline",
      label: "缺少 Power.log",
      detail: "先点修复日志，完全退出并重新打开炉石，然后进入一局"
    });
  });

  it("maps opponent zones, aggregates hidden hand cards, and accepts missing global effects", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentDeck: [{ name: "已知牌库牌", count: 1 }],
      opponentHand: [{ name: "已知手牌", count: 2 }],
      opponentOther: [{ name: "已知其他牌", count: 1 }],
      opponentGlobalEffects: [{ name: "对手全局效果", count: 1 }],
      opponentDeckCount: 21,
      opponentHandCount: 5,
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.opponentDeck).toEqual([expect.objectContaining({ name: "已知牌库牌", count: 1 })]);
    expect(view.opponentHand).toEqual([expect.objectContaining({ name: "已知手牌", count: 2 })]);
    expect(view.opponentUnknownHandCount).toBe(3);
    expect(view.opponentOther).toEqual([expect.objectContaining({ name: "已知其他牌", count: 1 })]);
    expect(view.opponentDeckCount).toBe(21);
    expect(view.globalEffects).toEqual([]);
    expect(view.opponentGlobalEffects).toEqual([expect.objectContaining({ name: "对手全局效果" })]);
  });

  it("keeps hidden opponent hand identities undisclosed while preserving their public count", () => {
    const state: PublicTrackerState = {
      status: "watching",
      gameActive: true,
      deck: [],
      opponentHand: [
        { name: "未知卡牌", count: 2 },
        { name: "已揭示手牌", count: 1, cardId: "REVEALED_001" }
      ],
      opponentHandCount: 3,
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.opponentHand).toEqual([
      expect.objectContaining({ name: "已揭示手牌", count: 1 })
    ]);
    expect(view.opponentUnknownHandCount).toBe(2);
    expect(view.opponentHand).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "未知卡牌" })])
    );
  });

  it("maps global effects and clears them on the next reset state", () => {
    const base: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };
    const active = toOverlayPanelViewModel({
      ...base,
      globalEffects: [{ name: "全场效果", count: 1 }]
    });
    const reset = toOverlayPanelViewModel({ ...base, globalEffects: [] });

    expect(active.globalEffects).toEqual([expect.objectContaining({ name: "全场效果", count: 1 })]);
    expect(reset.globalEffects).toEqual([]);
  });

  it("maps both players' public match counters without inventing missing values", () => {
    const state: PublicTrackerState = {
      status: "watching",
      gameActive: true,
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
      matchCounters: {
        friendly: { nextFatigueDamage: 0, corpses: 6, spellsPlayed: 8 },
        opponent: { nextFatigueDamage: 3 }
      }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.friendlyCounters).toEqual({
      nextFatigueDamage: 0,
      corpses: 6,
      spellsPlayed: 8
    });
    expect(view.opponentCounters).toEqual({
      nextFatigueDamage: 3
    });
  });

  it("maps independent opponent secret slots and both board attack totals", () => {
    const state = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
      opponentSecrets: [
        {
          entityId: "secret-11",
          candidates: [
            { cardId: "EX1_287", name: "法术反制", status: "possible" },
            { cardId: "EX1_289", name: "寒冰屏障", status: "excluded" }
          ]
        },
        {
          entityId: "secret-12",
          candidates: [{ cardId: "EX1_294", name: "镜像实体", status: "possible" }]
        }
      ],
      boardAttack: { friendly: 7, opponent: 12 }
    } as unknown as PublicTrackerState;

    const view = toOverlayPanelViewModel(state);

    expect(view.boardAttack).toEqual({ friendly: 7, opponent: 12 });
    expect(view.opponentSecrets).toEqual([
      {
        id: "secret-11",
        label: "? 1",
        candidates: [
          { id: "EX1_287", name: "法术反制", status: "possible" },
          { id: "EX1_289", name: "寒冰屏障", status: "excluded" }
        ]
      },
      {
        id: "secret-12",
        label: "? 2",
        candidates: [{ id: "EX1_294", name: "镜像实体", status: "possible" }]
      }
    ]);
  });

  it("builds mana-sorted deck, hand, and other groups for the compact overlay", () => {
    const oneCostDetails = {
      dbfId: 1,
      name: "一费牌",
      manaCost: 1,
      cardType: "法术",
      isSpell: true,
      relatedCards: []
    };
    const fourCostDetails = {
      dbfId: 4,
      name: "四费牌",
      manaCost: 4,
      cardType: "随从",
      isSpell: false,
      relatedCards: []
    };
    const state = {
      status: "watching",
      deckName: "费用排序套牌",
      autoMatchedDeckId: "mana-deck",
      deck: [
        { name: "四费牌", count: 2, remaining: 1, drawn: 1, played: 0, details: fourCostDetails },
        { name: "一费牌", count: 2, remaining: 2, drawn: 0, played: 0, details: oneCostDetails }
      ],
      friendlyHand: [{ name: "四费牌", count: 1, details: fourCostDetails }],
      friendlyOther: [{ name: "一费牌", count: 1, details: oneCostDetails }],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 4, remainingCards: 3, drawnCards: 1, opponentPlayedCount: 0 }
    } as PublicTrackerState & {
      friendlyHand: Array<{ name: string; count: number; details: typeof fourCostDetails }>;
      friendlyOther: Array<{ name: string; count: number; details: typeof oneCostDetails }>;
    };

    const view = toOverlayPanelViewModel(state) as ReturnType<typeof toOverlayPanelViewModel> & {
      handCards?: Array<{ name: string; count?: number; cost?: number }>;
      otherCards?: Array<{ name: string; count?: number; cost?: number }>;
    };

    expect(view.remainingDeck.map((card) => [card.name, card.cost])).toEqual([
      ["一费牌", 1],
      ["四费牌", 4]
    ]);
    expect(view.handCards).toEqual([expect.objectContaining({ name: "四费牌", count: 1, cost: 4 })]);
    expect(view.otherCards).toEqual([expect.objectContaining({ name: "一费牌", count: 1, cost: 1 })]);
  });

  it("keeps a card row identity stable when an earlier live row disappears", () => {
    const base: PublicTrackerState = {
      status: "watching",
      gameActive: true,
      deckName: "稳定悬停测试套牌",
      autoMatchedDeckId: "stable-hover-deck",
      deck: [
        { cardId: "CARD_A", name: "先消失的牌", count: 1, remaining: 1, drawn: 0, played: 0 },
        { cardId: "CARD_B", name: "仍在悬停的牌", count: 1, remaining: 1, drawn: 0, played: 0 }
      ],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 2, remainingCards: 2, drawnCards: 0, opponentPlayedCount: 0 }
    };

    const before = toOverlayPanelViewModel(base).remainingDeck.find((card) => card.name === "仍在悬停的牌");
    const after = toOverlayPanelViewModel({
      ...base,
      deck: base.deck.slice(1),
      summary: { ...base.summary, remainingCards: 1 }
    }).remainingDeck.find((card) => card.name === "仍在悬停的牌");

    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after?.id).toBe(before?.id);
  });

  it("exposes the automatically matched deck identity", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deckName: "奥术法师",
      autoMatchedDeckId: "collection-arcane-mage",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0, opponentPlayedCount: 0 }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.deckIdentity).toEqual({
      name: "奥术法师",
      status: "automatic",
      detail: "自动识别当前对局"
    });
  });

  it("exposes a waiting deck identity before a match is found", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.deckIdentity).toEqual({
      name: "等待识别",
      status: "waiting",
      detail: "抽到或打出卡牌后自动匹配"
    });
  });

  it("shows a Standard recognition state without stale deck rows", () => {
    const state: PublicTrackerState = {
      status: "watching",
      constructedScreenMode: "standard",
      deck: [{ name: "旧标准卡牌", count: 2, remaining: 2, drawn: 0, played: 0 }],
      opponentPlayed: [{ name: "旧对手卡牌", count: 0, remaining: 0, drawn: 0, played: 1 }],
      events: [{ id: "old-draw", kind: "draw", player: "friendly", at: "2026-07-11T10:00:00.000Z", cardName: "旧标准卡牌" }],
      summary: { totalCards: 2, remainingCards: 2, drawnCards: 0, opponentPlayedCount: 1 }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.deckIdentity).toEqual({
      name: "正在识别套牌",
      status: "waiting",
      detail: "标准套牌识别中"
    });
    expect(view.summary).toEqual({ totalCards: 0, remainingCards: 0, drawnCards: 0 });
    expect(view.remainingDeck).toEqual([]);
    expect(view.recentDraws).toEqual([]);
    expect(view.opponentRecentPlays).toEqual([]);
  });

  it("shows the screen permission error in the constructed waiting state", () => {
    const state: PublicTrackerState = {
      status: "watching",
      constructedScreenMode: "standard",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
      error: "请在系统设置中允许炉石记牌器录制屏幕。"
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.status).toMatchObject({
      tone: "error",
      label: "识别失败",
      detail: "请在系统设置中允许炉石记牌器录制屏幕。"
    });
  });

  it("shows a Wild recognition state without stale deck rows", () => {
    const state: PublicTrackerState = {
      status: "watching",
      constructedScreenMode: "wild",
      deck: [{ name: "旧狂野卡牌", count: 2, remaining: 1, drawn: 1, played: 0 }],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 2, remainingCards: 1, drawnCards: 1, opponentPlayedCount: 0 }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.deckIdentity).toEqual({
      name: "正在识别套牌",
      status: "waiting",
      detail: "狂野套牌识别中"
    });
    expect(view.summary).toEqual({ totalCards: 0, remainingCards: 0, drawnCards: 0 });
    expect(view.remainingDeck).toEqual([]);
    expect(view.recentDraws).toEqual([]);
    expect(view.opponentRecentPlays).toEqual([]);
  });

  it("keeps every remaining deck row for the scrollable overlay list", () => {
    const deck = Array.from({ length: 18 }, (_, index) => ({
      name: `卡牌 ${index + 1}`,
      count: 2,
      remaining: 2,
      drawn: 0,
      played: 0
    }));
    const state: PublicTrackerState = {
      status: "watching",
      deck,
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 36, remainingCards: 36, drawnCards: 0, opponentPlayedCount: 0 }
    };

    expect(toOverlayPanelViewModel(state).remainingDeck).toHaveLength(18);
    expect(toOverlayPanelViewModel(state, { maxDeckRows: 40 }).remainingDeck).toHaveLength(18);
  });

  it("keeps draw tracking and opponent aggregation independent from the recent-draw display", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deck: [{ name: "火球术", count: 2, remaining: 1, drawn: 1, played: 0, cardId: "CS2_029" }],
      opponentPlayed: [{ name: "伺机待发", count: 0, remaining: 0, drawn: 0, played: 2, cardId: "EX1_145" }],
      events: [
        { id: "draw-1", kind: "draw", player: "friendly", at: "2026-07-11T09:40:00.000Z", cardName: "火球术" },
        { id: "opponent-1", kind: "opponent-play", player: "opponent", at: "2026-07-11T09:40:01.000Z", cardName: "伺机待发" }
      ],
      summary: { totalCards: 2, remainingCards: 1, drawnCards: 1, opponentPlayedCount: 2 }
    };

    const view = toOverlayPanelViewModel(state, { maxRecentRows: 40 });

    expect(view.summary).toEqual({ totalCards: 2, remainingCards: 1, drawnCards: 1 });
    expect(view.remainingDeck).toEqual([expect.objectContaining({ name: "火球术", count: 1, detail: "剩 1/2" })]);
    expect(view.opponentRecentPlays).toEqual([
      expect.objectContaining({ name: "伺机待发", count: 2, detail: "本局已出" })
    ]);
  });

  it("uses aggregated opponent cards and omits log-field labels from the opponent window", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [
        { name: "伺机待发", count: 0, remaining: 0, drawn: 0, played: 2, cardId: "EX1_145" },
        { name: "Cost - 2", count: 0, remaining: 0, drawn: 0, played: 3 }
      ],
      events: [
        { id: "event-1", kind: "opponent-play", player: "opponent", at: "2026-07-11T09:30:29.000Z", cardName: "伺机待发" },
        { id: "event-2", kind: "opponent-play", player: "opponent", at: "2026-07-11T09:30:29.000Z", cardName: "Cost - 2" }
      ],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 5 }
    };

    expect(toOverlayPanelViewModel(state, { maxRecentRows: 40 }).opponentRecentPlays).toEqual([
      expect.objectContaining({ name: "伺机待发", count: 2, detail: "本局已出" })
    ]);
  });

  it("identifies an active Arena run as the Arena deck", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
      arena: {
        status: "playing",
        currentChoices: [],
        picks: [],
        deck: [{ name: "已确认牌", count: 7 }],
        draftCount: 7,
        unresolvedCount: 23
      }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.deckIdentity).toEqual({
      name: "竞技场牌库",
      status: "arena",
      detail: "已确认 7/30 · 23 张待识别"
    });
  });

  it("does not expose an incomplete Arena choice frame to the overlay", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
      arena: {
        status: "drafting",
        currentChoices: [
          { name: "候选一", count: 1, score: 101 },
          { name: "候选二", count: 1, score: 99 }
        ],
        picks: [],
        deck: [{ name: "已选牌", count: 1 }],
        draftCount: 12,
        unresolvedCount: 29
      }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.arena).toMatchObject({
      isChoosing: false,
      choices: [],
      deck: [{ name: "已选牌", count: 1 }],
      deckCount: 1
    });
  });

  it("exposes Arena progress, scored choices, and the generated deck", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
      arena: {
        status: "drafting",
        hero: { name: "吉安娜·普罗德摩尔", className: "Mage" },
        currentChoices: [
          { name: "抱团", cardId: "WORK_012", count: 1, score: 145 },
          { name: "银樽海韵", cardId: "VAC_520", count: 1, score: 110 },
          { name: "火羽精灵", cardId: "UNG_809", count: 1, score: 86 }
        ],
        picks: [
          {
            slot: 1,
            chosen: { name: "抱团", cardId: "WORK_012", count: 1, score: 145 },
            offered: [],
            at: "2026-07-10T00:00:00.000Z"
          }
        ],
        deck: [{ name: "抱团", cardId: "WORK_012", count: 1 }],
        draftCount: 1,
        unresolvedCount: 29,
        scoreSource: "Arena Tracker / HearthArena v119"
      }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.arena).toMatchObject({
      isChoosing: true,
      progress: "已确认 1/30",
      hero: "吉安娜·普罗德摩尔",
      scoreSource: "Arena Tracker / HearthArena v119",
      choices: [
        { name: "抱团", score: 145 },
        { name: "银樽海韵", score: 110 },
        { name: "火羽精灵", score: 86 }
      ],
      deck: [{ name: "抱团", count: 1 }],
      deckCount: 1,
      lastPick: { name: "抱团", score: 145 }
    });
  });

  it("exposes Arena deck stats before a match and strips them once play starts", () => {
    const base: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0, opponentPlayedCount: 0 },
      arena: {
        status: "complete",
        currentChoices: [],
        picks: [],
        deck: [{ name: "参考牌", count: 30, pickRate: 75.64, deckImpact: 0.1 }],
        draftCount: 30,
        unresolvedCount: 0
      }
    };

    const waiting = toOverlayPanelViewModel(base);
    const playing = toOverlayPanelViewModel({
      ...base,
      arena: { ...base.arena!, status: "playing" }
    });

    expect(waiting.arena?.statusLabel).toBe("等待开局");
    expect(waiting.arena?.showDeckStats).toBe(true);
    expect(waiting.arena?.deck[0]).toMatchObject({ pickRate: 75.64, deckImpact: 0.1 });
    expect(playing.arena?.showDeckStats).toBe(false);
    expect(playing.arena?.deck[0]).not.toHaveProperty("pickRate");
    expect(playing.arena?.deck[0]).not.toHaveProperty("deckImpact");
  });

  it("shows the complete scored pool while five cards are being removed in redraft", () => {
    const redraftPool = Array.from({ length: 35 }, (_value, index) => ({
      name: `重选牌 ${index + 1}`,
      count: 1,
      pickRate: 30 + index,
      deckImpact: index - 17
    }));
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0, opponentPlayedCount: 0 },
      arena: {
        status: "redrafting",
        currentChoices: [],
        picks: [],
        deck: [],
        redraftPool,
        draftCount: 30,
        unresolvedCount: 30
      }
    };

    const view = toOverlayPanelViewModel(state, { maxDeckRows: 40 });

    expect(view.arena?.statusLabel).toBe("重选中");
    expect(view.arena?.deckCount).toBe(35);
    expect(view.arena?.deck).toHaveLength(35);
    expect(view.arena?.deck[0]).toHaveProperty("pickRate");
    expect(view.arena?.deck[0]).toHaveProperty("deckImpact");
  });

  it("sorts the Arena deck by mana cost and then Chinese card name", () => {
    const details = (dbfId: number, name: string, manaCost: number) => ({
      dbfId,
      name,
      manaCost,
      cardType: "随从",
      isSpell: false,
      relatedCards: []
    });
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0, opponentPlayedCount: 0 },
      arena: {
        status: "complete",
        currentChoices: [],
        picks: [],
        deck: [
          { name: "三费牌", count: 7, details: details(3, "三费牌", 3) },
          { name: "二费乙", count: 8, details: details(22, "二费乙", 2) },
          { name: "一费牌", count: 7, details: details(1, "一费牌", 1) },
          { name: "二费甲", count: 8, details: details(21, "二费甲", 2) }
        ],
        draftCount: 30,
        unresolvedCount: 0
      }
    };

    expect(toOverlayPanelViewModel(state).arena?.deck.map((card) => card.name)).toEqual([
      "一费牌",
      "二费甲",
      "二费乙",
      "三费牌"
    ]);
  });

  it("keeps scoreless legendary-team choices and exposes all Firestone rates", () => {
    const state: PublicTrackerState = {
      status: "watching",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
      arena: {
        status: "drafting",
        currentChoices: [
          {
            name: "JAIL_851",
            cardId: "JAIL_851",
            count: 1,
            rating: { pickRate: 32.1, firestone: { includedWinrate: 58.4 } }
          },
          {
            name: "TIME_064",
            cardId: "TIME_064",
            count: 1,
            rating: { pickRate: 29.7, firestone: { includedWinrate: 55.2 } }
          },
          {
            name: "TIME_EVENT_998",
            cardId: "TIME_EVENT_998",
            count: 1,
            rating: { pickRate: 18.6, firestone: { includedWinrate: 52.9 } }
          }
        ],
        picks: [],
        deck: [],
        draftCount: 0,
        unresolvedCount: 30
      }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.arena?.choices).toHaveLength(3);
    expect(view.arena?.choices.map((choice) => choice.id)).toEqual([
      "arena-choice-JAIL_851",
      "arena-choice-TIME_064",
      "arena-choice-TIME_EVENT_998"
    ]);
    expect(view.arena?.choices.map((choice) => choice.ratingSummary)).toEqual([
      "入选胜率 58.4% · 选取率 32.1%",
      "入选胜率 55.2% · 选取率 29.7%",
      "入选胜率 52.9% · 选取率 18.6%"
    ]);
  });

  it.each([
    [24, 6, "已确认 24/30", "已确认 24/30 · 6 张待识别"],
    [29, 1, "已确认 29/30", "已确认 29/30 · 1 张待识别"],
    [30, 0, "30/30", "已选 30/30"]
  ])("maps %i confirmed and %i unresolved Arena cards with explicit placeholder metadata", (
    confirmedCount,
    unresolvedCount,
    progress,
    identityDetail
  ) => {
    const unresolvedRows = unresolvedCount > 0
      ? [{ name: "未解析竞技场牌", count: unresolvedCount, remaining: unresolvedCount, drawn: 0, played: 0, unresolved: true as const }]
      : [];
    const unresolvedArenaRows = unresolvedCount > 0
      ? [{ name: "不应渲染的占位", count: unresolvedCount, unresolved: true as const }]
      : [];
    const state: PublicTrackerState = {
      status: "watching",
      deckName: "竞技场牌库",
      deck: [
        { name: "真实竞技场牌", count: confirmedCount, remaining: confirmedCount, drawn: 0, played: 0 },
        ...unresolvedRows
      ],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0, opponentPlayedCount: 0 },
      arena: {
        status: "complete",
        currentChoices: [],
        picks: [],
        deck: [{ name: "真实竞技场牌", count: confirmedCount }, ...unresolvedArenaRows],
        draftCount: confirmedCount,
        unresolvedCount
      }
    };

    const view = toOverlayPanelViewModel(state);

    expect(view.deckIdentity.detail).toBe(identityDetail);
    expect(view.remainingDeck).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "真实竞技场牌" }),
      ...(unresolvedCount > 0 ? [expect.objectContaining({ unresolved: true })] : [])
    ]));
    expect(view.arena).toMatchObject({ confirmedCount, unresolvedCount, progress });
    expect(view.arena?.deck).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "真实竞技场牌" }),
      ...(unresolvedCount > 0 ? [expect.objectContaining({ unresolved: true })] : [])
    ]));
  });
});
