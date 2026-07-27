import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sampleCardDb from "../fixtures/cards.sample.json";
import { parseDeckText } from "../src/shared/deck";
import { createCardDatabase, type CardDatabase } from "../src/shared/cardDatabase";
import { parseLogLine } from "../src/shared/powerLogParser";
import { TrackerEngine } from "../src/shared/trackerEngine";
import type { CollectionDeck, DeckCard } from "../src/shared/types";

const cardDb = sampleCardDb as CardDatabase;

describe("parseDeckText", () => {
  it("parses manual deck lines", () => {
    const deck = parseDeckText("2x Fireball\n1 Yogg-Saron, Unleashed\nMiracle Salesman");
    expect(deck.cards).toEqual([
      { name: "Fireball", count: 2 },
      { name: "Miracle Salesman", count: 1 },
      { name: "Yogg-Saron, Unleashed", count: 1 }
    ]);
  });

  it("keeps deck code as raw text", () => {
    const deck = parseDeckText("AAECAf0EBveryLongDeckCode000000==");
    expect(deck.rawCode).toBe("AAECAf0EBveryLongDeckCode000000==");
    expect(deck.warnings[0]).toContain("缺少卡牌数据库");
  });

  it("decodes a deck code when a card database is available", () => {
    const deckCode = encodeDeckString([0, 1, 2, 1, 7, 1, 1001, 1, 1002, 0]);

    const deck = parseDeckText(deckCode, cardDb);

    expect(deck.rawCode).toBe(deckCode);
    expect(deck.cards).toEqual([
      expect.objectContaining({ name: "Sample Pair", count: 2, cardId: "TEST_002" }),
      expect.objectContaining({ name: "Sample Singleton", count: 1, cardId: "TEST_001" })
    ]);
    expect(deck.warnings).toEqual([]);
  });
});

describe("parseLogLine", () => {
  it("parses zone changes", () => {
    const events = parseLogLine(
      "D 12:00:00.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND"
    );

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "zone-change",
          entityId: "64",
          cardName: "Fireball",
          fromZone: "DECK",
          toZone: "HAND"
        })
      ])
    );
  });

  it("keeps card ids when Hearthstone logs an unknown nested entity", () => {
    const events = parseLogLine(
      "D 12:00:00.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=64 zone=DECK zonePos=1 cardId=TEST_001 player=1] tag=ZONE value=HAND"
    );

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "zone-change",
          entityId: "64",
          cardName: undefined,
          cardId: "TEST_001",
          fromZone: "DECK",
          toZone: "HAND"
        })
      ])
    );
  });

  it("recognizes Hearthstone's end-of-game records", () => {
    expect(
      parseLogLine("D 12:10:00.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=本地玩家 tag=PLAYSTATE value=LOST")
    ).toEqual([expect.objectContaining({ type: "game-end" })]);
    expect(
      parseLogLine("D 12:10:00.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=FINAL_GAMEOVER")
    ).toEqual([expect.objectContaining({ type: "game-end" })]);
  });

  it("parses player identities and public player counters without card data", () => {
    expect(
      parseLogLine(
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=2, PlayerName=测试玩家#1234"
      )
    ).toEqual([
      expect.objectContaining({
        type: "player-identity",
        playerId: 2,
        playerName: "测试玩家#1234"
      })
    ]);

    expect(
      parseLogLine(
        "D 12:00:01.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=测试玩家#1234 tag=FATIGUE value=2"
      )
    ).toEqual([
      expect.objectContaining({
        type: "player-counter",
        playerName: "测试玩家#1234",
        counter: "fatigue",
        value: 2
      })
    ]);
    expect(
      parseLogLine(
        "D 12:00:02.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=测试玩家#1234 tag=CORPSES value=7"
      )
    ).toEqual([
      expect.objectContaining({
        type: "player-counter",
        playerName: "测试玩家#1234",
        counter: "corpses",
        value: 7
      })
    ]);
    expect(
      parseLogLine(
        "D 12:00:03.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=测试玩家 id=2 zone=PLAY cardId= player=2] tag=NUM_SPELLS_PLAYED_THIS_GAME value=5"
      )
    ).toEqual([
      expect.objectContaining({
        type: "player-counter",
        playerId: 2,
        counter: "spells-played",
        value: 5
      })
    ]);
  });

  it("emits only whitelisted start-of-game global effect triggers", () => {
    const globalEffect = parseLogLine(
      "D 20:46:32.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=TRIGGER Entity=[entityName=指挥官碧阿崔克丝 id=42 zone=SETASIDE cardId=JAIL_397 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1 TriggerKeyword=START_OF_GAME_KEYWORD"
    );
    const ordinaryTrigger = parseLogLine(
      "D 20:46:33.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=TRIGGER Entity=[entityName=普通光环 id=43 zone=PLAY cardId=NORMAL_AURA player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1 TriggerKeyword=START_OF_GAME_KEYWORD"
    );

    expect(globalEffect).toEqual([
      expect.objectContaining({ type: "global-effect", entity: expect.objectContaining({ cardId: "JAIL_397", controller: 2 }) })
    ]);
    expect(ordinaryTrigger).toEqual([]);
  });

  it("emits a persistent effect only for an explicitly whitelisted played card", () => {
    const persistentPlay = parseLogLine(
      "D 12:00:01.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=星界沟通 id=51 zone=HAND cardId=BAR_539 player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1"
    );
    const ordinaryPlay = parseLogLine(
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=普通法术 id=52 zone=HAND cardId=NORMAL_SPELL player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1"
    );

    expect(persistentPlay).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "global-effect",
        source: "played",
        entity: expect.objectContaining({ cardId: "BAR_539", controller: 1 })
      })
    ]));
    expect(ordinaryPlay.some((event) => event.type === "global-effect")).toBe(false);
  });
});

describe("TrackerEngine", () => {
  it("shows Aviana beside Hamuul after the opponent reaches full moon", () => {
    const fixture = readFileSync(
      join(process.cwd(), "fixtures/logs/opponent-aviana-full-moon/Power.log"),
      "utf8"
    );
    const richDb = createCardDatabase([
      { id: 1, cardId: "EDR_845", name: "哈缪尔·符文图腾", type: "MINION" },
      { id: 2, cardId: "EDR_895", name: "艾维娜，艾露恩钦选者", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);

    engine.applyText(fixture);

    expect(engine.getState().opponentGlobalEffects).toHaveLength(2);
    expect(engine.getState().opponentGlobalEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "哈缪尔·符文图腾", cardId: "EDR_845" }),
      expect.objectContaining({ name: "艾维娜，艾露恩钦选者", cardId: "EDR_895" })
    ]));
  });

  it("replays the sanitized real duplicate-start fixture without dropping the selected deck", () => {
    const fixture = readFileSync(
      join(process.cwd(), "fixtures/logs/constructed-duplicate-create/Power.log"),
      "utf8"
    );
    const richDb = createCardDatabase([
      { id: 1, cardId: "JAIL_397", name: "指挥官碧阿崔克丝", type: "MINION" },
      { id: 2, cardId: "CORE_DS1_184", name: "追踪术", type: "SPELL" },
      { id: 3, cardId: "JAM_037", name: "精英牛头人歌王", type: "MINION" }
    ]);
    const engine = new TrackerEngine({
      cardDatabase: richDb,
      collectionDecks: [createCollectionDeck("selected", "学徒猎人", [{ name: "测试卡", count: 30, cardId: "TEST_CARD" }])]
    });
    engine.setFriendlyController(1);
    const [firstLine, ...remainingLines] = fixture.trimEnd().split("\n");
    engine.applyLine(firstLine);
    expect(engine.activateCollectionDeck("selected")).toBe(true);
    engine.applyText(remainingLines.join("\n"));

    expect(engine.getState()).toMatchObject({
      deckName: "学徒猎人",
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0 },
      friendlyHand: [{ name: "精英牛头人歌王", count: 1, cardId: "JAM_037" }],
      friendlyOther: [{ name: "追踪术", count: 1, cardId: "CORE_DS1_184" }],
      globalEffects: [],
      opponentGlobalEffects: [{ name: "指挥官碧阿崔克丝", count: 1, cardId: "JAIL_397" }]
    });
  });

  it("keeps friendly and opponent global effects separate and resets them on a real new game", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "GIL_692", name: "格恩·灰鬃", type: "MINION" },
      { id: 2, cardId: "JAIL_397", name: "指挥官碧阿崔克丝", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 20:46:06.3975180 GameState.DebugPrintPower() - CREATE_GAME
D 20:46:07.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=TRIGGER Entity=[entityName=格恩·灰鬃 id=41 zone=SETASIDE cardId=GIL_692 player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1 TriggerKeyword=START_OF_GAME_KEYWORD
D 20:46:08.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=TRIGGER Entity=[entityName=指挥官碧阿崔克丝 id=42 zone=SETASIDE cardId=JAIL_397 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1 TriggerKeyword=START_OF_GAME_KEYWORD
D 20:46:06.3975180 PowerTaskList.DebugPrintPower() - CREATE_GAME
`);

    expect(engine.getState()).toMatchObject({
      globalEffects: [{ name: "格恩·灰鬃", count: 1, cardId: "GIL_692" }],
      opponentGlobalEffects: [{ name: "指挥官碧阿崔克丝", count: 1, cardId: "JAIL_397" }]
    });

    engine.applyLine("D 20:50:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME");
    expect(engine.getState()).toMatchObject({ globalEffects: [], opponentGlobalEffects: [] });
  });

  it("tracks public counters by PlayerID and resets them at game boundaries", () => {
    const engine = new TrackerEngine();
    engine.setFriendlyController(2);
    engine.applyText(`
D 12:00:00.000 GameState.DebugPrintPower() - CREATE_GAME
D 12:00:00.100 GameState.DebugPrintGame() - PlayerID=1, PlayerName=UNKNOWN HUMAN PLAYER
D 12:00:00.100 GameState.DebugPrintGame() - PlayerID=2, PlayerName=看似对手#1234
D 12:00:01.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=本地玩家 tag=NUM_SPELLS_PLAYED_THIS_GAME value=4
D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=本地玩家 tag=NUM_SPELLS_PLAYED_THIS_GAME value=4
D 12:00:02.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=看似对手#1234 tag=CORPSES value=7
D 12:00:02.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=看似对手#1234 tag=CORPSES value=7
D 12:00:03.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=本地玩家 tag=FATIGUE value=2
D 12:00:03.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=本地玩家 tag=FATIGUE value=2
D 12:00:04.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=看似对手#1234 tag=NUM_SPELLS_PLAYED_THIS_GAME value=5
D 12:00:04.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=看似对手#1234 tag=NUM_SPELLS_PLAYED_THIS_GAME value=5
D 12:00:05.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=看似对手#1234 tag=FATIGUE value=0
`);

    expect(engine.getState().matchCounters).toEqual({
      friendly: { corpses: 7, spellsPlayed: 5 },
      opponent: { nextFatigueDamage: 3, spellsPlayed: 4 }
    });

    engine.applyLine("D 12:01:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME");
    expect(engine.getState().matchCounters).toBeUndefined();

    engine.applyText(`
D 12:01:00.100 GameState.DebugPrintGame() - PlayerID=1, PlayerName=UNKNOWN HUMAN PLAYER
D 12:01:00.100 GameState.DebugPrintGame() - PlayerID=2, PlayerName=看似对手#1234
D 12:01:01.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=看似对手#1234 tag=CORPSES value=2
D 12:01:02.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=看似对手#1234 tag=PLAYSTATE value=LOST
`);
    expect(engine.getState().matchCounters).toBeUndefined();
  });

  const realPowerLogPath = "/Applications/Hearthstone/Logs/Hearthstone_2026_07_23_11_05_14/Power.log";
  const realPowerLogTest = existsSync(realPowerLogPath) ? it : it.skip;
  realPowerLogTest("replays public counters from the real 2026-07-23 Power.log", () => {
    const fixture = readFileSync(realPowerLogPath, "utf8");
    const gameEndIndex = fixture.search(
      /tag=PLAYSTATE\s+value=(?:WON|LOST|TIED|CONCEDED)\b|tag=(?:STEP|NEXT_STEP)\s+value=FINAL_GAMEOVER\b/i
    );
    expect(gameEndIndex).toBeGreaterThan(0);

    const engine = new TrackerEngine();
    engine.setFriendlyController(2);
    engine.applyText(fixture.slice(0, gameEndIndex));

    expect(engine.getState().matchCounters).toEqual({
      friendly: { corpses: 17, spellsPlayed: 14 },
      opponent: { nextFatigueDamage: 3, corpses: 12, spellsPlayed: 11 }
    });

    engine.applyText(fixture.slice(gameEndIndex));
    expect(engine.getState().matchCounters).toBeUndefined();
  });

  it("separates persistent effects played by each controller and clears them after game end", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "BAR_539", name: "星界沟通", type: "SPELL" },
      { id: 2, cardId: "GDB_467", name: "类星体", type: "SPELL" },
      { id: 3, cardId: "NORMAL_SPELL", name: "普通法术", type: "SPELL" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=星界沟通 id=51 zone=HAND cardId=BAR_539 player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 12:00:02.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=类星体 id=52 zone=HAND cardId=GDB_467 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 12:00:03.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=星界沟通 id=53 zone=HAND cardId=BAR_539] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 12:00:04.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=普通法术 id=54 zone=HAND cardId=NORMAL_SPELL player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
`);

    expect(engine.getState()).toMatchObject({
      globalEffects: [{ name: "星界沟通", count: 1, cardId: "BAR_539" }],
      opponentGlobalEffects: [{ name: "类星体", count: 1, cardId: "GDB_467" }]
    });

    engine.applyLine("D 12:10:00.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=本地玩家 id=1 zone=PLAY cardId= player=1] tag=PLAYSTATE value=LOST");
    expect(engine.getState()).toMatchObject({ globalEffects: [], opponentGlobalEffects: [] });
  });

  it("在星空投影球详情中按施放顺序记录本局我方法术并忽略重复日志", () => {
    const richDb = createCardDatabase([
      { id: 103354, cardId: "TOY_378", name: "星空投影球", type: "SPELL", cost: 10 },
      { id: 1, cardId: "CORE_CS2_024", name: "寒冰箭", type: "SPELL", cost: 2 },
      { id: 2, cardId: "REV_840", name: "死神之躯", type: "SPELL", cost: 6 },
      { id: 3, cardId: "OPPONENT_SPELL", name: "对手法术", type: "SPELL", cost: 4 }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(2);
    engine.applyText(`
D 08:18:06.3615000 GameState.DebugPrintPower() - CREATE_GAME
D 08:18:32.0537060 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=星空投影球 id=60 zone=DECK zonePos=0 cardId=TOY_378 player=2] tag=ZONE value=HAND
D 08:20:53.4861770 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=寒冰箭 id=51 zone=HAND zonePos=7 cardId=CORE_CS2_024 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 08:20:53.4861770 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=寒冰箭 id=51 zone=HAND zonePos=7 cardId=CORE_CS2_024 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 08:21:39.5040300 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=死神之躯 id=85 zone=HAND zonePos=5 cardId=REV_840 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 08:21:39.5040300 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=死神之躯 id=85 zone=HAND zonePos=5 cardId=REV_840 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 08:22:00.0000000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=对手法术 id=90 zone=HAND zonePos=1 cardId=OPPONENT_SPELL player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
`);

    expect(engine.getState().friendlyHand).toContainEqual(
      expect.objectContaining({
        name: "星空投影球",
        cardId: "TOY_378",
        details: expect.objectContaining({
          playedSpellsThisGame: [
            expect.objectContaining({ name: "寒冰箭", cardId: "CORE_CS2_024" }),
            expect.objectContaining({ name: "死神之躯", cardId: "REV_840" })
          ]
        })
      })
    );
  });

  it("同一法术实体回手后再次施放会重复记录且新局清空历史", () => {
    const richDb = createCardDatabase([
      { id: 103354, cardId: "TOY_378", name: "星空投影球", type: "SPELL", cost: 10 },
      { id: 1, cardId: "CORE_CS2_024", name: "寒冰箭", type: "SPELL", cost: 2 }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(2);
    engine.applyText(`
D 08:18:06.3615000 GameState.DebugPrintPower() - CREATE_GAME
D 08:18:32.0537060 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=星空投影球 id=60 zone=DECK zonePos=0 cardId=TOY_378 player=2] tag=ZONE value=HAND
D 08:20:53.4861770 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=寒冰箭 id=51 zone=HAND zonePos=7 cardId=CORE_CS2_024 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 08:20:53.4861770 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=寒冰箭 id=51 zone=HAND zonePos=7 cardId=CORE_CS2_024 player=2] tag=ZONE value=PLAY
D 08:20:53.4861770 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=寒冰箭 id=51 zone=PLAY zonePos=0 cardId=CORE_CS2_024 player=2] tag=ZONE value=GRAVEYARD
D 08:20:53.4861770 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=寒冰箭 id=51 zone=HAND zonePos=7 cardId=CORE_CS2_024 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 08:21:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=寒冰箭 id=51 zone=GRAVEYARD zonePos=0 cardId=CORE_CS2_024 player=2] tag=ZONE value=HAND
D 08:21:01.0000000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=寒冰箭 id=51 zone=HAND zonePos=1 cardId=CORE_CS2_024 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 08:21:01.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=寒冰箭 id=51 zone=HAND zonePos=1 cardId=CORE_CS2_024 player=2] tag=ZONE value=PLAY
D 08:21:01.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=寒冰箭 id=51 zone=PLAY zonePos=0 cardId=CORE_CS2_024 player=2] tag=ZONE value=GRAVEYARD
D 08:21:01.0000000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=寒冰箭 id=51 zone=HAND zonePos=1 cardId=CORE_CS2_024 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
`);

    expect(engine.getState().friendlyHand).toContainEqual(
      expect.objectContaining({
        cardId: "TOY_378",
        details: expect.objectContaining({
          playedSpellsThisGame: [
            expect.objectContaining({ name: "寒冰箭", cardId: "CORE_CS2_024" }),
            expect.objectContaining({ name: "寒冰箭", cardId: "CORE_CS2_024" })
          ]
        })
      })
    );

    engine.applyText(`
D 08:26:11.3028700 GameState.DebugPrintPower() - CREATE_GAME
D 08:26:12.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=星空投影球 id=160 zone=DECK zonePos=0 cardId=TOY_378 player=2] tag=ZONE value=HAND
`);

    expect(engine.getState().friendlyHand).toContainEqual(
      expect.objectContaining({
        cardId: "TOY_378",
        details: expect.objectContaining({ playedSpellsThisGame: [] })
      })
    );
  });

  it("reports known opponent cards in deck, hand, and other current zones", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "OPP_DECK", name: "对手牌库牌", type: "SPELL" },
      { id: 2, cardId: "OPP_HAND", name: "对手手牌", type: "MINION" },
      { id: 3, cardId: "OPP_PLAY", name: "对手场上牌", type: "LOCATION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=对手牌库牌 id=10 zone=DECK cardId=OPP_DECK player=2] CardID=OPP_DECK
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=对手手牌 id=11 zone=HAND cardId=OPP_HAND player=2] CardID=OPP_HAND
D 12:00:03.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=对手场上牌 id=12 zone=PLAY cardId=OPP_PLAY player=2] CardID=OPP_PLAY
`);

    expect(engine.getState()).toMatchObject({
      opponentDeck: [{ name: "对手牌库牌", count: 1, cardId: "OPP_DECK" }],
      opponentHand: [{ name: "对手手牌", count: 1, cardId: "OPP_HAND" }],
      opponentOther: [{ name: "对手场上牌", count: 1, cardId: "OPP_PLAY" }],
      opponentDeckCount: 1,
      opponentHandCount: 1
    });
  });

  it("counts hidden opponent deck and hand entities without inventing deck identities", () => {
    const engine = new TrackerEngine();
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=20 zone=DECK cardId= player=2] CardID=
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=21 zone=DECK cardId= player=2] CardID=
D 12:00:03.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=22 zone=HAND cardId= player=2] CardID=
D 12:00:04.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=23 zone=HAND cardId= player=2] CardID=
`);

    expect(engine.getState()).toMatchObject({
      opponentDeck: [],
      opponentHand: [],
      opponentDeckCount: 2,
      opponentHandCount: 2
    });
  });

  it("replaces one hidden opponent hand row when that entity is revealed", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "REVEALED", name: "被揭示的牌", type: "SPELL" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=30 zone=HAND cardId= player=2] CardID=
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=31 zone=HAND cardId= player=2] CardID=
`);
    engine.applyLine(
      "D 12:00:03.000 PowerTaskList.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=被揭示的牌 id=30 zone=HAND cardId= player=2] CardID=REVEALED"
    );

    expect(engine.getState()).toMatchObject({
      opponentHand: [{ name: "被揭示的牌", count: 1, cardId: "REVEALED" }],
      opponentHandCount: 2
    });
  });

  it("clears opponent zone cards and totals on the next game", () => {
    const engine = new TrackerEngine();
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=40 zone=DECK cardId= player=2] CardID=
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=41 zone=HAND cardId= player=2] CardID=
D 12:01:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
`);

    expect(engine.getState()).toMatchObject({
      opponentDeck: [],
      opponentHand: [],
      opponentOther: [],
      opponentDeckCount: 0,
      opponentHandCount: 0
    });
  });

  it("tracks opponent secret slots and live attack totals for both boards", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "EX1_287", name: "法术反制", collectible: true, type: "SPELL", playerClass: "MAGE", mechanics: ["SECRET"] },
      { id: 2, cardId: "MINION", name: "测试随从", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY id=70 zone=HAND cardId= player=2] tag=ZONE value=SECRET
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=测试随从 id=80 zone=PLAY cardId=MINION player=1] CardID=MINION
D 12:00:02.100 PowerTaskList.DebugPrintPower() - tag=ATK value=4
D 12:00:03.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=测试随从 id=81 zone=PLAY cardId=MINION player=2] CardID=MINION
D 12:00:03.100 PowerTaskList.DebugPrintPower() - tag=ATK value=6
`);

    expect(engine.getState()).toMatchObject({
      opponentSecrets: [{ entityId: "70" }],
      boardAttack: { friendly: 4, opponent: 6 }
    });

    engine.applyLine("D 12:00:04.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=测试随从 id=81 zone=PLAY cardId=MINION player=2] tag=ZONE value=GRAVEYARD");
    expect(engine.getState().boardAttack).toEqual({ friendly: 4, opponent: 0 });
    engine.applyLine("D 12:10:00.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=本地玩家 tag=PLAYSTATE value=LOST");
    expect(engine.getState().opponentSecrets).toEqual([]);
  });

  it("counts hero attack once and excludes weapons and non-combat board entities", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "HERO", name: "测试英雄", type: "HERO" },
      { id: 2, cardId: "WEAPON", name: "测试武器", type: "WEAPON" },
      { id: 3, cardId: "MINION", name: "测试随从", type: "MINION" },
      { id: 4, cardId: "LOCATION", name: "测试地标", type: "LOCATION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=测试英雄 id=80 zone=PLAY cardId=HERO player=1] CardID=HERO
D 12:00:01.050 PowerTaskList.DebugPrintPower() - tag=CARDTYPE value=HERO
D 12:00:01.100 PowerTaskList.DebugPrintPower() - tag=ATK value=4
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=测试武器 id=81 zone=PLAY cardId=WEAPON player=1] CardID=WEAPON
D 12:00:02.050 PowerTaskList.DebugPrintPower() - tag=CARDTYPE value=WEAPON
D 12:00:02.100 PowerTaskList.DebugPrintPower() - tag=ATK value=4
D 12:00:03.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=测试随从 id=82 zone=PLAY cardId=MINION player=1] CardID=MINION
D 12:00:03.050 PowerTaskList.DebugPrintPower() - tag=CARDTYPE value=MINION
D 12:00:03.100 PowerTaskList.DebugPrintPower() - tag=ATK value=3
D 12:00:04.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=测试地标 id=83 zone=PLAY cardId=LOCATION player=1] CardID=LOCATION
D 12:00:04.050 PowerTaskList.DebugPrintPower() - tag=CARDTYPE value=LOCATION
D 12:00:04.100 PowerTaskList.DebugPrintPower() - tag=ATK value=9
`);

    expect(engine.getState().boardAttack).toEqual({ friendly: 7, opponent: 0 });
  });

  it("narrows an existing secret slot after the opponent hero is revealed", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "MAGE_SECRET", name: "法师奥秘", collectible: true, type: "SPELL", playerClass: "MAGE", mechanics: ["SECRET"] },
      { id: 2, cardId: "PAL_SECRET", name: "骑士奥秘", collectible: true, type: "SPELL", playerClass: "PALADIN", mechanics: ["SECRET"] },
      { id: 3, cardId: "HERO_MAGE", name: "法师英雄", type: "HERO", playerClass: "MAGE" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyLine("D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY id=70 zone=HAND cardId= player=2] tag=ZONE value=SECRET");
    engine.applyLine("D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=法师英雄 id=2 zone=PLAY cardId=HERO_MAGE player=2] CardID=HERO_MAGE");
    expect(engine.getState().opponentSecrets?.[0].candidates.map((candidate) => candidate.cardId)).toEqual(["MAGE_SECRET"]);
  });

  it("does not treat a revealed questline in the SECRET zone as an opponent secret", () => {
    const richDb = createCardDatabase([
      { id: 64375, cardId: "SW_039", name: "一决胜负", collectible: true, type: "SPELL", playerClass: "DEMONHUNTER" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(2);
    engine.applyText(`
D 15:50:59.335 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=28 zone=HAND zonePos=1 cardId= player=1] CardID=SW_039
D 15:50:59.335 GameState.DebugPrintPower() - tag=ZONE value=SECRET
D 15:50:59.335 GameState.DebugPrintPower() - tag=QUEST_PROGRESS_TOTAL value=4
D 15:50:59.335 GameState.DebugPrintPower() - tag=QUESTLINE value=1
`);
    expect(engine.getState().opponentSecrets).toEqual([]);
  });

  it("removes an anonymous temporary slot when it is later revealed as a non-secret questline", () => {
    const richDb = createCardDatabase([
      { id: 64375, cardId: "SW_039", name: "一决胜负", collectible: true, type: "SPELL", playerClass: "DEMONHUNTER" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(2);
    engine.applyLine("D 15:50:58.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY id=28 zone=HAND cardId= player=1] tag=ZONE value=SECRET");
    expect(engine.getState().opponentSecrets).toHaveLength(1);
    engine.applyLine("D 15:50:59.335 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY id=28 zone=SECRET cardId= player=1] CardID=SW_039");
    expect(engine.getState().opponentSecrets).toEqual([]);
  });

  it("keeps real and unknown opponent secrets conservatively", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "REAL_SECRET", name: "真实奥秘", collectible: true, type: "SPELL", playerClass: "MAGE", mechanics: ["SECRET"] }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyLine("D 12:00:01.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=真实奥秘 id=70 zone=HAND cardId=REAL_SECRET player=2] tag=ZONE value=SECRET");
    engine.applyLine("D 12:00:02.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY id=71 zone=HAND cardId= player=2] tag=ZONE value=SECRET");
    expect(engine.getState().opponentSecrets?.map((slot) => slot.entityId)).toEqual(["70", "71"]);
  });
  it("groups friendly hand cards from current entity zones", () => {
    const engine = new TrackerEngine({ deckText: "2x Fireball" });
    engine.setFriendlyController(1);

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND
`);

    expect(engine.getState()).toMatchObject({
      friendlyHand: [{ name: "Fireball", count: 1, cardId: "CS2_029" }],
      friendlyOther: []
    });
  });

  it("moves a friendly card from hand to other when it is played", () => {
    const engine = new TrackerEngine({ deckText: "1x Fireball" });
    engine.setFriendlyController(1);

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND
D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=HAND zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=PLAY
`);

    expect(engine.getState()).toMatchObject({
      friendlyHand: [],
      friendlyOther: [{ name: "Fireball", count: 1, cardId: "CS2_029" }]
    });
  });

  it("keeps a revealed hand card in hand when a different entity is created in play", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "HAND_A", name: "手牌A", type: "MINION" },
      { id: 2, cardId: "HAND_B", name: "手牌B", type: "MINION" },
      { id: 3, cardId: "HAND_C", name: "手牌C", type: "MINION" },
      { id: 4, cardId: "HAND_D", name: "手牌D", type: "MINION" },
      { id: 5, cardId: "HAND_E", name: "手牌E", type: "MINION" },
      { id: 6, cardId: "TOY_375", name: "滑冰元素", type: "MINION" },
      { id: 7, cardId: "RLK_544t", name: "奥术防御者衍生物", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(2);

    engine.applyText(`
D 09:05:26.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=手牌A id=70 zone=DECK cardId=HAND_A player=2] tag=ZONE value=HAND
D 09:05:26.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=手牌B id=71 zone=DECK cardId=HAND_B player=2] tag=ZONE value=HAND
D 09:05:26.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=手牌C id=72 zone=DECK cardId=HAND_C player=2] tag=ZONE value=HAND
D 09:05:26.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=手牌D id=73 zone=DECK cardId=HAND_D player=2] tag=ZONE value=HAND
D 09:05:26.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=手牌E id=74 zone=DECK cardId=HAND_E player=2] tag=ZONE value=HAND
D 09:05:26.6659900 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=59 zone=DECK zonePos=0 cardId= player=2] CardID=TOY_375
D 09:05:26.6659900 GameState.DebugPrintPower() -         tag=CONTROLLER value=2
D 09:05:26.6659900 GameState.DebugPrintPower() -         tag=ZONE value=HAND
`);

    const revealedState = engine.getState();
    expect(revealedState.friendlyHand?.reduce((total, card) => total + card.count, 0)).toBe(6);
    expect(revealedState.friendlyHand).toContainEqual(
      expect.objectContaining({ name: "滑冰元素", count: 1, cardId: "TOY_375" })
    );

    engine.applyText(`
D 09:05:32.4991480 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=156 CardID=RLK_544t
D 09:05:32.4991480 GameState.DebugPrintPower() -                 tag=CONTROLLER value=2
D 09:05:32.4991480 GameState.DebugPrintPower() -                 tag=ZONE value=PLAY
`);

    const createdState = engine.getState();
    expect(createdState.friendlyHand?.reduce((total, card) => total + card.count, 0)).toBe(6);
    expect(createdState.friendlyHand).toContainEqual(
      expect.objectContaining({ name: "滑冰元素", count: 1, cardId: "TOY_375" })
    );
    expect(createdState.friendlyOther).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "滑冰元素" })])
    );

    engine.applyLine(
      "D 09:05:33.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=滑冰元素 id=160 zone=PLAY cardId=TOY_375 player=2] tag=ZONE value=GRAVEYARD"
    );

    expect(engine.getState().friendlyHand).toContainEqual(
      expect.objectContaining({ name: "滑冰元素", count: 1, cardId: "TOY_375" })
    );
    expect(engine.getState().friendlyOther).toContainEqual(
      expect.objectContaining({ name: "滑冰元素", count: 1, cardId: "TOY_375" })
    );
  });

  it.each(["PLAY", "GRAVEYARD", "REMOVEDFROMGAME", "SECRET"])(
    "groups the %s zone under friendly other",
    (zone) => {
      const engine = new TrackerEngine({ deckText: "1x Fireball" });
      engine.setFriendlyController(1);

      engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=HAND zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=${zone}
`);

      expect(engine.getState()).toMatchObject({
        friendlyHand: [],
        friendlyOther: [{ name: "Fireball", count: 1, cardId: "CS2_029" }]
      });
    }
  );

  it("aggregates distinct copies by card id without recounting duplicate log lines", () => {
    const engine = new TrackerEngine({ deckText: "2x Fireball" });
    engine.setFriendlyController(1);
    const firstDraw =
      "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND";

    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    engine.applyLine(firstDraw);
    engine.applyLine(firstDraw);
    engine.applyLine(
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=65 zone=DECK zonePos=2 cardId=CS2_029 player=1] tag=ZONE value=HAND"
    );

    expect(engine.getState().friendlyHand).toEqual([{ name: "Fireball", count: 2, cardId: "CS2_029" }]);
  });

  it("counts unresolved friendly hand entities after replaying an in-progress game", () => {
    const engine = new TrackerEngine({ deckText: "1x Fireball" });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME GameType=GT_RANKED
D 12:00:01.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating [entityName=UNKNOWN ENTITY [cardType=INVALID] id=64 zone=HAND zonePos=1 cardId= player=1] CardID=
D 12:00:01.000 PowerTaskList.DebugPrintPower() - tag=CONTROLLER value=1
D 12:00:01.000 PowerTaskList.DebugPrintPower() - tag=ZONE value=HAND
D 12:00:02.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Fireball id=65 zone=DECK zonePos=0 cardId=CS2_029 player=1] tag=ZONE value=HAND
`);
    expect(engine.getState().friendlyHand).toEqual([
      { name: "Fireball", count: 1, cardId: "CS2_029" },
      { name: "未识别手牌", count: 1 }
    ]);
  });

  it("uses card data for displayable entities and filters non-card entity types", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "TOKEN_001", name: "Generated Token", type: "MINION", mana_cost: 1 },
      { id: 2, cardId: "HERO_001", name: "Friendly Hero", type: "HERO" },
      { id: 3, cardId: "POWER_001", name: "Friendly Hero Power", type: "HERO_POWER" },
      { id: 4, cardId: "ENCHANT_001", name: "Friendly Enchantment", type: "ENCHANTMENT" },
      { id: 5, cardId: "PLAYER_001", name: "Friendly Player", type: "PLAYER" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Generated Token id=64 zone=HAND zonePos=1 cardId=TOKEN_001 player=1] tag=ZONE value=PLAY
D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Friendly Hero id=65 zone=HAND zonePos=1 cardId=HERO_001 player=1] tag=ZONE value=PLAY
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Friendly Hero Power id=66 zone=HAND zonePos=1 cardId=POWER_001 player=1] tag=ZONE value=PLAY
D 12:00:04.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Friendly Enchantment id=67 zone=HAND zonePos=1 cardId=ENCHANT_001 player=1] tag=ZONE value=PLAY
D 12:00:05.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Friendly Player id=68 zone=HAND zonePos=1 cardId=PLAYER_001 player=1] tag=ZONE value=PLAY
`);

    expect(engine.getState().friendlyOther).toEqual([
      expect.objectContaining({
        name: "Generated Token",
        count: 1,
        cardId: "TOKEN_001",
        details: expect.objectContaining({ cardType: "随从", manaCost: 1 })
      })
    ]);
  });

  it("tracks draws and opponent plays from sample power lines", () => {
    const engine = new TrackerEngine({ deckText: "2x Fireball\n1x Miracle Salesman" });

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND
D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Chillwind Yeti id=65 zone=HAND zonePos=1 cardId=CS2_182 player=2] tag=ZONE value=PLAY
`);

    const state = engine.getState();
    expect(state.deck.find((card) => card.name === "Fireball")).toMatchObject({ remaining: 1, drawn: 1 });
    expect(state.opponentPlayed.find((card) => card.name === "Chillwind Yeti")).toMatchObject({ played: 1 });
    expect(state.summary).toMatchObject({ totalCards: 3, remainingCards: 2, drawnCards: 1, opponentPlayedCount: 1 });
  });

  it("tracks card reveals from entity detail tags and ignores duplicate log copies", () => {
    const engine = new TrackerEngine({ deckText: "2x Fireball" });
    engine.setFriendlyController(1);

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=Fireball id=64 zone=DECK zonePos=0 cardId= player=1] CardID=CS2_029
D 12:00:01.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=1
D 12:00:01.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=Fireball id=64 zone=DECK zonePos=0 cardId= player=1] CardID=CS2_029
D 12:00:01.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=1
D 12:00:01.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND
`);

    expect(engine.getState().deck[0]).toMatchObject({ name: "Fireball", remaining: 1, drawn: 1 });
  });

  it("returns a mulligan card to the deck when Hearthstone moves it from hand to deck", () => {
    const engine = new TrackerEngine({ deckText: "1x Fireball" });
    engine.setFriendlyController(1);

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=0 cardId=CS2_029 player=1] tag=ZONE value=HAND
D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=HAND zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=DECK
`);

    expect(engine.getState().deck[0]).toMatchObject({ name: "Fireball", remaining: 1, drawn: 0 });
    expect(engine.getState().friendlyHand).toEqual([]);
    expect(engine.getState().friendlyOther).toEqual([]);
  });

  it("moves an unresolved Arena card out of and back into the deck for an unknown mulligan card", () => {
    const engine = new TrackerEngine();
    engine.loadDeckCards([
      { name: "Sample Singleton", count: 29, cardId: "TEST_001" },
      { name: "未解析竞技场牌", count: 1, unresolved: true }
    ], "竞技场牌库");
    engine.setFriendlyController(1);

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Unknown Arena Card id=64 zone=DECK zonePos=0 cardId=UNKNOWN_001 player=1] tag=ZONE value=HAND
`);

    expect(engine.getState().summary).toMatchObject({ totalCards: 30, remainingCards: 29, drawnCards: 1 });
    expect(engine.getState().deck.find((card) => card.unresolved)).toMatchObject({ remaining: 0, drawn: 1 });

    engine.applyLine(
      "D 12:00:01.500 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Generated Unknown Card id=65 zone=DECK zonePos=0 cardId=UNKNOWN_002 player=1] tag=ZONE value=HAND"
    );
    expect(engine.getState().summary).toMatchObject({ totalCards: 30, remainingCards: 29, drawnCards: 1 });

    engine.applyLine(
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Unknown Arena Card id=64 zone=HAND zonePos=1 cardId=UNKNOWN_001 player=1] tag=ZONE value=DECK"
    );

    expect(engine.getState().summary).toMatchObject({ totalCards: 30, remainingCards: 30, drawnCards: 0 });
    expect(engine.getState().deck.find((card) => card.unresolved)).toMatchObject({ remaining: 1, drawn: 0 });
  });

  it("clears friendly zone cards across game, import, and reset boundaries", () => {
    const engine = new TrackerEngine({ deckText: "1x Fireball" });
    engine.setFriendlyController(1);
    const draw =
      "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND";

    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    engine.applyLine(draw);
    expect(engine.getState().friendlyHand).toHaveLength(1);

    engine.applyLine("D 12:01:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    expect(engine.getState().friendlyHand).toEqual([]);

    engine.applyLine(draw);
    engine.importDeck("1x Frostbolt");
    expect(engine.getState().friendlyHand).toEqual([]);

    engine.applyLine("D 12:02:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    engine.applyLine(
      "D 12:02:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Frostbolt id=65 zone=DECK zonePos=1 cardId=CS2_024 player=1] tag=ZONE value=HAND"
    );
    engine.applyLine("D 12:05:00.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=Friendly tag=PLAYSTATE value=WON");
    expect(engine.getState().friendlyHand).toEqual([]);
    expect(engine.getState().friendlyOther).toEqual([]);
  });

  it("clears the completed game when Hearthstone reports a result", () => {
    const engine = new TrackerEngine({ deckText: "2x Fireball" });

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND
D 12:05:00.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=本地玩家 tag=PLAYSTATE value=LOST
`);

    expect(engine.getState()).toMatchObject({
      deckName: undefined,
      autoMatchedDeckId: undefined,
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    });
  });

  it("tracks draws by card id when the log has no card name", () => {
    const deckCode = encodeDeckString([0, 1, 2, 1, 7, 1, 1001, 0, 0]);
    const engine = new TrackerEngine({ deckText: deckCode, cardDatabase: cardDb });

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=64 zone=DECK zonePos=1 cardId=TEST_001 player=1] tag=ZONE value=HAND
`);

    const state = engine.getState();
    expect(state.deck.find((card) => card.name === "Sample Singleton")).toMatchObject({
      cardId: "TEST_001",
      remaining: 0,
      drawn: 1
    });
    expect(state.events[0]).toMatchObject({ kind: "draw", cardName: "Sample Singleton", cardId: "TEST_001" });
  });

  it("attaches card details to a manually named row after the log reveals its card id", () => {
    const richDb = createCardDatabase([
      {
        id: 315,
        cardId: "CS2_029",
        name: "火球术",
        type: 5,
        mana_cost: 4,
        text: "造成 6点伤害。",
        image: "https://example.test/fireball.png",
        crop_image: "https://example.test/fireball-crop.png"
      }
    ]);
    const engine = new TrackerEngine({ deckText: "2x Fireball", cardDatabase: richDb });
    engine.setFriendlyController(1);

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND
`);

    expect(engine.getState().deck[0]).toMatchObject({
      cardId: "CS2_029",
      details: { name: "火球术", manaCost: 4, isSpell: true, text: "造成 6点伤害。" }
    });
  });

  it("resolves opponent card names from card ids when no deck is imported", () => {
    const engine = new TrackerEngine({ cardDatabase: cardDb });

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=65 zone=HAND zonePos=1 cardId=TEST_002 player=2] tag=ZONE value=PLAY
`);

    const state = engine.getState();
    expect(state.opponentPlayed).toEqual([
      expect.objectContaining({ name: "Sample Pair", cardId: "TEST_002", played: 1 })
    ]);
  });

  it("auto matches a collection deck from friendly draw observations", () => {
    const engine = new TrackerEngine({
      cardDatabase: cardDb,
      collectionDecks: [
        createCollectionDeck("deck-a", "自动套牌 A", [
          { name: "Sample Singleton", count: 1, cardId: "TEST_001" },
          { name: "Sample Pair", count: 2, cardId: "TEST_002" }
        ]),
        createCollectionDeck("deck-b", "自动套牌 B", [
          { name: "Sample Singleton", count: 1, cardId: "TEST_001" },
          { name: "Sample Multi", count: 2, cardId: "TEST_003" }
        ])
      ]
    });
    engine.setFriendlyController(1);

    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=64 zone=DECK zonePos=1 cardId=TEST_001 player=1] tag=ZONE value=HAND
`);

    expect(engine.getState().autoMatchedDeckId).toBeUndefined();

    engine.applyText(
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=65 zone=DECK zonePos=2 cardId=TEST_002 player=1] tag=ZONE value=HAND"
    );

    const state = engine.getState();
    expect(state.autoMatchedDeckId).toBe("deck-a");
    expect(state.deckName).toBe("自动套牌 A");
    expect(state.summary).toMatchObject({ totalCards: 3, remainingCards: 1, drawnCards: 2 });
    expect(state.deck.find((card) => card.cardId === "TEST_001")).toMatchObject({ remaining: 0, drawn: 1 });
    expect(state.deck.find((card) => card.cardId === "TEST_002")).toMatchObject({ remaining: 1, drawn: 1 });

    engine.applyText(
      "D 12:00:03.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=66 zone=DECK zonePos=1 cardId=TEST_002 player=2] tag=ZONE value=HAND\n" +
      "D 12:00:04.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=67 zone=HAND zonePos=1 cardId=TEST_002 player=2] tag=ZONE value=PLAY"
    );

    expect(engine.getState().summary.drawnCards).toBe(2);
    expect(engine.getState().opponentPlayed.find((card) => card.cardId === "TEST_002")).toMatchObject({ played: 1 });
  });

  it("uses Hearthstone's selected collection deck immediately after a game begins", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("deck-a", "自动套牌 A", [
          { name: "Sample Singleton", count: 1, cardId: "TEST_001" },
          { name: "Sample Pair", count: 2, cardId: "TEST_002" }
        ])
      ]
    });

    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    expect(engine.activateCollectionDeck("deck-a")).toBe(true);

    const state = engine.getState();
    expect(state).toMatchObject({
      deckName: "自动套牌 A",
      autoMatchedDeckId: "deck-a",
      summary: { totalCards: 3, remainingCards: 3, drawnCards: 0 }
    });
  });

  it("previews a collection deck before the match starts", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("preview-deck", "偷取牌库", [
          { name: "Sample Singleton", count: 1, cardId: "TEST_001" },
          { name: "Sample Pair", count: 2, cardId: "TEST_002" }
        ])
      ]
    });

    expect(engine.previewCollectionDeck("preview-deck")).toBe(true);
    expect(engine.getState()).toEqual(
      expect.objectContaining({
        deckName: "偷取牌库",
        autoMatchedDeckId: "preview-deck",
        summary: expect.objectContaining({ totalCards: 3, remainingCards: 3 })
      })
    );
  });

  it("keeps the selected collection deck when the live game begins", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("preview-deck", "偷取牌库", [
          { name: "Sample Singleton", count: 1, cardId: "TEST_001" },
          { name: "Sample Pair", count: 2, cardId: "TEST_002" }
        ])
      ]
    });
    engine.setFriendlyController(1);

    expect(engine.previewCollectionDeck("preview-deck")).toBe(true);
    engine.applyText([
      "D 12:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
      "D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Sample Singleton id=64 zone=DECK zonePos=1 cardId=TEST_001 player=1] tag=ZONE value=HAND"
    ].join("\n"));

    expect(engine.getState()).toMatchObject({
      gameActive: true,
      deckName: "偷取牌库",
      autoMatchedDeckId: "preview-deck",
      summary: { totalCards: 3, remainingCards: 2, drawnCards: 1 }
    });
  });

  it("clears a collection deck preview before the match starts", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("preview-deck", "预览套牌", [
          { name: "Sample Singleton", count: 1, cardId: "TEST_001" }
        ])
      ]
    });

    expect(engine.previewCollectionDeck("preview-deck")).toBe(true);
    expect(engine.clearCollectionDeckPreview()).toBe(true);
    expect(engine.getState()).toMatchObject({
      deckName: undefined,
      autoMatchedDeckId: undefined,
      deck: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0 }
    });
  });

  it("does not clear an active collection deck", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("active-deck", "对局套牌", [
          { name: "Sample Singleton", count: 1, cardId: "TEST_001" }
        ])
      ]
    });
    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME");
    expect(engine.activateCollectionDeck("active-deck")).toBe(true);

    expect(engine.clearCollectionDeckPreview()).toBe(false);
    expect(engine.getState()).toMatchObject({
      deckName: "对局套牌",
      autoMatchedDeckId: "active-deck",
      summary: { totalCards: 1, remainingCards: 1 }
    });
  });

  it("rejects a selected collection deck when Power.log reports a different real deck size", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("stale-20", "旧的 20 张套牌", [{ name: "Sample Singleton", count: 20, cardId: "TEST_001" }])
      ]
    });

    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    engine.setFriendlyDeckSnapshot({ initialDeckSize: 40, remainingDeckSize: 34 });

    expect(engine.activateCollectionDeck("stale-20")).toBe(false);
    engine.useUnmatchedDeckSnapshot();

    expect(engine.getState()).toMatchObject({
      deckName: "等待精确识别",
      autoMatchedDeckId: undefined,
      summary: { totalCards: 40, remainingCards: 34, drawnCards: 6 }
    });
  });

  it("accepts Hearthstone's explicit selected deck even when the deck code is missing cards", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("explicit-20", "偷取牌库", [{ name: "Sample Singleton", count: 20, cardId: "TEST_001" }])
      ]
    });

    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME");
    engine.setFriendlyDeckSnapshot({ initialDeckSize: 30, remainingDeckSize: 27 });

    expect(engine.activateExplicitCollectionDeck("explicit-20")).toBe(true);
    expect(engine.getState()).toMatchObject({
      deckName: "偷取牌库",
      autoMatchedDeckId: "explicit-20",
      summary: { totalCards: 30, remainingCards: 27, drawnCards: 3 }
    });
    expect(engine.getState().deck.find((card) => card.name === "日志缺失的收藏牌")).toMatchObject({
      count: 10
    });
  });

  it("accepts the selected base deck when game-start effects add extra unknown cards", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("base-deck", "已选套牌", [
          { name: "Sample Singleton", count: 1, cardId: "TEST_001" },
          { name: "Sample Pair", count: 1, cardId: "TEST_002" }
        ])
      ]
    });
    engine.setFriendlyController(2);
    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME");
    engine.setFriendlyDeckSnapshot({ initialDeckSize: 4, remainingDeckSize: 3, baseDeckSize: 2 });

    expect(engine.activateCollectionDeck("base-deck")).toBe(true);
    expect(engine.getState()).toMatchObject({
      deckName: "已选套牌",
      autoMatchedDeckId: "base-deck",
      summary: { totalCards: 4, remainingCards: 3, drawnCards: 1 }
    });
    expect(engine.getState().deck.find((card) => card.name === "对局生成的未知牌")).toMatchObject({
      count: 2,
      remaining: 1,
      drawn: 1
    });

    engine.applyLine(
      "D 12:00:01.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Sample Multi id=64 zone=DECK zonePos=1 cardId=TEST_003 player=2] tag=ZONE value=HAND"
    );

    expect(engine.getState()).toMatchObject({ summary: { totalCards: 4, remainingCards: 2, drawnCards: 2 } });
    expect(engine.getState().deck.find((card) => card.name === "对局生成的未知牌")).toMatchObject({ remaining: 0, drawn: 2 });
  });

  it("lets Hearthstone's selected deck override an earlier automatic guess", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("deck-a", "猜测套牌", [{ name: "Sample Singleton", count: 1, cardId: "TEST_001" }]),
        createCollectionDeck("deck-b", "已选套牌", [{ name: "Sample Pair", count: 2, cardId: "TEST_002" }])
      ]
    });

    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    expect(engine.activateCollectionDeck("deck-a")).toBe(true);
    expect(engine.activateCollectionDeck("deck-b")).toBe(true);

    expect(engine.getState()).toMatchObject({
      deckName: "已选套牌",
      autoMatchedDeckId: "deck-b",
      summary: { totalCards: 2, remainingCards: 2, drawnCards: 0 }
    });
  });

  it("does not auto match before a game starts or from the opponent's draw", () => {
    const engine = new TrackerEngine({
      cardDatabase: cardDb,
      collectionDecks: [
        createCollectionDeck("deck-a", "自动套牌 A", [{ name: "Sample Singleton", count: 1, cardId: "TEST_001" }])
      ]
    });
    engine.setFriendlyController(1);

    engine.applyLine(
      "D 12:00:00.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=64 zone=DECK zonePos=1 cardId=TEST_001 player=2] tag=ZONE value=HAND"
    );
    expect(engine.getState().autoMatchedDeckId).toBeUndefined();

    engine.applyLine("D 12:00:01.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    engine.applyLine(
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=65 zone=DECK zonePos=1 cardId=TEST_001 player=1] tag=ZONE value=HAND"
    );
    expect(engine.getState().autoMatchedDeckId).toBe("deck-a");
  });

  it("waits for a delayed local id and keeps same-name opponent cards separate", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("same-name", "同名测试套牌", [
          { name: "Twin Card", count: 1, cardId: "CARD_A" },
          { name: "Twin Card", count: 1, cardId: "CARD_B" }
        ])
      ]
    });

    engine.applyLine("D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME");
    engine.applyLine(
      "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Twin Card id=64 zone=DECK zonePos=1 cardId=CARD_B player=2] tag=ZONE value=HAND"
    );
    engine.setFriendlyController(1);
    engine.applyLine(
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Twin Card id=65 zone=DECK zonePos=1 cardId=CARD_A player=1] tag=ZONE value=HAND"
    );
    engine.applyLine(
      "D 12:00:03.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Twin Card id=66 zone=HAND zonePos=1 cardId=CARD_B player=2] tag=ZONE value=PLAY"
    );

    const state = engine.getState();
    expect(state.autoMatchedDeckId).toBe("same-name");
    expect(state.deck).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Twin Card", cardId: "CARD_A", drawn: 1, remaining: 0 }),
      expect.objectContaining({ name: "Twin Card", cardId: "CARD_B", drawn: 0, remaining: 1 })
    ]));
    expect(state.opponentPlayed).toEqual([
      expect.objectContaining({ name: "Twin Card", cardId: "CARD_B", played: 1 })
    ]);
  });
});

function createCollectionDeck(id: string, name: string, cards: readonly DeckCard[]): CollectionDeck {
  return {
    id,
    name,
    cards,
    rawText: name,
    sourcePath: "/tmp/Decks.log",
    updatedAt: "2026-07-10T00:00:00.000Z",
    warnings: []
  };
}

function encodeDeckString(values: readonly number[]): string {
  return Buffer.from(values.flatMap(encodeUnsignedVarint)).toString("base64");
}

function encodeUnsignedVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;

  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);

    if (remaining > 0) {
      byte += 128;
    }

    bytes.push(byte);
  } while (remaining > 0);

  return bytes;
}
