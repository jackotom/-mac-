import type {
  CardTrackerRow,
  MatchRecord,
  MatchHistoryResult,
  PublicCardZoneGroup,
  PublicTrackerState
} from "../shared/types";
import type { CardDetails } from "../shared/cardDatabase";
import type { LadderDeckRecommendationResult } from "../shared/ladderDeckRecommendation";

export type DashboardDataState = "ready" | "empty" | "unavailable" | "error";

export interface DashboardTrackerView {
  readonly status: PublicTrackerState["status"];
  readonly state: "ready" | "empty" | "error";
  readonly label: string;
  readonly gameActive: boolean;
  readonly logPath?: string;
  readonly lastUpdated?: string;
}

export interface DashboardDeckCardView {
  readonly id: string;
  readonly name: string;
  readonly cardId?: string;
  readonly total: number;
  readonly remaining: number;
  readonly drawn: number;
}

export interface DashboardDeckView {
  readonly state: "ready" | "empty";
  readonly message?: string;
  readonly name?: string;
  readonly totalCards: number;
  readonly remainingCards: number;
  readonly drawnCards: number;
  readonly cards: readonly DashboardDeckCardView[];
}

export interface DashboardOpponentCardView {
  readonly id: string;
  readonly name: string;
  readonly cardId?: string;
  readonly count: number;
  readonly turn: "?";
  readonly details?: CardDetails;
}

export interface DashboardOpponentView {
  readonly state: "ready" | "empty";
  readonly message?: string;
  readonly playedCount: number;
  readonly deckCount?: number;
  readonly handCount?: number;
  readonly secretCount?: number;
  readonly currentTurn: "?";
  readonly fatigueDamage?: number;
  readonly playedCards: readonly DashboardOpponentCardView[];
}

export interface DashboardEventsView {
  readonly state: "ready" | "empty";
  readonly message?: string;
  readonly items: readonly DashboardEventView[];
}

export interface DashboardEventView {
  readonly id: string;
  readonly at: string;
  readonly kind: PublicTrackerState["events"][number]["kind"];
  readonly player: PublicTrackerState["events"][number]["player"];
  readonly cardName?: string;
  readonly fromZone?: PublicTrackerState["events"][number]["fromZone"];
  readonly toZone?: PublicTrackerState["events"][number]["toZone"];
}

export interface DashboardHistoryView {
  readonly state: DashboardDataState;
  readonly message?: string;
  readonly total?: number;
  readonly wins?: number;
  readonly losses?: number;
  readonly ties?: number;
  readonly winRate?: number;
}

export interface DashboardActivityView {
  readonly currentLabel: string;
  readonly gameActive: boolean;
  readonly historyState: DashboardDataState;
  readonly historyMessage?: string;
  readonly recentMatch?: MatchRecord;
}

export interface DashboardLadderView {
  readonly state: "ready" | "unavailable";
  readonly message?: string;
  readonly gameVersion?: string;
  readonly stale?: boolean;
  readonly recommendation?: Extract<LadderDeckRecommendationResult, { status: "ready" }>["recommendation"];
}

export interface DashboardArenaView {
  readonly state: "ready" | "empty" | "error";
  readonly message?: string;
  readonly status?: NonNullable<PublicTrackerState["arena"]>["status"];
  readonly statusLabel?: string;
  readonly hero?: string;
  readonly confirmedCount?: number;
  readonly unresolvedCount?: number;
  readonly scoreSource?: string;
  readonly lastUpdated?: string;
}

export interface DashboardViewModel {
  readonly tracker: DashboardTrackerView;
  readonly activity: DashboardActivityView;
  readonly ladder: DashboardLadderView;
  readonly arena: DashboardArenaView;
  readonly deck: DashboardDeckView;
  readonly opponent: DashboardOpponentView;
  readonly events: DashboardEventsView;
  readonly history: DashboardHistoryView;
}

const trackerLabels: Record<PublicTrackerState["status"], string> = {
  idle: "等待开始",
  watching: "正在监听",
  paused: "已暂停",
  "missing-log": "未找到日志",
  error: "读取失败"
};

export function toDashboardViewModel(
  tracker: PublicTrackerState,
  history?: MatchHistoryResult,
  ladder?: LadderDeckRecommendationResult
): DashboardViewModel {
  const hasDeck = tracker.summary.totalCards > 0 || tracker.deck.length > 0;
  return {
    tracker: {
      status: tracker.status,
      state: tracker.status === "error" ? "error" : tracker.status === "idle" || tracker.status === "missing-log" ? "empty" : "ready",
      label: trackerLabels[tracker.status],
      gameActive: tracker.gameActive === true,
      logPath: tracker.logPath,
      lastUpdated: tracker.lastUpdated
    },
    activity: toActivityView(tracker, history),
    ladder: ladder?.status === "ready"
      ? {
          state: "ready",
          message: ladder.message,
          gameVersion: ladder.gameVersion,
          stale: ladder.stale,
          recommendation: ladder.recommendation
        }
      : {
          state: "unavailable",
          message: ladder?.message ?? "正在读取天梯推荐…",
          gameVersion: ladder?.gameVersion
        },
    arena: toArenaView(tracker),
    deck: {
      state: hasDeck ? "ready" : "empty",
      message: hasDeck ? undefined : tracker.status === "missing-log"
        ? "还没有可用的 Power.log。"
        : "尚未识别到当前牌库。",
      name: tracker.deckName,
      totalCards: tracker.summary.totalCards,
      remainingCards: tracker.summary.remainingCards,
      drawnCards: tracker.summary.drawnCards,
      cards: tracker.deck.filter((card) => !card.unresolved).map(toDeckCard)
    },
    opponent: toDashboardOpponentView(tracker),
    events: tracker.events.length > 0
      ? { state: "ready", message: undefined, items: tracker.events.map((event) => ({
          id: event.id,
          at: event.at,
          kind: event.kind,
          player: event.player,
          cardName: event.cardName,
          fromZone: event.fromZone,
          toZone: event.toZone
        })) }
      : { state: "empty", message: "本局还没有可展示的事件。", items: [] },
    history: toHistoryView(history)
  };
}

function toActivityView(tracker: PublicTrackerState, history: MatchHistoryResult | undefined): DashboardActivityView {
  const currentLabel = tracker.status === "watching" && tracker.gameActive
    ? "对局进行中"
    : trackerLabels[tracker.status];
  if (!history) {
    return { currentLabel, gameActive: tracker.gameActive === true, historyState: "unavailable", historyMessage: "尚未读取对局历史。" };
  }
  if (history.status === "error") {
    return { currentLabel, gameActive: tracker.gameActive === true, historyState: "error", historyMessage: history.error };
  }
  const recentMatch = [...history.matches].sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))[0];
  return recentMatch
    ? { currentLabel, gameActive: tracker.gameActive === true, historyState: "ready", recentMatch }
    : { currentLabel, gameActive: tracker.gameActive === true, historyState: "empty", historyMessage: "还没有已完成的对局记录。" };
}

function toArenaView(tracker: PublicTrackerState): DashboardArenaView {
  const arena = tracker.arena;
  if (!arena || arena.status === "inactive") {
    return { state: "empty", message: "尚未进入竞技场选牌。" };
  }
  if (arena.error) {
    return { state: "error", message: arena.error };
  }
  const statusLabels: Record<typeof arena.status, string> = {
    drafting: "选牌中",
    redrafting: "重选中",
    complete: "选牌完成",
    playing: "对局中"
  };
  return {
    state: "ready",
    status: arena.status,
    statusLabel: statusLabels[arena.status],
    hero: arena.hero?.name,
    confirmedCount: arena.draftCount,
    unresolvedCount: arena.unresolvedCount,
    scoreSource: arena.scoreSource,
    lastUpdated: arena.lastUpdated
  };
}

function toDeckCard(card: CardTrackerRow, index: number): DashboardDeckCardView {
  return {
    id: card.cardId ?? `${card.name}-${index}`,
    name: card.name,
    cardId: card.cardId,
    total: card.count,
    remaining: card.remaining,
    drawn: card.drawn
  };
}

export function toDashboardOpponentView(tracker: PublicTrackerState): DashboardOpponentView {
  const tracking = tracker.cardTracking;
  const opponent = tracking.opponent;
  const detailsByCardKey = tracking.detailsByCardKey;
  const playedCards = opponent.used.items.map((item) => {
    const card = item.card;
    return {
      id: item.id,
      name: card?.name ?? "未知卡牌",
      cardId: card?.cardId,
      count: 1,
      turn: "?" as const,
      details: card ? detailsByCardKey[card.cardKey] : undefined
    };
  });
  const deckCount = toZoneCount(opponent.current.deck);
  const handCount = toZoneCount(opponent.current.hand);
  const secretCount = toZoneCount(opponent.current.secret);
  const hasPositiveZoneCount = [deckCount, handCount, secretCount]
    .some((count) => count !== undefined && count > 0);
  const hasOpponentData = Boolean(
    tracker.gameActive ||
    opponent.used.totalCount ||
    hasPositiveZoneCount ||
    tracker.matchCounters?.opponent.nextFatigueDamage !== undefined ||
    tracker.matchCounters?.opponent.corpses !== undefined ||
    tracker.matchCounters?.opponent.spellsPlayed !== undefined
  );

  return {
    state: hasOpponentData ? "ready" : "empty",
    message: hasOpponentData ? undefined : "尚无对手的已确认数据。",
    playedCount: opponent.used.totalCount,
    deckCount: hasOpponentData ? deckCount : undefined,
    handCount: hasOpponentData ? handCount : undefined,
    secretCount: hasOpponentData ? secretCount : undefined,
    currentTurn: "?",
    fatigueDamage: tracker.matchCounters?.opponent.nextFatigueDamage,
    playedCards
  };
}

function toZoneCount(group: PublicCardZoneGroup | undefined): number | undefined {
  if (!group || group.status === "unknown") {
    return undefined;
  }
  return group.totalCount ?? group.knownCount;
}

function toHistoryView(history: MatchHistoryResult | undefined): DashboardHistoryView {
  if (!history) {
    return { state: "unavailable", message: "尚未读取真实对局历史。" };
  }
  if (history.status === "error") {
    return { state: "error", message: history.error };
  }
  if (history.summary.total === 0) {
    return {
      state: "empty",
      message: "还没有已完成的对局记录。",
      total: 0,
      wins: 0,
      losses: 0,
      ties: 0
    };
  }
  return {
    state: "ready",
    message: undefined,
    total: history.summary.total,
    wins: history.summary.wins,
    losses: history.summary.losses,
    ties: history.summary.ties,
    winRate: history.summary.winRate
  };
}
