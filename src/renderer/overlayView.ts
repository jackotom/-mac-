import type { ArenaCardChoice, ArenaState, CardTrackerRow, PublicTrackerState, TrackerEvent, TrackerZoneCard } from "../shared/types";
import type {
  OverlayArenaChoice,
  OverlayCardItem,
  OverlayDeckIdentity,
  OverlayPanelViewModel,
  OverlayStatusTone
} from "./types";

export interface OverlayViewOptions {
  maxDeckRows?: number;
  maxRecentRows?: number;
}

const defaultMaxDeckRows = 40;
const defaultMaxRecentRows = 5;

const statusLabels: Record<
  PublicTrackerState["status"],
  {
    tone: OverlayStatusTone;
    label: string;
  }
> = {
  idle: { tone: "ready", label: "待命" },
  watching: { tone: "tracking", label: "监听中" },
  paused: { tone: "paused", label: "已暂停" },
  "missing-log": { tone: "offline", label: "缺少日志" },
  error: { tone: "error", label: "异常" }
};

export function toOverlayPanelViewModel(
  state: PublicTrackerState,
  options: OverlayViewOptions = {}
): OverlayPanelViewModel {
  const maxDeckRows = normalizeLimit(options.maxDeckRows, defaultMaxDeckRows);
  const maxRecentRows = normalizeLimit(options.maxRecentRows, defaultMaxRecentRows);
  const recentEvents = [...state.events].reverse();
  const logIssueStatus = toLogIssueStatus(state);
  const isRecognizingConstructedDeck = Boolean(state.constructedScreenMode && !state.autoMatchedDeckId);
  const shouldClearTrackedData = Boolean(logIssueStatus || isRecognizingConstructedDeck);
  const constructedRecognitionStatus = isRecognizingConstructedDeck && state.error
    ? { tone: "error" as const, label: "识别失败" }
    : undefined;
  const arena = state.arena && state.arena.status !== "inactive" && !logIssueStatus ? toArenaView(state.arena, maxDeckRows) : undefined;

  return {
    summary: {
      totalCards: shouldClearTrackedData ? 0 : state.summary.totalCards,
      remainingCards: shouldClearTrackedData ? 0 : state.summary.remainingCards,
      drawnCards: shouldClearTrackedData ? 0 : state.summary.drawnCards
    },
    deckIdentity: toDeckIdentity(state),
    remainingDeck: shouldClearTrackedData ? [] : toRemainingDeckItems(state.deck, maxDeckRows),
    handCards: shouldClearTrackedData ? [] : toZoneCardItems(state.friendlyHand ?? [], "hand", maxDeckRows),
    otherCards: shouldClearTrackedData ? [] : toZoneCardItems(state.friendlyOther ?? [], "other", maxDeckRows),
    recentDraws: shouldClearTrackedData
      ? []
      : recentEvents.filter(isFriendlyDraw).slice(0, maxRecentRows).map((event) => toDrawItem(event, state.deck)),
    opponentRecentPlays: shouldClearTrackedData ? [] : toOpponentPlayedItems(state.opponentPlayed, maxRecentRows),
    opponentSecrets: shouldClearTrackedData ? [] : toOpponentSecretSlots(state.opponentSecrets ?? []),
    boardAttack: shouldClearTrackedData ? { friendly: 0, opponent: 0 } : state.boardAttack ?? { friendly: 0, opponent: 0 },
    status: {
      ...(logIssueStatus ?? constructedRecognitionStatus ?? statusLabels[state.status]),
      detail: logIssueStatus ? "先点修复日志，然后重启炉石/开始一局" : state.error ?? statusDetail(state),
      updatedAtLabel: formatTimeLabel(state.lastUpdated)
    },
    arena
  };
}

function toOpponentSecretSlots(slots: NonNullable<PublicTrackerState["opponentSecrets"]>) {
  return slots.map((slot, slotIndex) => ({
    id: slot.entityId,
    label: `? ${slotIndex + 1}`,
    candidates: slot.candidates.map((candidate) => ({
      id: candidate.cardId,
      name: candidate.name,
      status: candidate.status
    }))
  }));
}

function toDeckIdentity(state: PublicTrackerState): OverlayDeckIdentity {
  if (state.arena?.status && state.arena.status !== "inactive") {
    return {
      name: "竞技场牌库",
      status: "arena",
      detail: `已选 ${state.arena.draftCount}/30`
    };
  }

  if (state.autoMatchedDeckId) {
    return {
      name: state.deckName?.trim() || "已识别套牌",
      status: "automatic",
      detail: "自动识别当前对局"
    };
  }

  if (state.constructedScreenMode) {
    return {
      name: "正在识别套牌",
      status: "waiting",
      detail: state.constructedScreenMode === "standard" ? "标准套牌识别中" : "狂野套牌识别中"
    };
  }

  return {
    name: "等待识别",
    status: "waiting",
    detail: "抽到或打出卡牌后自动匹配"
  };
}

function toArenaView(state: ArenaState, maxDeckRows: number) {
  const isChoosing = (state.status === "drafting" || state.status === "redrafting") && state.currentChoices.length >= 3;
  const choices = isChoosing
    ? [...state.currentChoices]
        .slice(0, 3)
        .sort((left, right) => (right.score ?? -1) - (left.score ?? -1))
        .map(toArenaChoice)
    : [];
  const latestPick = state.picks[state.picks.length - 1]?.chosen;

  return {
    isChoosing,
    statusLabel: state.status === "drafting" ? "选牌中" : state.status === "redrafting" ? "重选中" : state.status === "playing" ? "对局中" : "牌库已生成",
    progress: `${state.draftCount}/30`,
    hero: state.hero?.name ?? "等待职业",
    scoreSource: state.scoreSource,
    error: state.error,
    choices,
    deck: state.deck
      .map((card, index) => ({
        id: `arena-deck-${index}-${card.cardId ?? card.name}`,
        name: card.name,
        cost: card.details?.manaCost,
        count: card.count,
        details: card.details,
        thumbnailUrl: card.details?.cropImageUrl ?? card.details?.imageUrl
      }))
      .slice(0, maxDeckRows),
    deckCount: state.deck.reduce((total, card) => total + card.count, 0),
    lastPick: latestPick ? toArenaChoice(latestPick) : undefined
  } satisfies NonNullable<OverlayPanelViewModel["arena"]>;
}

function toArenaChoice(
  choice: Pick<ArenaCardChoice, "cardId" | "name" | "score" | "details" | "quality" | "rating">
): OverlayArenaChoice {
  return {
    id: `arena-choice-${choice.cardId ?? choice.name}`,
    name: choice.name,
    score: choice.score,
    thumbnailUrl: choice.details?.cropImageUrl ?? choice.details?.imageUrl,
    details: choice.details,
    quality: choice.quality,
    rating: choice.rating,
    ratingSummary: formatRatingSummary(choice.rating)
  };
}

function formatRatingSummary(rating: ArenaCardChoice["rating"]): string | undefined {
  if (!rating) {
    return undefined;
  }

  const parts = [rating.hearthArena === undefined ? undefined : `HA ${rating.hearthArena}`];
  if (rating.firestone?.includedWinrate !== undefined) {
    parts.push(`入选胜率 ${rating.firestone.includedWinrate.toFixed(1)}%`);
  }
  if (rating.highWinPickRate !== undefined) {
    const label = rating.highWinThreshold === undefined ? "高胜选取" : `${rating.highWinThreshold}+胜选取`;
    parts.push(`${label} ${rating.highWinPickRate.toFixed(1)}%`);
  }
  if (rating.twelveWinRate !== undefined) {
    parts.push(`实际12胜 ${rating.twelveWinRate.toFixed(1)}%`);
  }
  return parts.filter((part): part is string => part !== undefined).join(" · ") || undefined;
}

function toLogIssueStatus(state: PublicTrackerState): { tone: OverlayStatusTone; label: string } | undefined {
  if (state.status === "missing-log") {
    return { tone: "offline", label: "缺少 Power.log" };
  }

  if (isPlayerOnlyLogPath(state.logPath)) {
    return { tone: "offline", label: "只有 Player.log" };
  }

  return undefined;
}

function toRemainingDeckItems(rows: readonly CardTrackerRow[], maxRows: number): OverlayCardItem[] {
  return [...rows]
    .filter((row) => row.remaining > 0)
    .sort(compareCardsByMana)
    .slice(0, maxRows)
    .map((row, index) => ({
      id: `deck-${index}-${row.name}`,
      name: row.name,
      cost: row.details?.manaCost,
      count: row.remaining,
      detail: `剩 ${row.remaining}/${row.count}`,
      thumbnailUrl: row.details?.cropImageUrl ?? row.details?.imageUrl,
      details: row.details
    }));
}

function toZoneCardItems(rows: readonly TrackerZoneCard[], prefix: "hand" | "other", maxRows: number): OverlayCardItem[] {
  return [...rows]
    .sort(compareCardsByMana)
    .slice(0, maxRows)
    .map((row, index) => ({
      id: `${prefix}-${index}-${row.cardId ?? row.name}`,
      name: row.name,
      cost: row.details?.manaCost,
      count: row.count,
      thumbnailUrl: row.details?.cropImageUrl ?? row.details?.imageUrl,
      details: row.details
    }));
}

function compareCardsByMana(
  left: Pick<CardTrackerRow | TrackerZoneCard, "name" | "details">,
  right: Pick<CardTrackerRow | TrackerZoneCard, "name" | "details">
) {
  const leftCost = left.details?.manaCost ?? Number.POSITIVE_INFINITY;
  const rightCost = right.details?.manaCost ?? Number.POSITIVE_INFINITY;
  return leftCost - rightCost || left.name.localeCompare(right.name, "zh-CN");
}

function isFriendlyDraw(event: TrackerEvent): boolean {
  return event.kind === "draw" && event.player === "friendly";
}

function toDrawItem(event: TrackerEvent, rows: readonly CardTrackerRow[]): OverlayCardItem {
  return {
    id: event.id,
    name: event.cardName?.trim() || "未知卡牌",
    detail: `抽牌 ${formatTimeLabel(event.at)}`,
    details: findDetails(rows, event)
  };
}

function toOpponentPlayedItems(rows: readonly CardTrackerRow[], maxRows: number): OverlayCardItem[] {
  return rows
    .filter((row) => row.played > 0 && isDisplayableOpponentCardName(row.name))
    .sort((left, right) => right.played - left.played || left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, maxRows)
    .map((row, index) => ({
      id: `opponent-${index}-${row.cardId ?? row.name}`,
      name: row.name,
      count: row.played,
      detail: "本局已出",
      thumbnailUrl: row.details?.cropImageUrl ?? row.details?.imageUrl,
      details: row.details
    }));
}

function isDisplayableOpponentCardName(value: string): boolean {
  const name = value.trim();
  if (!name) {
    return false;
  }

  return !/^(?:cost|attack|health|durability)\s*[-:]?\s*\d+$/i.test(name);
}

function findDetails(rows: readonly CardTrackerRow[], event: TrackerEvent) {
  const normalizedCardId = event.cardId?.trim().toLocaleLowerCase();
  const byCardId = normalizedCardId
    ? rows.find((row) => row.cardId?.trim().toLocaleLowerCase() === normalizedCardId)
    : undefined;
  const byName = event.cardName?.trim()
    ? rows.find((row) => row.name.trim() === event.cardName?.trim())
    : undefined;
  return (byCardId ?? byName)?.details;
}

function statusDetail(state: PublicTrackerState): string {
  if (state.status === "error") {
    return state.error ?? "监听异常";
  }

  if (state.status === "missing-log") {
    return state.logPath ? `找不到 ${compactPath(state.logPath)}` : "未找到日志";
  }

  if (state.status === "watching") {
    return state.logPath ? `监听 ${compactPath(state.logPath)}` : "正在监听日志";
  }

  if (state.status === "paused") {
    return "监听已暂停";
  }

  return state.logPath ? `已选择 ${compactPath(state.logPath)}` : "等待开始监听";
}

function isPlayerOnlyLogPath(logPath: string | undefined): boolean {
  return Boolean(logPath?.trim().match(/(^|[\\/])Player\.log$/i));
}

function compactPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);

  if (parts.length <= 2) {
    return path;
  }

  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function formatTimeLabel(value: string | undefined): string {
  if (!value) {
    return "刚刚";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}
