import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parsePlayerLog, parsePowerLog } from "../src/main/logParsers.js";
import { parseDeckImport } from "../src/shared/deckImport.js";
import { applyGameLogEvents, createMatchStateFromDeck } from "../src/shared/matchState.js";

const fixtureDir = resolve("fixtures/logs/session-2026-07-10");

describe("match state", () => {
  it("updates friendly deck, drawn cards, opponent plays, and event stream from logs", async () => {
    const deck = parseDeckImport(`
2x Fireball
1x Frostbolt
`);
    const playerLog = await readFile(resolve(fixtureDir, "Player.log"), "utf8");
    const powerLog = await readFile(resolve(fixtureDir, "Power.log"), "utf8");
    const events = [...parsePlayerLog(playerLog), ...parsePowerLog(powerLog)];

    const state = applyGameLogEvents(createMatchStateFromDeck(deck), events);

    expect(state.friendlyPlayerId).toBe(1);
    expect(state.players).toEqual([
      expect.objectContaining({ playerId: 2, name: "Opponent" }),
      expect.objectContaining({ playerId: 1, name: "LocalMage", isLocal: true })
    ]);
    expect(state.drawnCards.map((card) => card.name)).toEqual(["Fireball", "Frostbolt"]);
    expect(state.friendlyDeck).toEqual([expect.objectContaining({ name: "Fireball", count: 1 })]);
    expect(state.opponentPlayedCards).toEqual([
      expect.objectContaining({ name: "Chillwind Yeti", cardId: "CS2_182", playerId: 2 })
    ]);
    expect(state.events.map((event) => event.type)).toContain("card-drawn");
    expect(state.events.map((event) => event.type)).toContain("opponent-card-played");
  });
});
