import type { CardDatabase } from "./cardDatabase.js";
import { parseDeckImport } from "./deckImport.js";
import { parseDeckStringToCards } from "./deckstring.js";
import type { DeckCard, DeckImport } from "./types.js";

export function parseDeckText(
  input: string,
  cardDatabase?: CardDatabase,
  cardDatabaseWarnings: readonly string[] = []
): DeckImport {
  const imported = parseDeckImport(input);
  const warnings = [...cardDatabaseWarnings, ...imported.warnings];
  let cards = imported.cards;

  if (imported.rawDeckString) {
    if (cardDatabase) {
      const decoded = parseDeckStringToCards(imported.rawDeckString, cardDatabase);
      warnings.push(...decoded.warnings);

      if (decoded.cards.length > 0) {
        cards = decoded.cards;
      } else if (cards.length === 0) {
        warnings.push("卡组代码没有解析出可用卡牌。");
      }
    } else if (cards.length === 0) {
      warnings.push("已保存卡组代码；缺少卡牌数据库，暂无法解码。");
    }
  }

  return {
    cards: mergeAndSortCards(cards),
    rawCode: imported.rawDeckString,
    warnings
  };
}

function mergeAndSortCards(cards: readonly DeckCard[]): DeckCard[] {
  const cardMap = new Map<string, DeckCard>();

  for (const card of cards) {
    const key = deckCardKey(card);
    const normalizedCard: DeckCard = {
      name: card.name,
      count: card.count,
      cardId: card.cardId
    };
    const existing = cardMap.get(key);
    if (!existing) {
      cardMap.set(key, normalizedCard);
      continue;
    }

    cardMap.set(key, {
      ...existing,
      count: existing.count + normalizedCard.count
    });
  }

  return [...cardMap.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export function deckCardKey(card: Pick<DeckCard, "name" | "cardId">): string {
  return card.cardId ? `id:${normalizeCardId(card.cardId)}` : `name:${normalizeCardKey(card.name)}`;
}

function normalizeCardKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function normalizeCardId(cardId: string): string {
  return cardId.trim().toLocaleLowerCase();
}

export function createEmptyDeckRows(cards: readonly DeckCard[]) {
  return cards.map((card) => ({
    name: card.name,
    count: card.count,
    remaining: card.count,
    drawn: 0,
    played: 0,
    cardId: card.cardId
  }));
}
