import type { EntitySnapshot, ParsedLogEvent, Zone } from "./types.js";

const KNOWN_ZONES = new Set(["DECK", "HAND", "PLAY", "GRAVEYARD", "REMOVEDFROMGAME", "SETASIDE", "SECRET"]);

export interface FriendlyDeckSnapshot {
  /** Total cards actually present in the local deck after game-start effects resolve. */
  readonly initialDeckSize: number;
  readonly remainingDeckSize: number;
  /** Original collection-deck cards before game-start effects added extra deck entities. */
  readonly baseDeckSize?: number;
}

export function parseLogLine(line: string): ParsedLogEvent[] {
  if (!line.trim()) {
    return [];
  }

  if (isConstructedGameStartLine(line)) {
    return [{ type: "game-start", raw: line }];
  }

  if (isGameEndLine(line)) {
    return [{ type: "game-end", raw: line }];
  }

  if (line.includes("CREATE_GAME")) {
    return [];
  }

  if (/BLOCK_END\b/.test(line)) {
    return [{ type: "action-boundary", phase: "end", action: "other", raw: line }];
  }

  if (/BLOCK_START\b.*BlockType=PLAY\b/.test(line)) {
    return [{ type: "action-boundary", phase: "start", action: "play", entity: parseEntity(line), raw: line }];
  }

  const events: ParsedLogEvent[] = [];
  const entity = parseEntity(line);

  if (line.includes("FULL_ENTITY") || line.includes("SHOW_ENTITY")) {
    if (entity.id || entity.name || entity.cardId) {
      events.push({ type: "entity", entity, raw: line });
    }
  }

  const controller = parseTagValueNumber(line, "CONTROLLER");
  if (controller !== undefined) {
    events.push({
      type: "controller",
      entityId: entity.id,
      controller,
      raw: line
    });
  }

  const zone = parseTagValue(line, "ZONE");
  if (zone) {
    events.push({
      type: "zone-change",
      entityId: entity.id,
      cardName: entity.name,
      cardId: entity.cardId,
      fromZone: entity.zone,
      toZone: normalizeZone(zone),
      controller: entity.controller,
      raw: line
    });
  }

  const attack = parseTagValueNumber(line, "ATK");
  if (attack !== undefined) events.push({ type: "attack-change", entityId: entity.id, attack, raw: line });

  return events;
}

export function parseEntity(line: string): EntitySnapshot {
  const sourceWithBrackets = extractEntitySource(line);
  const source =
    sourceWithBrackets.startsWith("[") && sourceWithBrackets.endsWith("]")
      ? sourceWithBrackets.slice(1, -1)
      : sourceWithBrackets;

  const id = firstMatch(source, [/\bid=(\d+)/, /\bID=(\d+)/, /\bEntity=(\d+)/]);
  const rawName = firstMatch(source, [/\bentityName=(.+?)\s+id=/, /^\s*([^\s=]+(?:\s+[^\s=]+)*)\s*$/]);
  const cardId = firstMatch(line, [/\bCardID=([A-Za-z0-9_]+)/, /\bcardId=([A-Za-z0-9_]+)/]);
  const rawZone = firstMatch(source, [/\bzone=([A-Z]+)/]);
  const rawController = firstMatch(source, [/\bcontroller=(\d+)/, /\bplayer=(\d+)/]);

  const name = normalizeName(rawName);
  return {
    id,
    name,
    cardId,
    zone: rawZone ? normalizeZone(rawZone) : undefined,
    controller: rawController ? Number(rawController) : undefined
  };
}

function extractEntitySource(line: string): string {
  const entityIndex = line.indexOf("Entity=");
  if (entityIndex >= 0) {
    const entityValue = readEntityValue(line.slice(entityIndex + "Entity=".length));
    if (entityValue) {
      return entityValue;
    }
  }

  const indexedEntityMatch = line.match(/(?:Entities|m_chosenEntities)\[\d+\]=/);
  if (indexedEntityMatch?.index !== undefined) {
    const entityValue = readEntityValue(line.slice(indexedEntityMatch.index + indexedEntityMatch[0].length));
    if (entityValue) {
      return entityValue;
    }
  }

  return line;
}

function readEntityValue(value: string): string | undefined {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("[")) {
    return trimmed.match(/^([^\s]+)/)?.[1];
  }

  let depth = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(0, index + 1);
      }
    }
  }

  return undefined;
}

function parseTagValue(line: string, tag: string): string | undefined {
  const match = line.match(new RegExp(`tag=${tag}\\s+value=([^\\s]+)`));
  return match?.[1];
}

function parseTagValueNumber(line: string, tag: string): number | undefined {
  const value = parseTagValue(line, tag);
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function firstMatch(input: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function normalizeName(name?: string): string | undefined {
  if (!name || name.startsWith("UNKNOWN ENTITY") || name === "GameEntity") {
    return undefined;
  }
  return name.replace(/\s+/g, " ").trim();
}

export function normalizeZone(zone: string): Zone {
  const upper = zone.toUpperCase();
  return KNOWN_ZONES.has(upper) ? (upper as Zone) : "UNKNOWN";
}

export function isArenaGameStartLine(line: string) {
  return line.includes("CREATE_GAME") && detectPowerGameType(line) === "arena";
}

export function detectPowerGameType(text: string): "arena" | "constructed" | undefined {
  const gameType = text.match(/\bGameType=(GT_[A-Z_]+)\b/i)?.[1];
  if (!gameType) {
    return undefined;
  }
  return /ARENA/i.test(gameType) ? "arena" : "constructed";
}

export function isConstructedGameStartLine(line: string) {
  return line.includes("CREATE_GAME") && !isArenaGameStartLine(line);
}

export function isGameEndLine(line: string) {
  return (
    /tag=PLAYSTATE\s+value=(?:WON|LOST|TIED|CONCEDED)\b/i.test(line) ||
    /tag=(?:STEP|NEXT_STEP)\s+value=FINAL_GAMEOVER\b/i.test(line)
  );
}

export function selectCurrentPowerGameText(content: string): string {
  const lines = content.split(/\r?\n/);
  let start = -1;
  lines.forEach((line, index) => {
    if (line.includes("CREATE_GAME")) {
      start = index;
    }
  });
  return start >= 0 ? lines.slice(start).join("\n") : content;
}

/**
 * Uses the complete game snapshot to validate a collection deck before it is activated.
 * Hearthstone can keep an old `Finding Game With Deck` record in Decks.log, while
 * Power.log still exposes the authoritative number of local deck entities.
 */
export function inspectFriendlyDeckSnapshot(content: string, friendlyController?: number): FriendlyDeckSnapshot | undefined {
  if (friendlyController === undefined) {
    return undefined;
  }

  const zones = new Map<string, Zone>();
  const initialDeckEntityIds = new Set<string>();
  const generatedDeckEntityIds = new Set<string>();
  let setupComplete = false;

  for (const line of selectCurrentPowerGameText(content).split(/\r?\n/)) {
    if (/tag=(?:STEP|NEXT_STEP)\s+value=(?:MAIN_READY|MAIN_ACTION)/i.test(line)) {
      setupComplete = true;
    }

    const entity = parseEntity(line);
    if (!entity.id || entity.controller !== friendlyController) {
      continue;
    }

    const zoneChange = parseTagValue(line, "ZONE");
    const zone = zoneChange ? normalizeZone(zoneChange) : entity.zone;
    if (!zone || zone === "UNKNOWN") {
      continue;
    }

    zones.set(entity.id, zone);
    if (!setupComplete && zone === "DECK") {
      initialDeckEntityIds.add(entity.id);
    }

    if (!setupComplete && initialDeckEntityIds.has(entity.id) && /tag=DISPLAYED_CREATOR\s+value=/i.test(line)) {
      generatedDeckEntityIds.add(entity.id);
    }
  }

  const initialDeckSize = initialDeckEntityIds.size;
  if (initialDeckSize === 0) {
    return undefined;
  }

  const remainingDeckSize = [...zones.values()].filter((zone) => zone === "DECK").length;
  const baseDeckSize = initialDeckSize - generatedDeckEntityIds.size;
  return {
    initialDeckSize,
    remainingDeckSize: Math.min(initialDeckSize, remainingDeckSize),
    ...(baseDeckSize > 0 && baseDeckSize < initialDeckSize ? { baseDeckSize } : {})
  };
}
