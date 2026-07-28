import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parsePlayerLog, parsePowerLog } from "../src/main/logParsers.js";
import { inspectFriendlyDeckSnapshot, selectCurrentPowerGameText } from "../src/shared/powerLogParser.js";

const fixtureDir = resolve("fixtures/logs/session-2026-07-10");
const duplicateFixtureDir = resolve("fixtures/logs/constructed-duplicate-create");

describe("log parsers", () => {
  it("parses Power.log game, draw, reveal, and play events", async () => {
    const content = await readFile(resolve(fixtureDir, "Power.log"), "utf8");
    const events = parsePowerLog(content);

    expect(events.map((event) => event.type)).toEqual([
      "game-started",
      "zone-change",
      "card-played",
      "entity-revealed",
      "zone-change"
    ]);
    expect(events[1]).toEqual(
      expect.objectContaining({
        type: "zone-change",
        value: "HAND",
        entity: expect.objectContaining({
          name: "Fireball",
          cardId: "CS2_029",
          playerId: 1,
          zone: "DECK"
        })
      })
    );
    expect(events[2]).toEqual(
      expect.objectContaining({
        type: "card-played",
        entity: expect.objectContaining({ name: "Chillwind Yeti", playerId: 2 })
      })
    );
  });

  it("parses Player.log player identity and local player markers", async () => {
    const content = await readFile(resolve(fixtureDir, "Player.log"), "utf8");
    const events = parsePlayerLog(content);

    expect(events).toEqual([
      expect.objectContaining({ type: "player-info", playerId: 1, name: "LocalMage" }),
      expect.objectContaining({ type: "player-info", playerId: 2, name: "Opponent" }),
      expect.objectContaining({ type: "player-info", playerId: 1, isLocal: true })
    ]);
  });

  it("parses Player.log game start signals when Power.log is stalled", () => {
    const events = parsePlayerLog([
      "I 16:52:01.000 Gameplay.Awake()",
      "I 16:52:02.000 Network.GameHandle - SERVER_GAME_STARTED"
    ].join("\n"));

    expect(events.filter((event) => event.type === "game-started")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "game-started", source: "Player.log" });
  });

  it("keeps identity lines between duplicate CREATE_GAME dumps for the same game", () => {
    const currentGame = selectCurrentPowerGameText([
      "D 11:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
      "D 12:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
      "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=UNKNOWN HUMAN PLAYER",
      "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=2, PlayerName=昏沉的幽灵#511319",
      "D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME",
      "D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=火羽精灵 id=37 zone=DECK cardId=CORE_UNG_809 player=2] tag=ZONE value=HAND"
    ].join("\n"));

    expect(currentGame).toContain("PlayerID=2, PlayerName=昏沉的幽灵#511319");
    expect(currentGame).not.toContain("11:00:00.000");
  });

  it("uses the Power.log entity snapshot to verify the local deck size", () => {
    const snapshot = inspectFriendlyDeckSnapshot(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:00.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=4 zone=DECK zonePos=0 cardId= player=2] CardID=
D 12:00:00.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=5 zone=DECK zonePos=0 cardId= player=2] CardID=
D 12:00:00.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=6 zone=HAND zonePos=1 cardId=TEST_001 player=2] CardID=TEST_001
D 12:00:00.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_READY
D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Sample Singleton id=4 zone=DECK zonePos=0 cardId=TEST_001 player=2] tag=ZONE value=HAND
`, 2);

    expect(snapshot).toEqual({ initialDeckSize: 2, remainingDeckSize: 1 });
  });

  it("counts nested SHOW_ENTITY zone continuations in the sanitized real duplicate-start snapshot", async () => {
    const content = await readFile(resolve(duplicateFixtureDir, "Power.log"), "utf8");

    expect(inspectFriendlyDeckSnapshot(content, 1)).toEqual({
      initialDeckSize: 30,
      remainingDeckSize: 28
    });
  });

  it("keeps game-start generated deck cards separate from the selected collection deck", () => {
    const snapshot = inspectFriendlyDeckSnapshot(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:00.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=4 zone=DECK zonePos=0 cardId= player=2] CardID=
D 12:00:00.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=5 zone=DECK zonePos=0 cardId= player=2] CardID=
D 12:00:01.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=6 zone=DECK zonePos=0 cardId= player=2] CardID=
D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=6 zone=DECK zonePos=0 cardId= player=2] tag=DISPLAYED_CREATOR value=4
D 12:00:02.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_READY
D 12:00:03.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Sample Singleton id=4 zone=DECK zonePos=0 cardId=TEST_001 player=2] tag=ZONE value=HAND
`, 2);

    expect(snapshot).toEqual({ initialDeckSize: 3, remainingDeckSize: 2, baseDeckSize: 2 });
  });

  it("excludes cards inserted after setup from the original deck snapshot remaining count", () => {
    const snapshot = inspectFriendlyDeckSnapshot(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:00.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=4 zone=DECK zonePos=0 cardId= player=1] CardID=
D 12:00:00.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=5 zone=DECK zonePos=0 cardId= player=1] CardID=
D 12:00:00.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=6 zone=DECK zonePos=0 cardId= player=1] CardID=
D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Sample Singleton id=4 zone=DECK zonePos=0 cardId=TEST_001 player=1] tag=ZONE value=HAND
D 12:00:02.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION
D 12:00:03.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=234 CardID=
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     tag=ZONE value=DECK
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=1
D 12:00:03.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=234 tag=DISPLAYED_CREATOR value=219
D 12:00:03.000 PowerTaskList.DebugPrintPower() - SHOW_ENTITY - Updating Entity=234 CardID=MIS_707
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=1
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     tag=ZONE value=DECK
D 12:00:03.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=235 CardID=
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     tag=ZONE value=DECK
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=1
D 12:00:03.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=235 tag=DISPLAYED_CREATOR value=219
D 12:00:03.000 PowerTaskList.DebugPrintPower() - SHOW_ENTITY - Updating Entity=235 CardID=MIS_707
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=1
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     tag=ZONE value=DECK
`, 1);

    expect(snapshot).toEqual({
      initialDeckSize: 3,
      remainingDeckSize: 2
    });
  });
});
