import { parseDeckImport } from "./deckImport.js";
import type { CollectionDeck } from "./types.js";

export interface ParseCollectionDecksOptions {
  readonly sourcePath: string;
  readonly updatedAt: string;
}

const BLOCK_START_PATTERN = /^(?:###\s+\S|\[Deck\]|\s*(?:Deck\s*)?Name\s*[:=])/i;
const DECK_CODE_LABEL_PATTERN = /^(?:deck\s*(?:code|string)|code)\s*[:=]\s*(.+)$/i;
const DECK_ID_LABEL_PATTERN = /^#?\s*Deck ID\s*[:=]\s*(\d+)/i;
const MODE_LABEL_PATTERN = /^(?:mode|game\s*mode)\s*[:=]\s*(.+)$/i;
const COUNTED_CARD_LINE_PATTERN = /^#?\s*\d{1,2}\s*x?\s+(?:\(\d+\)\s*)?\S/i;
const DECK_SIGNAL_PATTERN = /^(?:###\s+\S|#?\s*(?:class|hero\s*class|format|mode|game\s*mode|deck\s*(?:code|string)|code|(?:deck\s*)?name)\s*[:=])/i;
const DECK_STRING_PATTERN = /^[A-Za-z0-9+/=]{16,}$/;

export function parseCollectionDecksLog(content: string, options: ParseCollectionDecksOptions): CollectionDeck[] {
  const decks = splitIntoDeckBlocks(content).map((block, index) => parseCollectionDeckBlock(block, index, options));
  return dedupeCollectionDecks(decks);
}

/** Returns the deck Hearthstone explicitly selected immediately before queuing the current game. */
export function findActiveCollectionDeck(
  content: string,
  options: ParseCollectionDecksOptions
): CollectionDeck | undefined {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let markerIndex = -1;
  let markerMode: string | undefined;

  lines.forEach((line, index) => {
    const normalizedLine = stripLogPrefix(line).trim();
    if (/^Finding Game With Deck:?$/i.test(normalizedLine)) {
      markerIndex = index;
      markerMode = undefined;
    } else if (isArenaDeckStart(normalizedLine)) {
      markerIndex = index;
      markerMode = "arena";
    }
  });

  if (markerIndex < 0) {
    return undefined;
  }

  const activeDeck = parseCollectionDecksLog(lines.slice(markerIndex + 1).join("\n"), options).find(
    (deck) => Boolean(deck.rawDeckString) || deck.cards.length > 0
  );
  return activeDeck && markerMode ? { ...activeDeck, mode: markerMode } : activeDeck;
}

function parseCollectionDeckBlock(block: string, index: number, options: ParseCollectionDecksOptions): CollectionDeck {
  const warnings: string[] = [];
  const normalizedBlock = normalizeBlockText(block);
  const importText = toDeckImportText(normalizedBlock);
  const imported = parseDeckImport(importText);
  const mode = parseMode(normalizedBlock);
  const rawDeckString = imported.rawDeckString ?? parseLabeledDeckCode(normalizedBlock);
  const deckId = parseDeckId(normalizedBlock);
  const hasDeckSignal = blockHasDeckSignal(normalizedBlock);
  const cards = hasDeckSignal ? imported.cards : [];

  if (hasDeckSignal && imported.warnings.length > 0) {
    warnings.push(...imported.warnings);
  }

  if (!hasDeckSignal || (!imported.name && !imported.heroClass && !imported.format && !mode && !rawDeckString && cards.length === 0)) {
    warnings.push("Unrecognized Decks.log block; preserved raw text.");
  }

  return {
    id: createDeckId(options.sourcePath, normalizedBlock, index),
    deckId,
    name: imported.name,
    heroClass: imported.heroClass,
    format: imported.format,
    mode,
    cards,
    rawDeckString,
    rawText: normalizedBlock,
    sourcePath: options.sourcePath,
    updatedAt: options.updatedAt,
    warnings
  };
}

function splitIntoDeckBlocks(content: string): string[] {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const normalizedLine = stripLogPrefix(trimmed).trim();
    if (trimmed.length === 0) {
      if (current.length > 0) {
        current.push(line);
      }
      continue;
    }

    if (isArenaDeckStart(normalizedLine)) {
      pushBlock(blocks, current);
      current = ["Mode: arena"];
      continue;
    }

    if (isDeckLogHeader(normalizedLine)) {
      pushBlock(blocks, current);
      current = [];
      continue;
    }

    if (BLOCK_START_PATTERN.test(normalizedLine) && current.some((existingLine) => existingLine.trim().length > 0)) {
      pushBlock(blocks, current);
      current = [];
    }

    current.push(line);
  }

  pushBlock(blocks, current);

  if (blocks.length > 0) {
    return blocks;
  }

  const fallback = normalized.trim();
  return fallback.length > 0 ? [fallback] : [];
}

function pushBlock(blocks: string[], lines: readonly string[]) {
  const block = lines.join("\n").trim();
  if (block.length > 0) {
    blocks.push(block);
  }
}

function toDeckImportText(block: string): string {
  return block
    .split("\n")
    .map((line) => {
      const trimmed = stripLogPrefix(line).trim();
      if (isDeckLogHeader(trimmed) || DECK_ID_LABEL_PATTERN.test(trimmed)) {
        return "";
      }

      const deckCode = trimmed.match(DECK_CODE_LABEL_PATTERN);
      if (deckCode?.[1]) {
        return deckCode[1].trim();
      }

      if (MODE_LABEL_PATTERN.test(trimmed)) {
        return "";
      }

      return normalizeMetadataLine(trimmed);
    })
    .join("\n");
}

function normalizeMetadataLine(line: string): string {
  const name = line.match(/^(?:deck\s*)?name\s*[:=]\s*(.+)$/i);
  if (name?.[1]) {
    return `### ${name[1].trim()}`;
  }

  const heroClass = line.match(/^(?:class|hero\s*class)\s*[:=]\s*(.+)$/i);
  if (heroClass?.[1]) {
    return `# Class: ${heroClass[1].trim()}`;
  }

  const format = line.match(/^(?:format)\s*[:=]\s*(.+)$/i);
  if (format?.[1]) {
    return `# Format: ${format[1].trim()}`;
  }

  return line;
}

function parseMode(block: string): string | undefined {
  for (const line of block.split("\n")) {
    const mode = stripLogPrefix(line).trim().match(MODE_LABEL_PATTERN);
    if (mode?.[1]) {
      return mode[1].trim();
    }
  }

  return undefined;
}

function parseLabeledDeckCode(block: string): string | undefined {
  for (const line of block.split("\n")) {
    const deckCode = stripLogPrefix(line).trim().match(DECK_CODE_LABEL_PATTERN);
    if (deckCode?.[1]) {
      return deckCode[1].trim();
    }
  }

  return undefined;
}

function parseDeckId(block: string): string | undefined {
  for (const line of block.split("\n")) {
    const deckId = stripLogPrefix(line).trim().match(DECK_ID_LABEL_PATTERN);
    if (deckId?.[1]) {
      return deckId[1].trim();
    }
  }

  return undefined;
}

function stripLogPrefix(line: string): string {
  return line
    .replace(/^[VDIWE]\s+\d{1,2}:\d{2}:\d{2}\.\d+\s+[^-]+?\s+-\s*/, "")
    .replace(/^[VDIWE]\s+\d{1,2}:\d{2}:\d{2}\.\d+\s+/, "");
}

function normalizeBlockText(block: string): string {
  return block
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function blockHasDeckSignal(block: string): boolean {
  return block
    .split("\n")
    .map((line) => stripLogPrefix(line).trim())
    .some((line) => DECK_SIGNAL_PATTERN.test(line) || COUNTED_CARD_LINE_PATTERN.test(line) || DECK_STRING_PATTERN.test(line));
}

function isDeckLogHeader(line: string): boolean {
  return /^(?:Deck Contents Received|Finished Editing Deck):?$/i.test(line);
}

function isArenaDeckStart(line: string): boolean {
  return /^Starting Arena Game With Deck:?$/i.test(line);
}

function dedupeCollectionDecks(decks: readonly CollectionDeck[]): CollectionDeck[] {
  const byIdentity = new Map<string, CollectionDeck>();

  for (const deck of decks) {
    byIdentity.set(getDeckIdentity(deck), deck);
  }

  return [...byIdentity.values()];
}

function getDeckIdentity(deck: CollectionDeck): string {
  if (deck.deckId) {
    return `deck-id:${deck.deckId}`;
  }

  if (deck.rawDeckString) {
    return `deck-code:${deck.rawDeckString}`;
  }

  return `raw:${deck.id}`;
}

function createDeckId(sourcePath: string, block: string, index: number): string {
  const hash = stableHash(`${sourcePath}\n${block}`);
  return `collection-deck-${index + 1}-${hash}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
