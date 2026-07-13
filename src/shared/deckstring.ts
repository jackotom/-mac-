import { decode } from "deckstrings";
import { getCardInfo, type CardDatabase } from "./cardDatabase.js";
import type { DeckCard } from "./types.js";

export interface DeckStringCardEntry {
  readonly dbfId: number;
  readonly count: number;
}

export interface DecodedDeckString {
  readonly version?: number;
  readonly format?: number;
  readonly heroes: readonly number[];
  readonly cards: readonly DeckStringCardEntry[];
  readonly values: readonly number[];
  readonly warnings: readonly string[];
}

export interface ParsedDeckStringCards {
  readonly format?: number;
  readonly heroes: readonly number[];
  readonly cards: readonly DeckCard[];
  readonly warnings: readonly string[];
}

export function decodeDeckString(deckCode: string): DecodedDeckString {
  try {
    const decoded = decode(deckCode);

    return {
      format: decoded.format,
      heroes: decoded.heroes,
      cards: decoded.cards.map(([dbfId, count]) => ({ dbfId, count })),
      values: [],
      warnings: []
    };
  } catch (error) {
    return {
      heroes: [],
      cards: [],
      values: [],
      warnings: [formatError(error)]
    };
  }
}

export function parseDeckStringToCards(deckCode: string, cardDb: CardDatabase): ParsedDeckStringCards {
  const decoded = decodeDeckString(deckCode);
  const warnings = [...decoded.warnings];
  const cards = decoded.cards.map((entry): DeckCard => {
    const cardInfo = getCardInfo(cardDb, entry.dbfId);

    if (!cardInfo) {
      warnings.push(`Missing card info for dbfId ${entry.dbfId}.`);
      return {
        name: `Unknown card ${entry.dbfId}`,
        count: entry.count,
        rawLine: `dbfId:${entry.dbfId}`
      };
    }

    return {
      name: cardInfo.name,
      count: entry.count,
      cardId: cardInfo.cardId ?? cardInfo.id,
      rawLine: `dbfId:${entry.dbfId}`
    };
  });

  return {
    format: decoded.format,
    heroes: decoded.heroes,
    cards,
    warnings
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
