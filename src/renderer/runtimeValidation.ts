import {
  TRACKER_ACCENT_COLORS,
  type MatchHistoryResult,
  type PublicTrackerState,
  type TrackerSettings
} from "../shared/types";

const trackerStatuses = new Set(["idle", "watching", "paused", "missing-log", "error"]);
const arenaStatuses = new Set(["inactive", "drafting", "redrafting", "complete", "playing"]);
const arenaScoreTiers = new Set(["s", "a", "b", "c", "d", "f", "unknown"]);
const matchModes = new Set(["standard", "wild", "arena", "unknown"]);
const matchResults = new Set(["win", "loss", "tie"]);

export function parsePublicTrackerState(value: unknown): PublicTrackerState {
  if (!isRecord(value) || typeof value.status !== "string" || !trackerStatuses.has(value.status) || !Array.isArray(value.deck) ||
      !Array.isArray(value.opponentPlayed) || !Array.isArray(value.events) || !isSummary(value.summary)) {
    throw new Error("记牌器状态数据无效，已拒绝更新界面。");
  }
  if (value.arena !== undefined && !isArenaState(value.arena)) {
    throw new Error("竞技场状态数据无效，已拒绝更新界面。");
  }
  if (!["opponentDeck", "opponentHand", "opponentOther"].every((key) => isOptionalZoneCards(value[key])) ||
      !["opponentDeckCount", "opponentHandCount"].every((key) => isOptionalNonNegativeInteger(value[key]))) {
    throw new Error("对手区域数据无效，已拒绝更新界面。");
  }
  if (!isOptionalZoneCards(value.globalEffects) || !isOptionalZoneCards(value.opponentGlobalEffects)) {
    throw new Error("全局影响数据无效，已拒绝更新界面。");
  }
  if (!isOptionalMatchCounters(value.matchCounters)) {
    throw new Error("本局公开计数数据无效，已拒绝更新界面。");
  }
  return value as unknown as PublicTrackerState;
}

export function parseTrackerSettings(value: unknown): TrackerSettings {
  if (!hasExactKeys(value, ["ladder", "arena", "general", "overlay", "appearance", "other"]) ||
      !isTrackerModeSettings(value.ladder) || !isTrackerModeSettings(value.arena) ||
      !isGeneralSettings(value.general) || !isOverlaySettings(value.overlay) ||
      !isAppearanceSettings(value.appearance) || !isOtherSettings(value.other)) {
    throw new Error("设置数据无效，已拒绝更新界面。");
  }
  return value as unknown as TrackerSettings;
}

export function parseMatchHistoryResult(value: unknown): MatchHistoryResult {
  if (!isRecord(value)) {
    throw invalidMatchHistory();
  }

  if (value.status === "error") {
    if (typeof value.error !== "string" || !value.error.trim()) {
      throw invalidMatchHistory();
    }
    return value as unknown as MatchHistoryResult;
  }

  if (value.status !== "ok" || !Array.isArray(value.matches) || !isMatchHistorySummary(value.summary) ||
      !value.matches.every(isMatchRecord) || value.summary.total !== value.matches.length ||
      value.summary.total !== value.summary.wins + value.summary.losses + value.summary.ties) {
    throw invalidMatchHistory();
  }

  return value as unknown as MatchHistoryResult;
}

function isSummary(value: unknown): boolean {
  return isRecord(value) && ["totalCards", "remainingCards", "drawnCards", "opponentPlayedCount"]
    .every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

function isTrackerModeSettings(value: unknown): boolean {
  return hasExactKeys(value, ["friendlyDeckTracker", "opponentDeckTracker"]) &&
    typeof value.friendlyDeckTracker === "boolean" &&
    typeof value.opponentDeckTracker === "boolean";
}

function isGeneralSettings(value: unknown): boolean {
  return hasExactKeys(value, [
    "launchAtLogin", "startMinimized", "showGameStatusIcon", "minimizeToMenuBar",
    "focusOnOpen", "gameDetection", "gameLanguage", "windowMatching"
  ]) &&
    [value.launchAtLogin, value.startMinimized, value.showGameStatusIcon, value.minimizeToMenuBar, value.focusOnOpen]
      .every((item) => typeof item === "boolean") &&
    isOneOf(value.gameDetection, ["automatic", "manual"]) &&
    isOneOf(value.gameLanguage, ["zh-CN", "zh-TW", "en-US"]) &&
    isOneOf(value.windowMatching, ["smart", "title", "process"]);
}

function isOverlaySettings(value: unknown): boolean {
  return hasExactKeys(value, [
    "enabled", "arenaHeroWinRateRanking", "showFriendlyAttack", "showOpponentAttack", "secretPrediction", "position",
    "offsetX", "offsetY", "opacity", "hideInFullscreen"
  ]) &&
    [value.enabled, value.arenaHeroWinRateRanking, value.showFriendlyAttack, value.showOpponentAttack, value.secretPrediction, value.hideInFullscreen]
      .every((item) => typeof item === "boolean") &&
    isOneOf(value.position, ["left", "right"]) &&
    isNumberInRange(value.offsetX, -200, 200) &&
    isNumberInRange(value.offsetY, -200, 200) &&
    isNumberInRange(value.opacity, 30, 100);
}

function isAppearanceSettings(value: unknown): boolean {
  return hasExactKeys(value, ["theme", "accentColor", "fontSize", "zoom", "animations", "cardImageQuality"]) &&
    isOneOf(value.theme, ["dark", "light", "system"]) &&
    isOneOf(value.accentColor, TRACKER_ACCENT_COLORS) &&
    isOneOf(value.fontSize, ["small", "medium", "large"]) &&
    isNumberInRange(value.zoom, 80, 120) &&
    typeof value.animations === "boolean" &&
    isOneOf(value.cardImageQuality, ["low", "high"]);
}

function isOtherSettings(value: unknown): boolean {
  return hasExactKeys(value, [
    "autoUpdateCards", "updateFrequency", "matchRetentionDays", "notifyUpdates",
    "notifyAnnouncements", "verboseLogs"
  ]) &&
    [value.autoUpdateCards, value.notifyUpdates, value.notifyAnnouncements, value.verboseLogs]
      .every((item) => typeof item === "boolean") &&
    isOneOf(value.updateFrequency, ["daily", "weekly", "manual"]) &&
    isOneOf(value.matchRetentionDays, [30, 90, 180]);
}

function isOptionalZoneCards(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isZoneCard));
}

function isZoneCard(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.name) && isPositiveInteger(value.count) &&
    isOptionalString(value.cardId) && (value.details === undefined || isRecord(value.details));
}

function isOptionalMatchCounters(value: unknown): boolean {
  return value === undefined || (
    hasExactKeys(value, ["friendly", "opponent"]) &&
    isPlayerMatchCounters(value.friendly) &&
    isPlayerMatchCounters(value.opponent)
  );
}

function isPlayerMatchCounters(value: unknown): boolean {
  const keys = ["nextFatigueDamage", "corpses", "spellsPlayed"] as const;
  return isRecord(value) &&
    Object.keys(value).every((key) => keys.includes(key as typeof keys[number])) &&
    keys.every((key) => isOptionalNonNegativeInteger(value[key]));
}

function isArenaState(value: unknown): boolean {
  if (!isRecord(value) || typeof value.status !== "string" || !arenaStatuses.has(value.status) ||
      !isNonNegativeInteger(value.draftCount) || value.draftCount > 30 ||
      !isNonNegativeInteger(value.unresolvedCount) || value.unresolvedCount > 30 ||
      !Array.isArray(value.currentChoices) || !value.currentChoices.every(isArenaCardChoice) ||
      !Array.isArray(value.picks) || !value.picks.every(isArenaPick) ||
      !Array.isArray(value.deck) || !value.deck.every(isDeckCard) ||
      (value.redraftPool !== undefined && (!Array.isArray(value.redraftPool) || !value.redraftPool.every(isDeckCard))) ||
      !isOptionalString(value.deckId) || !isOptionalString(value.redraftGenerationId) ||
      !isOptionalString(value.scoreSource) || !isOptionalString(value.lastUpdated) || !isOptionalString(value.error) ||
      !isOptionalNonNegativeNumber(value.ratingsVersion) || !isOptionalArenaHero(value.hero)) {
    return false;
  }

  const deckCount = value.deck.reduce<number>((total, card) => total + (card as { count: number }).count, 0);
  const confirmedCount = value.status === "inactive" ? 0 : 30 - value.unresolvedCount;
  return deckCount === confirmedCount && (value.status !== "inactive" || value.draftCount === 0);
}

function isDeckCard(value: unknown): value is Record<string, unknown> & { name: string; count: number } {
  return isRecord(value) && isNonEmptyString(value.name) && isPositiveInteger(value.count) &&
    isOptionalString(value.cardId) && isOptionalString(value.rawLine) &&
    isOptionalPercentage(value.pickRate) && isOptionalFiniteNumber(value.deckImpact) &&
    (value.details === undefined || isRecord(value.details)) &&
    (value.unresolved === undefined || value.unresolved === true);
}

function isArenaCardChoice(value: unknown): boolean {
  return isDeckCard(value) && isOptionalString(value.entityId) && isOptionalFiniteNumber(value.score) &&
    isOptionalString(value.scoreSource) && isOptionalArenaQuality(value.quality) && isOptionalArenaRating(value.rating);
}

function isArenaPick(value: unknown): boolean {
  return isRecord(value) && isPositiveInteger(value.slot) && isArenaCardChoice(value.chosen) &&
    Array.isArray(value.offered) && value.offered.every(isArenaCardChoice) &&
    isNonEmptyString(value.at) && Number.isFinite(Date.parse(value.at));
}

function isOptionalArenaHero(value: unknown): boolean {
  return value === undefined || (isRecord(value) && isNonEmptyString(value.name) &&
    isOptionalString(value.cardId) && isOptionalString(value.className));
}

function isOptionalArenaQuality(value: unknown): boolean {
  return value === undefined || (isRecord(value) && typeof value.tier === "string" && arenaScoreTiers.has(value.tier) &&
    isNonEmptyString(value.label));
}

function isOptionalArenaRating(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value) || !numericFieldsAreOptional(value, [
    "hearthArena", "pickRate", "highWinPickRate", "highWinThreshold", "highWinPickRateImpact", "twelveWinRate"
  ]) || !isOptionalPercentage(value.pickRate)) {
    return false;
  }
  return value.firestone === undefined || (isRecord(value.firestone) && numericFieldsAreOptional(value.firestone, [
    "includedWinrate", "playedWinrate", "sampleSize", "pickRate", "pickRateSampleSize", "highWinPickRate",
    "highWinPickRateSampleSize", "highWinThreshold", "highWinPickRateImpact", "twelveWinRate", "twelveWinRateSampleSize"
  ]) && isOptionalPercentage(value.firestone.pickRate));
}

function numericFieldsAreOptional(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => isOptionalFiniteNumber(value[key]));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || isNonNegativeInteger(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalPercentage(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

function isOptionalNonNegativeNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isMatchHistorySummary(value: unknown): value is Record<"total" | "wins" | "losses" | "ties" | "winRate", number> {
  if (!isRecord(value)) {
    return false;
  }
  const counts = [value.total, value.wins, value.losses, value.ties];
  return counts.every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0) &&
    typeof value.winRate === "number" && Number.isFinite(value.winRate) && value.winRate >= 0 && value.winRate <= 100;
}

function isMatchRecord(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.id === "string" && Boolean(value.id.trim()) &&
    typeof value.result === "string" && matchResults.has(value.result) &&
    typeof value.mode === "string" && matchModes.has(value.mode) &&
    (value.deckName === undefined || typeof value.deckName === "string") &&
    typeof value.endedAt === "string" && Number.isFinite(Date.parse(value.endedAt));
}

function invalidMatchHistory(): Error {
  return new Error("对局历史数据无效，已拒绝更新界面。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys<const T extends readonly string[]>(value: unknown, keys: T): value is Record<T[number], unknown> {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isOneOf<const T>(value: unknown, values: readonly T[]): value is T {
  return values.includes(value as T);
}

function isNumberInRange(value: unknown, minimum: number, maximum: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}
