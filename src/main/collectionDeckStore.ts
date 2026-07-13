import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CollectionDeck } from "../shared/types.js";

const DATABASE_FILE_NAME = "collection-decks.json";

export interface CollectionDeckDatabase {
  readonly updatedAt: string;
  readonly sourcePath: string;
  readonly decks: readonly CollectionDeck[];
}

export class CollectionDeckStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly databasePath = path.join(app.getPath("userData"), DATABASE_FILE_NAME)) {}

  getPath(): string {
    return this.databasePath;
  }

  async read(): Promise<CollectionDeckDatabase | undefined> {
    try {
      const text = await fs.readFile(this.databasePath, "utf8");
      const parsed = JSON.parse(text) as unknown;
      return parseDatabase(parsed);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }

      throw error;
    }
  }

  async write(database: CollectionDeckDatabase): Promise<CollectionDeckDatabase> {
    const operation = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.databasePath), { recursive: true });
      const temporaryPath = `${this.databasePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await fs.writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
        await fs.rename(temporaryPath, this.databasePath);
      } finally {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    });
    this.writeChain = operation.catch(() => undefined);
    await operation;
    return database;
  }
}

function parseDatabase(value: unknown): CollectionDeckDatabase {
  if (!isRecord(value)) {
    throw new Error("Collection deck database is not an object.");
  }

  const updatedAt = value.updatedAt;
  const sourcePath = value.sourcePath;
  const decks = value.decks;
  if (typeof updatedAt !== "string" || typeof sourcePath !== "string" || !Array.isArray(decks)) {
    throw new Error("Collection deck database has an invalid shape.");
  }

  return {
    updatedAt,
    sourcePath,
    decks: decks.map(parseDeck)
  };
}

function parseDeck(value: unknown): CollectionDeck {
  if (!isRecord(value)) {
    throw new Error("Collection deck entry is not an object.");
  }

  const id = value.id;
  const rawText = value.rawText;
  const sourcePath = value.sourcePath;
  const updatedAt = value.updatedAt;
  const cards = value.cards;
  const warnings = value.warnings;
  if (
    typeof id !== "string" ||
    typeof rawText !== "string" ||
    typeof sourcePath !== "string" ||
    typeof updatedAt !== "string" ||
    !Array.isArray(cards) ||
    !Array.isArray(warnings)
  ) {
    throw new Error("Collection deck entry has an invalid shape.");
  }

  return {
    id,
    deckId: optionalString(value.deckId),
    name: optionalString(value.name),
    heroClass: optionalString(value.heroClass),
    format: optionalString(value.format),
    mode: optionalString(value.mode),
    cards: cards.map((card) => {
      if (!isRecord(card) || typeof card.name !== "string" || typeof card.count !== "number") {
        throw new Error("Collection deck card has an invalid shape.");
      }

      return {
        name: card.name,
        count: card.count,
        cardId: optionalString(card.cardId),
        rawLine: optionalString(card.rawLine)
      };
    }),
    rawDeckString: optionalString(value.rawDeckString),
    rawText,
    sourcePath,
    updatedAt,
    warnings: warnings.map((warning) => {
      if (typeof warning !== "string") {
        throw new Error("Collection deck warning has an invalid shape.");
      }
      return warning;
    })
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
