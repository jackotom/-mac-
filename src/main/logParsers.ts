import type {
  CardPlayedEvent,
  EntityRevealedEvent,
  GameLogEvent,
  HearthstoneEntity,
  PlayerInfoEvent,
  ZoneChangeEvent
} from "../shared/types.js";

const LINE_TIMESTAMP_PATTERN = /^[A-Z]\s+([0-9:.]+)/;

export function parsePowerLog(content: string): GameLogEvent[] {
  return content
    .split(/\r?\n/)
    .map((line) => parsePowerLogLine(line))
    .filter((event): event is GameLogEvent => Boolean(event));
}

export function parsePlayerLog(content: string): GameLogEvent[] {
  return content
    .split(/\r?\n/)
    .map((line) => parsePlayerLogLine(line))
    .filter((event): event is GameLogEvent => Boolean(event));
}

export function parsePowerLogLine(line: string): GameLogEvent | undefined {
  const raw = line.trimEnd();
  if (raw.length === 0) {
    return undefined;
  }

  const timestamp = parseTimestamp(raw);

  if (raw.includes("CREATE_GAME") && !/GameType=GT_ARENA\b/i.test(raw)) {
    return {
      type: "game-started",
      source: "Power.log",
      timestamp,
      raw
    };
  }

  const zoneChange = parseZoneChange(raw, timestamp);
  if (zoneChange) {
    return zoneChange;
  }

  const cardPlayed = parseCardPlayed(raw, timestamp);
  if (cardPlayed) {
    return cardPlayed;
  }

  const entityRevealed = parseEntityRevealed(raw, timestamp);
  if (entityRevealed) {
    return entityRevealed;
  }

  return undefined;
}

export function parsePlayerLogLine(line: string): GameLogEvent | undefined {
  const raw = line.trimEnd();
  if (raw.length === 0) {
    return undefined;
  }

  const timestamp = parseTimestamp(raw);
  if (/\bSERVER_GAME_STARTED\b/.test(raw)) {
    return {
      type: "game-started",
      source: "Player.log",
      timestamp,
      raw
    };
  }

  const localPlayerId = parseLocalPlayerId(raw);
  if (localPlayerId !== undefined) {
    return {
      type: "player-info",
      source: "Player.log",
      timestamp,
      raw,
      playerId: localPlayerId,
      isLocal: true
    };
  }

  const playerInfo = parsePlayerInfo(raw, timestamp);
  if (playerInfo) {
    return playerInfo;
  }

  return undefined;
}

function parseZoneChange(raw: string, timestamp: string | undefined): ZoneChangeEvent | undefined {
  if (!raw.includes("TAG_CHANGE") || !raw.includes(" tag=")) {
    return undefined;
  }

  const match = raw.match(/TAG_CHANGE Entity=(.+?) tag=([A-Z_]+) value=([^\s]+)/);
  if (!match) {
    return undefined;
  }

  return {
    type: "zone-change",
    source: "Power.log",
    timestamp,
    raw,
    entity: parseEntity(match[1] ?? ""),
    tag: match[2] ?? "",
    value: match[3] ?? ""
  };
}

function parseCardPlayed(raw: string, timestamp: string | undefined): CardPlayedEvent | undefined {
  if (!raw.includes("BLOCK_START") || !raw.includes("BlockType=PLAY")) {
    return undefined;
  }

  const blockType = raw.match(/BlockType=([A-Z_]+)/)?.[1];
  const entityText = extractEntityText(raw);
  if (!blockType || !entityText) {
    return undefined;
  }

  return {
    type: "card-played",
    source: "Power.log",
    timestamp,
    raw,
    entity: parseEntity(entityText),
    blockType
  };
}

function parseEntityRevealed(raw: string, timestamp: string | undefined): EntityRevealedEvent | undefined {
  if (!raw.includes("SHOW_ENTITY") && !raw.includes("FULL_ENTITY")) {
    return undefined;
  }

  const entityText = extractEntityText(raw);
  if (!entityText) {
    return undefined;
  }

  const explicitCardId = parseExplicitCardId(raw);
  const entity = parseEntity(entityText, explicitCardId);

  return {
    type: "entity-revealed",
    source: "Power.log",
    timestamp,
    raw,
    entity,
    cardId: explicitCardId ?? entity.cardId
  };
}

function parsePlayerInfo(raw: string, timestamp: string | undefined): PlayerInfoEvent | undefined {
  const id = firstNumberMatch(raw, [
    /\bPlayerID[=:]\s*(\d+)/i,
    /\bPlayerId[=:]\s*(\d+)/i,
    /\bplayerId[=:]\s*(\d+)/
  ]);

  if (id === undefined) {
    return undefined;
  }

  const name =
    firstTextMatch(raw, [
      /\bPlayerName[=:]\s*"?([^",\]]+)/i,
      /\bName[=:]\s*"?([^",\]]+)/i,
      /\bname[=:]\s*"?([^",\]]+)/
    ])?.trim() || undefined;

  return {
    type: "player-info",
    source: "Player.log",
    timestamp,
    raw,
    playerId: id,
    name
  };
}

function parseLocalPlayerId(raw: string): number | undefined {
  if (!/local\s*player|LocalPlayer|localPlayer/.test(raw)) {
    return undefined;
  }

  return firstNumberMatch(raw, [
    /\bPlayerID[=:]\s*(\d+)/i,
    /\bPlayerId[=:]\s*(\d+)/i,
    /\bplayerId[=:]\s*(\d+)/
  ]);
}

function parseEntity(rawEntity: string, fallbackCardId?: string): HearthstoneEntity {
  const raw = rawEntity.trim();
  const body = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  const parsedCardId = firstTextMatch(body, [/\bcardId=([^\s\]]*)/]);
  const name = firstTextMatch(body, [/entityName=(.+?)\s+id=/])?.trim();

  return {
    raw,
    entityId: firstNumberMatch(body, [/\bid=(\d+)/]),
    name: normalizeEntityName(name),
    cardId: parsedCardId && parsedCardId.length > 0 ? parsedCardId : fallbackCardId,
    playerId: firstNumberMatch(body, [/\bplayer=(\d+)/]),
    zone: firstTextMatch(body, [/\bzone=([A-Z_]+)/]),
    zonePos: firstNumberMatch(body, [/\bzonePos=(\d+)/])
  };
}

function extractEntityText(raw: string): string | undefined {
  const entityIndex = raw.indexOf("Entity=");
  if (entityIndex >= 0) {
    return readEntityValue(raw.slice(entityIndex + "Entity=".length));
  }

  const updatingIndex = raw.indexOf("Updating [");
  if (updatingIndex >= 0) {
    return readEntityValue(raw.slice(updatingIndex + "Updating ".length));
  }

  return undefined;
}

function readEntityValue(value: string): string | undefined {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("[")) {
    const simple = trimmed.match(/^([^\s]+)/)?.[1];
    return simple;
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

function parseExplicitCardId(raw: string): string | undefined {
  const cardId = raw.match(/\bCardID=([A-Za-z0-9_]+)/)?.[1];
  return cardId && cardId.length > 0 ? cardId : undefined;
}

function parseTimestamp(raw: string): string | undefined {
  return raw.match(LINE_TIMESTAMP_PATTERN)?.[1];
}

function normalizeEntityName(name: string | undefined): string | undefined {
  if (!name || name.startsWith("UNKNOWN ENTITY")) {
    return undefined;
  }

  return name;
}

function firstNumberMatch(raw: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const value = raw.match(pattern)?.[1];
    if (value) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function firstTextMatch(raw: string, patterns: readonly RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const value = raw.match(pattern)?.[1];
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}
