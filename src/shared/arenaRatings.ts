export interface ArenaRatingTable {
  readonly source: string;
  readonly version: number;
  readonly fetchedAt: string;
  readonly ratings: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly hearthArenaWeb?: HearthArenaWebRatingSource;
  readonly firestone?: FirestoneRatingSource;
}

export interface HearthArenaWebLocaleRatingSource {
  readonly locale: string;
  readonly url: string;
  readonly version: string;
  readonly fetchedAt: string;
  readonly ratingCount: number;
  readonly ratings: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface HearthArenaWebRatingSource {
  readonly source: "HearthArena Web";
  readonly version: string;
  readonly locales: Readonly<Record<string, HearthArenaWebLocaleRatingSource>>;
}

export interface FirestoneCardRating {
  readonly includedWinrate?: number;
  readonly playedWinrate?: number;
  readonly sampleSize?: number;
  readonly pickRate?: number;
  readonly pickRateSampleSize?: number;
  readonly highWinPickRate?: number;
  readonly highWinPickRateSampleSize?: number;
  readonly highWinThreshold?: number;
  readonly highWinPickRateImpact?: number;
  readonly twelveWinRate?: number;
  readonly twelveWinRateSampleSize?: number;
  readonly draftBuckets?: Readonly<Record<string, FirestoneDraftBucket>>;
}

export interface FirestoneDraftBucket {
  readonly offered?: number;
  readonly picked?: number;
  readonly pickRate?: number;
}

export interface FirestoneRatingSource {
  readonly source: "Firestone";
  readonly version: string;
  readonly lastUpdated: string;
  readonly ratings: Readonly<Record<string, FirestoneCardRating>>;
}

export interface ArenaCardRating {
  readonly hearthArena?: number;
  readonly pickRate?: number;
  readonly highWinPickRate?: number;
  readonly highWinThreshold?: number;
  readonly highWinPickRateImpact?: number;
  readonly twelveWinRate?: number;
  readonly firestone?: FirestoneCardRating;
}

export type ArenaScoreTier = "s" | "a" | "b" | "c" | "d" | "f" | "unknown";

export interface ArenaScoreQuality {
  readonly tier: ArenaScoreTier;
  readonly label: string;
}

export function getArenaScore(table: ArenaRatingTable | undefined, cardId: string | undefined, className: string | undefined) {
  if (!table || !cardId) {
    return undefined;
  }

  const normalizedCardId = cardId.trim().toUpperCase();
  return getHearthArenaWebScore(table.hearthArenaWeb, normalizedCardId, className) ?? getScoreFromRatings(table.ratings, normalizedCardId, className);
}

export function getArenaCardRating(
  table: ArenaRatingTable | undefined,
  cardId: string | undefined,
  className: string | undefined
): ArenaCardRating | undefined {
  if (!table || !cardId) {
    return undefined;
  }

  const normalizedCardId = cardId.trim().toUpperCase();
  const hearthArena = getArenaScore(table, cardId, className);
  const firestone = table.firestone?.ratings[normalizedCardId];
  if (hearthArena === undefined && !firestone) {
    return undefined;
  }

  return {
    hearthArena,
    pickRate: firestone?.pickRate,
    highWinPickRate: firestone?.highWinPickRate,
    highWinThreshold: firestone?.highWinThreshold,
    highWinPickRateImpact: firestone?.highWinPickRateImpact,
    twelveWinRate: firestone?.twelveWinRate,
    firestone
  };
}

export function getArenaScoreSourceLabel(table: ArenaRatingTable | undefined): string | undefined {
  if (!table) {
    return undefined;
  }

  const parts = [`${table.source} v${table.version}`];
  if (table.hearthArenaWeb) {
    parts.push("HearthArena官网");
  }
  if (table.firestone) {
    parts.push("Firestone");
  }
  return parts.join(" + ");
}

function getHearthArenaWebScore(
  source: HearthArenaWebRatingSource | undefined,
  normalizedCardId: string,
  className: string | undefined
): number | undefined {
  if (!source) {
    return undefined;
  }

  const preferredLocales = uniqueStrings(["zh-cn", "zh-tw", ...Object.keys(source.locales)]);
  for (const locale of preferredLocales) {
    const score = getScoreFromRatings(source.locales[locale]?.ratings, normalizedCardId, className);
    if (score !== undefined) {
      return score;
    }
  }
  return undefined;
}

function getScoreFromRatings(
  ratings: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
  normalizedCardId: string,
  className: string | undefined
): number | undefined {
  if (!ratings) {
    return undefined;
  }

  const classRating = className ? ratings[className]?.[normalizedCardId] : undefined;
  return classRating ?? ratings.Neutral?.[normalizedCardId];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function getArenaScoreQuality(score: number | undefined): ArenaScoreQuality {
  if (score === undefined || !Number.isFinite(score)) {
    return { tier: "unknown", label: "暂无评分" };
  }

  if (score >= 130) {
    return { tier: "s", label: "顶级" };
  }

  if (score >= 110) {
    return { tier: "a", label: "优秀" };
  }

  if (score >= 90) {
    return { tier: "b", label: "良好" };
  }

  if (score >= 70) {
    return { tier: "c", label: "一般" };
  }

  if (score >= 40) {
    return { tier: "d", label: "偏弱" };
  }

  return { tier: "f", label: "不推荐" };
}
