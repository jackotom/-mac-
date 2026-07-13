import { readFile } from "node:fs/promises";

import { parseDeckImport } from "../shared/deckImport.js";
import { applyGameLogEvents, createMatchStateFromDeck } from "../shared/matchState.js";
import type { DeckImportResult, GameLogEvent, MatchState } from "../shared/types.js";
import { discoverHearthstoneLogs, type HearthstoneLogFiles, type LogDiscoveryOptions } from "./logDiscovery.js";
import { parsePlayerLog, parsePowerLog } from "./logParsers.js";

export interface BuildStateFromLogsOptions extends LogDiscoveryOptions {
  readonly deckText: string;
  readonly logFiles?: HearthstoneLogFiles;
}

export interface BuildStateFromLogsResult {
  readonly deck: DeckImportResult;
  readonly logs?: HearthstoneLogFiles;
  readonly parsedEvents: readonly GameLogEvent[];
  readonly state: MatchState;
}

export async function buildStateFromLogs(
  options: BuildStateFromLogsOptions
): Promise<BuildStateFromLogsResult> {
  const deck = parseDeckImport(options.deckText);
  const logs = options.logFiles ?? (await discoverHearthstoneLogs(options));
  const parsedEvents = logs ? await readAndParseLogs(logs) : [];
  const state = applyGameLogEvents(createMatchStateFromDeck(deck), parsedEvents);

  return {
    deck,
    logs,
    parsedEvents,
    state
  };
}

export async function readAndParseLogs(logs: HearthstoneLogFiles): Promise<readonly GameLogEvent[]> {
  const [playerEvents, powerEvents] = await Promise.all([
    logs.playerLogPath ? readFile(logs.playerLogPath, "utf8").then(parsePlayerLog) : Promise.resolve([]),
    logs.powerLogPath ? readFile(logs.powerLogPath, "utf8").then(parsePowerLog) : Promise.resolve([])
  ]);

  return [...playerEvents, ...powerEvents];
}
