import type { DeckCard, DeckImportResult } from "./types.js";

const DECK_STRING_PATTERN = /^[A-Za-z0-9+/=]{16,}$/;
const COMMENT_MARKER_PATTERN = /^#+\s*/;
const COUNTED_CARD_PATTERN = /^(?:(\d{1,2})\s*x?\s+)?(?:\(\d+\)\s*)?(.+?)\s*$/i;

const METADATA_PREFIXES = new Map([
  ["class", "heroClass"],
  ["format", "format"]
] as const);

export function parseDeckImport(sourceText: string): DeckImportResult {
  const warnings: string[] = [];
  const cardsByName = new Map<string, DeckCard>();
  let name: string | undefined;
  let heroClass: string | undefined;
  let format: string | undefined;
  let rawDeckString: string | undefined;

  for (const rawLine of sourceText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.startsWith("###")) {
      const parsedName = trimmed.replace(/^###\s*/, "").trim();
      if (parsedName.length > 0) {
        name = parsedName;
      }
      continue;
    }

    const lineWithoutCommentMarker = trimmed.replace(COMMENT_MARKER_PATTERN, "").trim();
    if (lineWithoutCommentMarker.length === 0) {
      continue;
    }

    const metadata = parseMetadataLine(lineWithoutCommentMarker);
    if (metadata) {
      if (metadata.field === "heroClass") {
        heroClass = metadata.value;
      } else {
        format = metadata.value;
      }
      continue;
    }

    if (DECK_STRING_PATTERN.test(trimmed)) {
      rawDeckString = trimmed;
      continue;
    }

    const card = parseManualCardLine(lineWithoutCommentMarker, rawLine);
    if (!card) {
      warnings.push(`Ignored deck line: ${trimmed}`);
      continue;
    }

    const existing = cardsByName.get(normalizeCardKey(card.name));
    if (existing) {
      cardsByName.set(normalizeCardKey(card.name), {
        ...existing,
        count: existing.count + card.count
      });
    } else {
      cardsByName.set(normalizeCardKey(card.name), card);
    }
  }

  if (!rawDeckString && cardsByName.size === 0) {
    warnings.push("No deck string or manual card lines were found.");
  }

  return {
    name,
    heroClass,
    format,
    rawDeckString,
    cards: [...cardsByName.values()],
    warnings,
    sourceText
  };
}

function parseMetadataLine(
  line: string
): { readonly field: "heroClass" | "format"; readonly value: string } | undefined {
  const match = line.match(/^([^:]+):\s*(.+)$/);
  if (!match) {
    return undefined;
  }

  const key = match[1]?.trim().toLowerCase();
  const value = match[2]?.trim();
  const field = key === "class" || key === "format" ? METADATA_PREFIXES.get(key) : undefined;

  if (!field || !value) {
    return undefined;
  }

  return { field, value };
}

function parseManualCardLine(line: string, rawLine: string): DeckCard | undefined {
  if (line.length === 0 || line.startsWith("#")) {
    return undefined;
  }

  const match = line.match(COUNTED_CARD_PATTERN);
  if (!match) {
    return undefined;
  }

  const count = match[1] ? Number.parseInt(match[1], 10) : 1;
  const name = match[2]?.trim();

  if (!name || !Number.isInteger(count) || count < 1 || count > 30) {
    return undefined;
  }

  return {
    name,
    count,
    rawLine
  };
}

function normalizeCardKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}
