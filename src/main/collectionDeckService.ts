import { promises as fs } from "node:fs";
import { findBestDecksLogFile } from "./logDiscovery.js";
import { CollectionDeckStore } from "./collectionDeckStore.js";
import { findActiveCollectionDeck, parseCollectionDecksLog } from "../shared/collectionDeckParser.js";
import type { CollectionDeck, CollectionDeckScanResult } from "../shared/types.js";
import { parseDeckText } from "../shared/deck.js";
import { decodeDeckString } from "../shared/deckstring.js";
import { CardDataService, type CardDatabaseLoadOptions, type CardDatabaseLoadResult } from "./cardDataService.js";

export interface ScanCollectionDecksOptions {
  readonly logPath?: string;
}

interface CardDatabaseProvider {
  loadCardDatabase(options?: CardDatabaseLoadOptions): Promise<CardDatabaseLoadResult>;
}

const MISSING_DECKS_LOG_MESSAGE = "未找到 Decks.log。请先点修复日志，重启炉石，然后进入“我的收藏/套牌”页面。";

export class CollectionDeckService {
  private scanGeneration = 0;

  constructor(
    private readonly store = new CollectionDeckStore(),
    private readonly cardData: CardDatabaseProvider = new CardDataService()
  ) {}

  async scanAndImportDecks(options: ScanCollectionDecksOptions = {}): Promise<CollectionDeckScanResult> {
    const generation = ++this.scanGeneration;
    const decksLogPath = await findBestDecksLogFile(options.logPath);
    if (!decksLogPath) {
      return {
        status: "missing-log",
        decks: [],
        databasePath: this.store.getPath(),
        message: MISSING_DECKS_LOG_MESSAGE
      };
    }

    try {
      const content = await fs.readFile(decksLogPath, "utf8");
      const updatedAt = new Date().toISOString();
      const parsedDecks = parseCollectionDecksLog(content, { sourcePath: decksLogPath, updatedAt });
      const activeDeckCandidate = findActiveCollectionDeck(content, { sourcePath: decksLogPath, updatedAt });
      const cardDatabase = await this.cardData.loadCardDatabase({ preferCache: true });
      const decks = decodeCollectionDeckCards(parsedDecks, cardDatabase);
      const activeDeck = findMatchingDeck(decks, activeDeckCandidate);
      if (generation !== this.scanGeneration) {
        return {
          status: "stale",
          decks: [],
          updatedAt,
          sourcePath: decksLogPath,
          databasePath: this.store.getPath(),
          message: "本次收藏扫描已被更新结果替代。"
        };
      }
      const database = await this.store.write({
        updatedAt,
        sourcePath: decksLogPath,
        decks
      });

      return {
        status: "ok",
        decks: database.decks,
        updatedAt: database.updatedAt,
        sourcePath: database.sourcePath,
        databasePath: this.store.getPath(),
        activeDeck,
        warning: cardDatabase.warnings[0]
      };
    } catch (error) {
      return {
        status: "error",
        decks: [],
        sourcePath: decksLogPath,
        databasePath: this.store.getPath(),
        message: formatError(error)
      };
    }
  }

  async getDeck(deckId: string): Promise<CollectionDeck | undefined> {
    const database = await this.store.read();
    return database?.decks.find((deck) => deck.id === deckId);
  }
}

function findMatchingDeck(
  decks: readonly CollectionDeck[],
  activeCandidate: CollectionDeck | undefined
): CollectionDeck | undefined {
  if (!activeCandidate) {
    return undefined;
  }

  if (activeCandidate.deckId) {
    const byDeckId = decks.find((deck) => deck.deckId === activeCandidate.deckId);
    if (byDeckId) {
      return byDeckId;
    }
  }

  if (activeCandidate.rawDeckString) {
    return decks.find((deck) => deck.rawDeckString === activeCandidate.rawDeckString);
  }

  return undefined;
}

export function getMissingDecksLogMessage(): string {
  return MISSING_DECKS_LOG_MESSAGE;
}

function decodeCollectionDeckCards(
  decks: readonly CollectionDeck[],
  cardDatabase: CardDatabaseLoadResult
): CollectionDeck[] {
  if (!cardDatabase.database) {
    return [...decks];
  }

  return decks.map((deck) => {
    if (!deck.rawDeckString) {
      return deck;
    }

    const imported = parseDeckText(deck.rawDeckString, cardDatabase.database);
    return {
      ...deck,
      format: deck.format ?? formatLabelForDeckString(deck.rawDeckString),
      cards: imported.cards.length > 0 ? imported.cards : deck.cards,
      rawDeckString: imported.rawCode ?? deck.rawDeckString,
      warnings: [...deck.warnings, ...imported.warnings]
    };
  });
}

function formatLabelForDeckString(deckCode: string | undefined): string | undefined {
  if (!deckCode) {
    return undefined;
  }

  const decoded = decodeDeckString(deckCode);
  if (decoded.format === 2) {
    return "标准";
  }
  if (decoded.format === 1) {
    return "狂野";
  }
  return decoded.format === undefined ? undefined : `格式 ${decoded.format}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
