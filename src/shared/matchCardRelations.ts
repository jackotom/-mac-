import {
  normalizeCardId,
  type CardInfo,
  type GameContextSection
} from "./cardDatabase.js";

export interface MatchCardHistory {
  readonly friendlyUsed: readonly CardInfo[];
  readonly opponentUsed: readonly CardInfo[];
  readonly friendlyDeadMinions: readonly CardInfo[];
  readonly opponentDeadMinions: readonly CardInfo[];
}

const RACE_KEYWORDS: ReadonlyArray<readonly [string, string]> = [
  ["野兽", "BEAST"],
  ["恶魔", "DEMON"],
  ["龙", "DRAGON"],
  ["亡灵", "UNDEAD"],
  ["鱼人", "MURLOC"],
  ["树人", "TREANT"],
  ["海盗", "PIRATE"],
  ["机械", "MECHANICAL"],
  ["元素", "ELEMENTAL"],
  ["野猪人", "QUILBOAR"],
  ["纳迦", "NAGA"]
];

export function resolveMatchCardRelations(
  card: CardInfo,
  history: MatchCardHistory
): readonly GameContextSection[] {
  const text = normalizeText(card.text);
  if (
    (text.includes("本局对战中") && (text.includes("死亡") || /复活.*消灭的随从/.test(text))) ||
    /复活上一个死亡的你的/.test(text)
  ) {
    return resolveDeathRelations(text, history);
  }

  if (text.includes("本局对战中") && isUsedCardRelation(text)) {
    return [resolveUsedCardRelation(card, text, history)];
  }

  return [];
}

function resolveDeathRelations(text: string, history: MatchCardHistory): readonly GameContextSection[] {
  if (text.includes("每个玩家分别")) {
    return [
      buildDeathSection("friendly-dead", "我方本局符合条件的死亡随从", "我方本局还没有符合条件的死亡随从", text, history.friendlyDeadMinions),
      buildDeathSection("opponent-dead", "对手本局符合条件的死亡随从", "对手本局还没有符合条件的死亡随从", text, history.opponentDeadMinions)
    ];
  }

  const isFriendlyOnly = /友方|你的/.test(text);
  const isOpponentOnly = /敌人死亡|敌方.*死亡/.test(text);
  const isLatestFriendlyResurrection = /复活上一个死亡的你的/.test(text);
  const source = isFriendlyOnly
    ? history.friendlyDeadMinions
    : isOpponentOnly
      ? history.opponentDeadMinions
      : [...history.friendlyDeadMinions, ...history.opponentDeadMinions];
  const title = isLatestFriendlyResurrection
    ? "将复活"
    : isFriendlyOnly
    ? "本局符合条件的友方死亡随从"
    : isOpponentOnly
      ? "本局符合条件的敌方死亡随从"
      : "本局符合条件的死亡随从";
  const emptyText = isLatestFriendlyResurrection
    ? "暂未确认将复活的恶魔"
    : isFriendlyOnly
    ? "本局还没有符合条件的友方死亡随从"
    : isOpponentOnly
      ? "本局还没有符合条件的敌方死亡随从"
      : "本局还没有符合条件的死亡随从";

  return [buildDeathSection("dead-minions", title, emptyText, text, source)];
}

function buildDeathSection(
  key: string,
  title: string,
  emptyText: string,
  text: string,
  source: readonly CardInfo[]
): GameContextSection {
  let cards = filterByCardText(source, text, false);

  if (/法力值消耗最高|消耗最高/.test(text)) {
    cards = keepHighestCost(cards);
  } else if (/最先死亡/.test(text)) {
    const count = readChineseCount(text) ?? 1;
    cards = cards.slice(0, count);
  } else if (/上一个|最近(?:死亡)?/.test(text)) {
    cards = cards.slice(-1);
  }

  return { key, title, emptyText, cards };
}

function resolveUsedCardRelation(
  card: CardInfo,
  text: string,
  history: MatchCardHistory
): GameContextSection {
  const isOpponent = /对手.*使用过|你的对手.*使用过/.test(text);
  const source = isOpponent ? history.opponentUsed : history.friendlyUsed;
  let cards = filterByCardText(source, text);

  if (/其他法术/.test(text)) {
    cards = cards.filter((candidate) => !isSameCard(candidate, card));
  }

  if (/其他职业/.test(text)) {
    cards = cards.filter((candidate) => isOtherClassCard(candidate, card));
  }

  if (/不同派系|尚未施放过的派系|未施放过的派系/.test(text)) {
    cards = keepOnePerSpellSchool(cards);
  }

  const isSpellHistory = /施放|法术/.test(text) && !/奥秘牌/.test(text);
  return {
    key: isOpponent ? "opponent-used" : isSpellHistory ? "friendly-cast-spells" : "friendly-used",
    title: isOpponent
      ? "对手本局已使用的符合条件卡牌"
      : isSpellHistory
        ? "本局已施放的符合条件法术"
        : "本局已使用的符合条件卡牌",
    emptyText: isOpponent
      ? "尚未记录到对手使用的符合条件卡牌"
      : isSpellHistory
        ? "本局还没有施放过符合条件的法术"
        : "本局还没有使用过符合条件的卡牌",
    cards
  };
}

function filterByCardText(
  source: readonly CardInfo[],
  text: string,
  filterMentionedCardTypes = true
): CardInfo[] {
  const race = RACE_KEYWORDS.find(([keyword]) => text.includes(keyword))?.[1];
  const manaCost = readRequiredManaCost(text);
  const mentionsSpell = text.includes("法术");
  const mentionsMinionCard = text.includes("随从牌");

  return source.filter((card) => {
    if (text.includes("亡语") && !hasMechanic(card, "DEATHRATTLE")) {
      return false;
    }
    if (text.includes("奥秘牌") && !hasMechanic(card, "SECRET")) {
      return false;
    }
    if (text.includes("过载牌") && !hasMechanic(card, "OVERLOAD")) {
      return false;
    }
    if (race && !(card.races ?? []).some((candidateRace) => candidateRace === race || candidateRace === "ALL")) {
      return false;
    }
    if (manaCost !== undefined && card.manaCost !== manaCost) {
      return false;
    }
    if (!filterMentionedCardTypes) {
      return true;
    }
    if (mentionsSpell && mentionsMinionCard) {
      return card.cardType === "法术" || card.cardType === "随从";
    }
    if (mentionsSpell && !/亡语牌|奥秘牌|过载牌/.test(text)) {
      return card.cardType === "法术";
    }
    return true;
  });
}

function isUsedCardRelation(text: string): boolean {
  return /使用过|每使用|施放过|每施放|施放一个|尚未施放|未施放/.test(text);
}

function hasMechanic(card: CardInfo, mechanic: string): boolean {
  return (card.mechanics ?? []).includes(mechanic);
}

function readRequiredManaCost(text: string): number | undefined {
  const match = text.match(/(?:法力值消耗为|消耗)[（(]?(\d+)[）)]?(?:点法力)?/);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function readChineseCount(text: string): number | undefined {
  const digit = text.match(/最先死亡的(\d+)个/);
  if (digit) {
    return Number(digit[1]);
  }
  const chinese = text.match(/最先死亡的([一二三四五六七八九十])个/)?.[1];
  return chinese ? ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as const)[chinese as "一"] : undefined;
}

function keepHighestCost(cards: readonly CardInfo[]): CardInfo[] {
  const highest = cards.reduce((value, card) => Math.max(value, card.manaCost ?? 0), -1);
  return highest < 0 ? [] : cards.filter((card) => (card.manaCost ?? 0) === highest);
}

function keepOnePerSpellSchool(cards: readonly CardInfo[]): CardInfo[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const school = card.spellSchool?.trim().toLocaleUpperCase();
    if (!school || seen.has(school)) {
      return false;
    }
    seen.add(school);
    return true;
  });
}

function isOtherClassCard(candidate: CardInfo, sourceCard: CardInfo): boolean {
  const sourceClasses = new Set((sourceCard.heroClasses ?? []).filter((heroClass) => heroClass !== "NEUTRAL"));
  return (candidate.heroClasses ?? []).some((heroClass) => heroClass !== "NEUTRAL" && !sourceClasses.has(heroClass));
}

function isSameCard(left: CardInfo, right: CardInfo): boolean {
  const leftId = left.cardId ?? left.id;
  const rightId = right.cardId ?? right.id;
  return leftId !== undefined && rightId !== undefined && normalizeCardId(leftId) === normalizeCardId(rightId);
}

function normalizeText(text?: string): string {
  return (text ?? "").replace(/\s+/g, "");
}
