import { describe, expect, it } from "vitest";
import { toDashboardViewModel } from "../src/renderer/dashboardView";
import type { LadderDeckRecommendationResult } from "../src/shared/ladderDeckRecommendation";
import type { MatchHistoryResult, PublicTrackerState } from "../src/shared/types";
import { createPublicTrackerState } from "./fixtures/publicTrackerState";

const liveState = createPublicTrackerState({
  status: "watching",
  gameActive: true,
  logPath: "/Logs/Power.log",
  deckName: "真实卡组",
  deck: [
    { name: "火球术", cardId: "EX1_277", count: 2, remaining: 1, drawn: 1, played: 0 },
    { name: "未识别卡牌", count: 3, remaining: 3, drawn: 0, played: 0, unresolved: true }
  ],
  opponentDeckCount: 23,
  opponentHandCount: 7,
  opponentPlayed: [
    { name: "寒冰箭", cardId: "CS2_024", count: 0, remaining: 0, drawn: 0, played: 2 }
  ],
  opponentSecrets: [{ entityId: "secret-1", candidates: [] }],
  events: [
    {
      id: "event-1",
      at: "2026-07-22T04:30:00.000Z",
      kind: "opponent-play",
      player: "opponent",
      cardName: "寒冰箭"
    }
  ],
  arena: {
    status: "drafting",
    hero: { name: "法师" },
    currentChoices: [],
    picks: [],
    deck: [{ name: "已确认牌", count: 27 }],
    draftCount: 27,
    unresolvedCount: 3,
    scoreSource: "HearthArena 简中"
  },
  summary: { totalCards: 30, remainingCards: 21, drawnCards: 9, opponentPlayedCount: 2 },
  lastUpdated: "2026-07-22T04:31:00.000Z"
});

const truthfulLiveState = createPublicTrackerState({
  ...liveState,
  opponentDeckCount: 99,
  opponentHandCount: 88,
  opponentPlayed: [
    { name: "旧字段假牌", cardId: "LEGACY_FAKE", count: 0, remaining: 0, drawn: 0, played: 9 }
  ],
  opponentSecrets: [],
  summary: { ...liveState.summary, opponentPlayedCount: 9 },
  matchCounters: {
    friendly: {},
    opponent: { nextFatigueDamage: 3 }
  },
  cardTracking: {
    schemaVersion: 1,
    gameKey: "game-truth",
    friendly: emptyPlayerTracking(),
    opponent: {
      ...emptyPlayerTracking(),
      current: {
        ...emptyPlayerTracking().current,
        hand: { status: "partial", knownCount: 0, totalCount: 7, cards: [] },
        deck: { status: "partial", knownCount: 0, totalCount: 23, cards: [] },
        secret: { status: "partial", knownCount: 0, totalCount: 1, cards: [] }
      },
      used: {
        totalCount: 2,
        truncated: false,
        items: [
          {
            id: "used-12",
            sequence: 12,
            entityId: "entity-12",
            card: { cardKey: "CS2_024", cardId: "CS2_024", name: "寒冰箭" },
            confidence: "confirmed"
          },
          {
            id: "used-11",
            sequence: 11,
            entityId: "entity-11",
            card: { cardKey: "CS2_024", cardId: "CS2_024", name: "寒冰箭" },
            confidence: "confirmed"
          }
        ]
      }
    },
    opponentSecretSlots: [{ entityId: "secret-1", candidates: [] }],
    detailsByCardKey: {}
  }
});

function emptyPlayerTracking(): NonNullable<PublicTrackerState["cardTracking"]>["friendly"] {
  const known = () => ({ status: "known" as const, knownCount: 0, totalCount: 0, cards: [] });
  return {
    current: {
      deck: known(),
      hand: known(),
      play: known(),
      secret: known(),
      graveyard: known(),
      removed: known()
    },
    burned: { totalCount: 0, items: [], truncated: false },
    used: { totalCount: 0, items: [], truncated: false }
  };
}

const realLadder: LadderDeckRecommendationResult = {
  status: "ready",
  stale: false,
  gameVersion: "31.2.2",
  recommendation: {
    id: "real-deck",
    mode: "standard",
    region: "CN",
    patch: "31.2.2",
    name: "真实推荐",
    className: "法师",
    winRate: 55.1,
    games: 802,
    deckCode: "REAL-CODE",
    cards: [],
    source: { name: "国服数据", url: "https://example.com/source" },
    updatedAt: "2026-07-22T03:00:00.000Z"
  }
};

const realHistory: MatchHistoryResult = {
  status: "ok",
  matches: [
    { id: "match-1", result: "win", mode: "standard", deckName: "真实卡组", endedAt: "2026-07-22T04:00:00.000Z" },
    { id: "match-2", result: "loss", mode: "standard", deckName: "真实卡组", endedAt: "2026-07-22T03:00:00.000Z" },
    { id: "match-3", result: "win", mode: "wild", deckName: "另一卡组", endedAt: "2026-07-22T02:00:00.000Z" }
  ],
  summary: { total: 3, wins: 2, losses: 1, ties: 0, winRate: 2 / 3 }
};

describe("dashboard view model", () => {
  it("maps confirmed tracker and history data without inventing values", () => {
    const view = toDashboardViewModel(truthfulLiveState, realHistory, realLadder);

    expect(view.tracker).toEqual({
      status: "watching",
      state: "ready",
      label: "正在监听",
      gameActive: true,
      logPath: "/Logs/Power.log",
      lastUpdated: "2026-07-22T04:31:00.000Z"
    });
    expect(view.activity).toMatchObject({
      currentLabel: "对局进行中",
      gameActive: true,
      historyState: "ready",
      recentMatch: realHistory.status === "ok" ? realHistory.matches[0] : undefined
    });
    expect(view.ladder).toEqual({
      state: "ready",
      message: undefined,
      gameVersion: "31.2.2",
      stale: false,
      recommendation: realLadder.status === "ready" ? realLadder.recommendation : undefined
    });
    expect(view.arena).toMatchObject({
      state: "ready",
      status: "drafting",
      statusLabel: "选牌中",
      hero: "法师",
      confirmedCount: 27,
      unresolvedCount: 3,
      scoreSource: "HearthArena 简中"
    });
    expect(view.deck).toEqual({
      state: "ready",
      message: undefined,
      name: "真实卡组",
      totalCards: 30,
      remainingCards: 21,
      drawnCards: 9,
      cards: [{ id: "EX1_277", name: "火球术", cardId: "EX1_277", total: 2, remaining: 1, drawn: 1 }]
    });
    expect(view.opponent).toEqual({
      state: "ready",
      message: undefined,
      playedCount: 2,
      deckCount: 23,
      handCount: 7,
      secretCount: 1,
      currentTurn: "?",
      fatigueDamage: 3,
      playedCards: [
        { id: "used-12", name: "寒冰箭", cardId: "CS2_024", count: 1, turn: "?" },
        { id: "used-11", name: "寒冰箭", cardId: "CS2_024", count: 1, turn: "?" }
      ]
    });
    expect(view.events.items).toEqual([
      {
        id: "event-1",
        at: "2026-07-22T04:30:00.000Z",
        kind: "opponent-play",
        player: "opponent",
        cardName: "寒冰箭"
      }
    ]);
    expect(view.history).toEqual({
      state: "ready",
      message: undefined,
      total: 3,
      wins: 2,
      losses: 1,
      ties: 0,
      winRate: 2 / 3
    });
  });

  it("leaves unavailable opponent counts unset instead of estimating them", () => {
    const state = createPublicTrackerState({
      ...liveState,
      opponentDeckCount: undefined,
      opponentHandCount: undefined,
      opponentSecrets: undefined
    });

    const view = toDashboardViewModel(state, realHistory);

    expect(view.opponent.deckCount).toBeUndefined();
    expect(view.opponent.handCount).toBeUndefined();
    expect(view.opponent.secretCount).toBe(0);
    expect(view.opponent.currentTurn).toBe("?");
    expect(view.opponent.fatigueDamage).toBeUndefined();
  });

  it("returns explicit empty states when no real dashboard data exists", () => {
    const state = createPublicTrackerState({
      status: "missing-log",
      deck: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    });

    const view = toDashboardViewModel(state);

    expect(view.tracker).toMatchObject({ state: "empty", label: "未找到日志", gameActive: false });
    expect(view.deck).toMatchObject({ state: "empty", totalCards: 0, remainingCards: 0, drawnCards: 0, cards: [] });
    expect(view.deck.message).toContain("Power.log");
    expect(view.opponent).toEqual({
      state: "ready",
      message: undefined,
      playedCount: 0,
      deckCount: undefined,
      handCount: undefined,
      secretCount: 0,
      currentTurn: "?",
      fatigueDamage: undefined,
      playedCards: []
    });
    expect(view.events).toEqual({ state: "empty", message: "本局还没有可展示的事件。", items: [] });
    expect(view.history).toEqual({ state: "unavailable", message: "尚未读取真实对局历史。" });
    expect(view.activity).toEqual({
      currentLabel: "未找到日志",
      gameActive: false,
      historyState: "unavailable",
      historyMessage: "尚未读取对局历史。"
    });
    expect(view.ladder).toEqual({ state: "unavailable", message: "正在读取天梯推荐…", gameVersion: undefined });
    expect(view.arena).toEqual({ state: "empty", message: "尚未进入竞技场选牌。" });
    expect("news" in view).toBe(false);
    expect("leaderboard" in view).toBe(false);
  });

  it("does not present zero completed matches as a zero-percent win rate", () => {
    const history: MatchHistoryResult = {
      status: "ok",
      matches: [],
      summary: { total: 0, wins: 0, losses: 0, ties: 0, winRate: 0 }
    };

    expect(toDashboardViewModel(liveState, history).history).toEqual({
      state: "empty",
      message: "还没有已完成的对局记录。",
      total: 0,
      wins: 0,
      losses: 0,
      ties: 0
    });
  });

  it("keeps a history read failure visible instead of replacing it with statistics", () => {
    const history: MatchHistoryResult = { status: "error", error: "对局历史文件损坏" };

    expect(toDashboardViewModel(liveState, history).history).toEqual({
      state: "error",
      message: "对局历史文件损坏"
    });
  });

  it("keeps an unavailable ladder reason and arena error explicit", () => {
    const view = toDashboardViewModel(
      { ...liveState, arena: { ...liveState.arena!, error: "竞技场日志读取失败" } },
      realHistory,
      { status: "unavailable", errorCode: "patch-unavailable", message: "当前版本无可信数据" }
    );

    expect(view.ladder).toEqual({ state: "unavailable", message: "当前版本无可信数据", gameVersion: undefined });
    expect(view.arena).toEqual({ state: "error", message: "竞技场日志读取失败" });
  });
});
