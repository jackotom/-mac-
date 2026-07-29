import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sampleCardDb from "../fixtures/cards.sample.json";
import { parseDeckText } from "../src/shared/deck";
import { createCardDatabase, type CardDatabase } from "../src/shared/cardDatabase";
import { parseLogLine } from "../src/shared/powerLogParser";
import { TrackerEngine } from "../src/shared/trackerEngine";
import { parsePublicTrackerState } from "../src/renderer/runtimeValidation";
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

    expect(globalEffect.filter((event) => event.type === "global-effect")).toEqual([
      expect.objectContaining({ type: "global-effect", entity: expect.objectContaining({ cardId: "JAIL_397", controller: 2 }) })
    ]);
    expect(ordinaryTrigger.some((event) => event.type === "global-effect")).toBe(false);
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

  it("records the actual nested spells cast by a random-spell card", () => {
    const richDb = createCardDatabase([
      {
        id: 103270,
        cardId: "TOY_372",
        name: "匣中古神",
        collectible: 1,
        type: "SPELL",
        text: "随机施放5个法术。"
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: 9001 + index,
        cardId: `SPELL_${index + 1}`,
        name: `第${index + 1}张法术`,
        collectible: 1,
        type: "SPELL"
      }))
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(2);
    engine.applyText(`
D 08:18:06.3615000 GameState.DebugPrintPower() - CREATE_GAME
D 08:18:32.0537060 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=DECK zonePos=0 cardId=TOY_372 player=2] tag=ZONE value=HAND
D 08:20:53.4861770 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=匣中古神 id=60 zone=HAND zonePos=1 cardId=TOY_372 player=2] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1
D 08:20:53.5000000 GameState.DebugPrintPower() -     BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=60 zone=PLAY zonePos=0 cardId=TOY_372 player=2]
D 08:20:53.5000000 GameState.DebugPrintPower() -         FULL_ENTITY - Creating ID=71 CardID=SPELL_1
D 08:20:53.5000000 GameState.DebugPrintPower() -         FULL_ENTITY - Creating ID=72 CardID=SPELL_2
D 08:20:53.5000000 GameState.DebugPrintPower() -         FULL_ENTITY - Creating ID=73 CardID=SPELL_3
D 08:20:53.5000000 GameState.DebugPrintPower() -         FULL_ENTITY - Creating ID=74 CardID=SPELL_4
D 08:20:53.5000000 GameState.DebugPrintPower() -         FULL_ENTITY - Creating ID=75 CardID=SPELL_5
D 08:20:53.5200000 GameState.DebugPrintPower() -         BLOCK_START BlockType=POWER Entity=[entityName=第2张法术 id=72 zone=PLAY zonePos=0 cardId=SPELL_2 player=2]
D 08:20:53.5200000 GameState.DebugPrintPower() -             FULL_ENTITY - Creating ID=76 CardID=SPELL_6
D 08:20:53.5300000 GameState.DebugPrintPower() -         BLOCK_END
D 08:20:53.5400000 GameState.DebugPrintPower() -     BLOCK_END
D 08:20:53.5500000 GameState.DebugPrintPower() - BLOCK_END
`);

    const used = engine.getState().cardTracking!.friendly.used;
    expect(used.totalCount).toBe(1);
    const section = used.items[0]?.outcomeSections?.[0];
    expect(section?.cards.map((node) => node.card.cardId)).toEqual([
      "SPELL_1",
      "SPELL_2",
      "SPELL_3",
      "SPELL_4",
      "SPELL_5"
    ]);
    expect(section?.cards?.[1]).toMatchObject({
      card: expect.objectContaining({ cardId: "SPELL_2", name: "第2张法术" })
    });
    expect(section?.cards[1]?.children).toBeUndefined();
  });

  it("keeps ten doubled outcomes, nested random casts, controller isolation, duplicate-log deduplication, and clears on a new game", () => {
    const richDb = createCardDatabase([
      {
        id: 103270,
        cardId: "TOY_372",
        name: "匣中古神",
        collectible: 1,
        type: "SPELL",
        text: "随机施放5个法术。"
      },
      ...Array.from({ length: 11 }, (_, index) => ({
        id: 9100 + index,
        cardId: `RANDOM_SPELL_${index + 1}`,
        name: `随机法术${index + 1}`,
        collectible: 1,
        type: "SPELL"
      }))
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(2);
    const blockLines = [
      ["08:20:01.0000000", "BLOCK_START BlockType=PLAY Entity=[entityName=匣中古神 id=60 zone=HAND cardId=TOY_372 player=2]"],
      ["08:20:02.0000000", "    BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=60 zone=PLAY cardId=TOY_372 player=2]"],
      ...Array.from({ length: 5 }, (_, index) => [
        "08:20:02.0000000",
        `        FULL_ENTITY - Creating ID=${71 + index} CardID=RANDOM_SPELL_${index + 1}`
      ]),
      ["08:20:03.0000000", "    BLOCK_END"],
      ["08:20:04.0000000", "    BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=60 zone=PLAY cardId=TOY_372 player=2]"],
      ...Array.from({ length: 4 }, (_, index) => [
        "08:20:04.0000000",
        `        FULL_ENTITY - Creating ID=${81 + index} CardID=RANDOM_SPELL_${index === 0 ? 1 : index + 6}`
      ]),
      ["08:20:04.0000000", "        FULL_ENTITY - Creating ID=90 CardID=TOY_372"],
      ["08:20:05.0000000", "        BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=90 zone=PLAY cardId=TOY_372 player=2]"],
      ["08:20:05.0000000", "            FULL_ENTITY - Creating ID=91 CardID=RANDOM_SPELL_10"],
      ["08:20:06.0000000", "        BLOCK_END"],
      ["08:20:07.0000000", "    BLOCK_END"],
      ["08:20:08.0000000", "BLOCK_END"]
    ] as const;
    const renderBlock = (source: "GameState" | "PowerTaskList") =>
      blockLines.map(([time, payload]) => `D ${time} ${source}.DebugPrintPower() - ${payload}`);
    engine.applyText([
      "D 08:18:06.3615000 GameState.DebugPrintPower() - CREATE_GAME",
      "D 08:18:32.0537060 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=DECK cardId=TOY_372 player=2] tag=ZONE value=HAND",
      ...renderBlock("GameState"),
      ...renderBlock("PowerTaskList"),
      "D 08:21:00.0000000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=匣中古神 id=160 zone=HAND cardId=TOY_372 player=1]",
      "D 08:21:01.0000000 GameState.DebugPrintPower() - BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=160 zone=PLAY cardId=TOY_372 player=1]",
      "D 08:21:01.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=161 CardID=RANDOM_SPELL_11",
      "D 08:21:01.0000000 GameState.DebugPrintPower() - BLOCK_END",
      "D 08:21:02.0000000 GameState.DebugPrintPower() - BLOCK_END",
      "D 08:21:03.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=160 zone=HAND cardId=TOY_372 player=1] tag=ZONE value=PLAY"
    ].join("\n"));

    const friendlyUsed = engine.getState().cardTracking!.friendly.used;
    const opponentUsed = engine.getState().cardTracking!.opponent.used;
    expect(friendlyUsed.totalCount).toBe(1);
    expect(opponentUsed.totalCount).toBe(1);
    const outcomeSection = friendlyUsed.items[0]?.outcomeSections?.[0];
    expect(outcomeSection?.cards).toHaveLength(10);
    expect(outcomeSection?.cards.filter((node) => node.card.cardId === "RANDOM_SPELL_1")).toHaveLength(2);
    expect(outcomeSection?.cards?.[9]).toMatchObject({
      card: expect.objectContaining({ cardId: "TOY_372" }),
      children: [
        expect.objectContaining({ card: expect.objectContaining({ cardId: "RANDOM_SPELL_10" }) })
      ]
    });
    expect(friendlyUsed.items[0]?.outcomeSections).toHaveLength(1);
    expect(opponentUsed.items[0]?.outcomeSections?.[0]?.cards).toEqual([
      expect.objectContaining({ card: expect.objectContaining({ cardId: "RANDOM_SPELL_11" }) })
    ]);
    expect((engine.getState().friendlyHand ?? [])
      .find((card) => card.cardId === "TOY_372")
      ?.details?.cardOutcomeSections?.[0]?.cards).toHaveLength(10);
    expect((engine.getState().opponentPlayed ?? [])
      .find((card) => card.cardId === "TOY_372")
      ?.details?.cardOutcomeSections?.[0]?.cards).toEqual([
        expect.objectContaining({ card: expect.objectContaining({ cardId: "RANDOM_SPELL_11" }) })
      ]);

    engine.applyText(`
D 08:26:11.3028700 GameState.DebugPrintPower() - CREATE_GAME
D 08:26:12.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=260 zone=DECK cardId=TOY_372 player=2] tag=ZONE value=HAND
`);
    expect(engine.getState().cardTracking!.friendly.used.totalCount).toBe(0);
    expect(engine.getState().cardTracking!.opponent.used.totalCount).toBe(0);
  });

  it("merges multiple completed captures into one usage section in completion order", () => {
    const engine = createOutcomeBindingEngine();
    const firstCapture = renderRandomSpellCapture({
      source: "GameState",
      time: "09:00:01",
      sourceEntityId: 60,
      resultEntityStart: 71,
      resultCardIds: ["SPELL_1", "SPELL_2", "SPELL_3", "SPELL_4", "SPELL_5"],
      controller: 1
    });
    const firstDuplicate = firstCapture.map((line) => line.replace("GameState", "PowerTaskList"));
    const secondCapture = renderRandomSpellCapture({
      source: "GameState",
      time: "09:00:02",
      sourceEntityId: 60,
      resultEntityStart: 81,
      resultCardIds: ["SPELL_1", "SPELL_2", "SPELL_3", "SPELL_4", "SPELL_5"],
      controller: 1
    });
    const secondDuplicate = secondCapture.map((line) => line.replace("GameState", "PowerTaskList"));

    engine.applyText([
      "D 09:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
      ...firstCapture,
      ...firstDuplicate,
      ...secondCapture,
      ...secondDuplicate
    ].join("\n"));

    const used = engine.getState().cardTracking!.friendly.used;
    expect(used.totalCount).toBe(1);
    expect(used.items[0]?.outcomeSections).toHaveLength(1);
    expect(used.items[0]?.outcomeSections?.[0]?.cards.map((node) => node.card.cardId)).toEqual([
      "SPELL_1",
      "SPELL_2",
      "SPELL_3",
      "SPELL_4",
      "SPELL_5",
      "SPELL_1",
      "SPELL_2",
      "SPELL_3",
      "SPELL_4",
      "SPELL_5"
    ]);
  });

  it("keeps returned and same-name Yogg uses bound to their own usageIds", () => {
    const engine = createOutcomeBindingEngine();
    engine.applyText([
      "D 10:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
      "D 10:00:00.500 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=DECK cardId=TOY_372 player=1] tag=ZONE value=HAND",
      ...renderRandomSpellCapture({
        source: "GameState",
        time: "10:00:01",
        sourceEntityId: 60,
        resultEntityStart: 101,
        resultCardIds: ["SPELL_1"],
        controller: 1
      }),
      "D 10:00:01.950 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=HAND cardId=TOY_372 player=1] tag=ZONE value=PLAY",
      "D 10:00:02.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=PLAY cardId=TOY_372 player=1] tag=ZONE value=HAND",
      ...renderRandomSpellCapture({
        source: "GameState",
        time: "10:00:03",
        sourceEntityId: 60,
        resultEntityStart: 102,
        resultCardIds: ["SPELL_2"],
        controller: 1
      }),
      "D 10:00:04.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=160 zone=DECK cardId=TOY_372 player=1] tag=ZONE value=HAND",
      ...renderRandomSpellCapture({
        source: "GameState",
        time: "10:00:05",
        sourceEntityId: 160,
        resultEntityStart: 103,
        resultCardIds: ["SPELL_3"],
        controller: 1
      })
    ].join("\n"));

    const used = engine.getState().cardTracking!.friendly.used;
    expect(used.totalCount).toBe(3);
    expect(new Set(used.items.map((item) => item.id)).size).toBe(3);
    expect(used.items.map((item) => ({
      entityId: item.entityId,
      cards: item.outcomeSections?.[0]?.cards.map((node) => node.card.cardId)
    }))).toEqual([
      { entityId: "160", cards: ["SPELL_3"] },
      { entityId: "60", cards: ["SPELL_2"] },
      { entityId: "60", cards: ["SPELL_1"] }
    ]);
    expect((engine.getState().friendlyHand ?? [])
      .find((card) => card.cardId === "TOY_372")
      ?.details?.cardOutcomeSections?.map((section) => section.cards[0]?.card.cardId))
      .toEqual(["SPELL_1", "SPELL_2", "SPELL_3"]);
  });

  it("does not attach an empty random-spell outcome section to an ordinary spell use", () => {
    const engine = createOutcomeBindingEngine();
    engine.applyText(`
D 11:30:00.000 GameState.DebugPrintPower() - CREATE_GAME
D 11:30:00.100 GameState.DebugPrintPower() - BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=300 zone=PLAY cardId=TOY_372 player=1]
D 11:30:00.200 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=301 CardID=SPELL_1
D 11:30:00.300 GameState.DebugPrintPower() - BLOCK_END
D 11:30:01.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=普通法术 id=200 zone=HAND cardId=NORMAL_SPELL player=1]
D 11:30:01.100 GameState.DebugPrintPower() - BLOCK_END
`);

    const used = engine.getState().cardTracking!.friendly.used;
    expect(used.totalCount).toBe(1);
    expect(used.items[0]).toMatchObject({
      entityId: "200",
      card: expect.objectContaining({ cardId: "NORMAL_SPELL", name: "普通法术" })
    });
    expect(used.items[0]?.outcomeSections).toBeUndefined();
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

  it("removes a revealed card burned directly from deck while keeping it in the graveyard section", () => {
    const richDb = createCardDatabase([
      { id: 126662, cardId: "JAIL_732", name: "虚空灵魂", collectible: 1, type: "SPELL" }
    ]);
    const engine = new TrackerEngine({ deckText: "1x 虚空灵魂", cardDatabase: richDb });
    engine.setFriendlyController(2);
    engine.applyText(`
D 19:52:00.0000000 GameState.DebugPrintPower() - CREATE_GAME
D 19:52:01.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=43 zone=DECK zonePos=1 cardId= player=2] tag=ZONE value=GRAVEYARD
D 19:52:01.0000000 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=43 zone=GRAVEYARD zonePos=0 cardId= player=2] CardID=JAIL_732
`);

    expect(engine.getState()).toMatchObject({
      deck: [expect.objectContaining({ cardId: "JAIL_732", remaining: 0, drawn: 1 })],
      friendlyHand: [],
      friendlyOther: [expect.objectContaining({ cardId: "JAIL_732", name: "虚空灵魂" })],
      summary: expect.objectContaining({ remainingCards: 0, drawnCards: 1 })
    });
  });

  it("replays the reported Power.log death order for Endgame and ignores duplicate and opponent deaths", () => {
    const richDb = createCardDatabase([
      { id: 106652, cardId: "TOY_886", name: "决胜时刻", type: "SPELL", text: "复活上一个死亡的你的恶魔。" },
      { id: 124073, cardId: "JAIL_906", name: "摩拉格", type: "MINION", minion_type_id: 15 },
      { id: 125917, cardId: "JAIL_399", name: "小鬼马仔", type: "MINION", minion_type_id: 15 },
      { id: 200001, cardId: "OPPONENT_DEMON", name: "对手恶魔", type: "MINION", minion_type_id: 15 }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(2);
    engine.applyText(`
D 20:07:57.0409600 GameState.DebugPrintPower() - CREATE_GAME
D 20:08:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=决胜时刻 id=49 zone=DECK zonePos=0 cardId=TOY_886 player=2] tag=ZONE value=HAND
D 20:13:43.9477010 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=摩拉格 id=55 zone=PLAY zonePos=1 cardId=JAIL_906 player=2] tag=ZONE value=GRAVEYARD
D 20:13:45.7896170 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=摩拉格 id=55 zone=PLAY zonePos=1 cardId=JAIL_906 player=2] tag=ZONE value=GRAVEYARD
D 20:14:00.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=对手恶魔 id=155 zone=PLAY zonePos=1 cardId=OPPONENT_DEMON player=1] tag=ZONE value=GRAVEYARD
D 20:14:19.9741080 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=小鬼马仔 id=42 zone=PLAY zonePos=2 cardId=JAIL_399 player=2] tag=ZONE value=GRAVEYARD
D 20:14:22.9982780 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=小鬼马仔 id=42 zone=PLAY zonePos=2 cardId=JAIL_399 player=2] tag=ZONE value=GRAVEYARD
`);

    expect(engine.getState().friendlyHand).toContainEqual(
      expect.objectContaining({
        cardId: "TOY_886",
        details: expect.objectContaining({
          gameContextSections: [
            expect.objectContaining({
              key: "dead-minions",
              title: "将复活",
              cards: [expect.objectContaining({ cardId: "JAIL_399", name: "小鬼马仔" })]
            })
          ]
        })
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

  it("keeps a revealed opponent card known when a linked deathrattle returns it as a new hand entity", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "END_033", name: "先觉蜿变幼龙", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=97 zone=SETASIDE zonePos=0 cardId= player=2] CardID=END_033
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=2
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=CARDTYPE value=MINION
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=ZONE value=SETASIDE
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=ENTITY_ID value=97
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -     FULL_ENTITY - Updating [entityName=绑架犯的袋子 id=98 zone=PLAY zonePos=3 cardId=REV_828t player=1] CardID=REV_828t
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=1
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=CARDTYPE value=MINION
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=ZONE value=PLAY
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=ENTITY_ID value=98
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=99 zone=SETASIDE zonePos=0 cardId= player=1] CardID=REV_828e
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=1
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=CARDTYPE value=ENCHANTMENT
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=ATTACHED value=98
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=ZONE value=SETASIDE
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -         tag=ENTITY_ID value=99
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=99 zone=SETASIDE zonePos=0 cardId= player=1] tag=ZONE value=PLAY
D 12:34:02.2890600 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY [cardType=INVALID] id=99 zone=SETASIDE zonePos=0 cardId= player=1] tag=TAG_SCRIPT_DATA_NUM_1 value=97
D 12:34:06.7058310 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=绑架犯的袋子 id=98 zone=PLAY zonePos=3 cardId=REV_828t player=1] tag=ZONE value=GRAVEYARD
D 12:34:06.7058310 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=绑架犯的袋子 id=99 zone=PLAY zonePos=0 cardId=REV_828e player=1] tag=1234 value=98
D 12:34:06.7058310 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=TRIGGER Entity=[entityName=绑架犯的袋子 id=98 zone=PLAY zonePos=3 cardId=REV_828t player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1 TriggerKeyword=DEATHRATTLE
D 12:34:06.7058310 PowerTaskList.DebugPrintPower() -     FULL_ENTITY - Creating ID=100 CardID=
D 12:34:06.7058310 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND
D 12:34:06.7058310 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=2
D 12:34:06.7058310 PowerTaskList.DebugPrintPower() -         tag=ENTITY_ID value=100
D 12:34:06.7058310 PowerTaskList.DebugPrintPower() - BLOCK_END
`);

    expect(engine.getState()).toMatchObject({
      opponentHand: [{ name: "先觉蜿变幼龙", count: 1, cardId: "END_033" }],
      opponentHandCount: 1
    });
  });

  it("ignores other created entities before the linked deathrattle creates one hidden hand card", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "KNOWN_RETURN", name: "应返回的随从", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=应返回的随从 id=97 zone=SETASIDE cardId= player=2] CardID=KNOWN_RETURN
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=亡语随从 id=98 zone=PLAY cardId=TRIGGER_MINION player=1] CardID=TRIGGER_MINION
D 12:00:03.000 PowerTaskList.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=关联附魔 id=99 zone=PLAY cardId=LINK_ENCHANTMENT player=1] CardID=LINK_ENCHANTMENT
D 12:00:03.000 PowerTaskList.DebugPrintPower() -         tag=ATTACHED value=98
D 12:00:03.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=关联附魔 id=99 zone=PLAY cardId=LINK_ENCHANTMENT player=1] tag=TAG_SCRIPT_DATA_NUM_1 value=97
D 12:00:04.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=TRIGGER Entity=[entityName=亡语随从 id=98 zone=GRAVEYARD cardId=TRIGGER_MINION player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1 TriggerKeyword=DEATHRATTLE
D 12:00:04.000 PowerTaskList.DebugPrintPower() -     FULL_ENTITY - Creating ID=150 CardID=
D 12:00:04.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=SETASIDE
D 12:00:04.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=1
D 12:00:04.000 PowerTaskList.DebugPrintPower() -     FULL_ENTITY - Creating ID=100 CardID=
D 12:00:04.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND
D 12:00:04.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=2
D 12:00:04.000 PowerTaskList.DebugPrintPower() - BLOCK_END
`);

    expect(engine.getState()).toMatchObject({
      opponentHand: [{ name: "应返回的随从", count: 1, cardId: "KNOWN_RETURN" }],
      opponentHandCount: 1
    });
  });

  it("does not transfer a known identity when a linked deathrattle creates two hidden hand cards", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "KNOWN_RETURN", name: "不应猜测的随从", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=不应猜测的随从 id=97 zone=SETASIDE cardId= player=2] CardID=KNOWN_RETURN
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=亡语随从 id=98 zone=PLAY cardId=TRIGGER_MINION player=1] CardID=TRIGGER_MINION
D 12:00:03.000 PowerTaskList.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=关联附魔 id=99 zone=PLAY cardId=LINK_ENCHANTMENT player=1] CardID=LINK_ENCHANTMENT
D 12:00:03.000 PowerTaskList.DebugPrintPower() -         tag=ATTACHED value=98
D 12:00:03.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=关联附魔 id=99 zone=PLAY cardId=LINK_ENCHANTMENT player=1] tag=TAG_SCRIPT_DATA_NUM_1 value=97
D 12:00:04.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=TRIGGER Entity=[entityName=亡语随从 id=98 zone=GRAVEYARD cardId=TRIGGER_MINION player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1 TriggerKeyword=DEATHRATTLE
D 12:00:04.000 PowerTaskList.DebugPrintPower() -     FULL_ENTITY - Creating ID=100 CardID=
D 12:00:04.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND
D 12:00:04.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=2
D 12:00:04.000 PowerTaskList.DebugPrintPower() -     FULL_ENTITY - Creating ID=101 CardID=
D 12:00:04.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND
D 12:00:04.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=2
D 12:00:04.000 PowerTaskList.DebugPrintPower() - BLOCK_END
`);

    expect(engine.getState()).toMatchObject({
      opponentHand: [],
      opponentHandCount: 2
    });
  });

  it("keeps a revealed opponent card known when the same entity returns to hand", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "KNOWN_MINION", name: "已公开随从", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=已公开随从 id=40 zone=PLAY cardId=KNOWN_MINION player=2] CardID=KNOWN_MINION
D 12:00:02.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY id=40 zone=PLAY cardId= player=2] tag=ZONE value=HAND
`);

    expect(engine.getState()).toMatchObject({
      opponentHand: [{ name: "已公开随从", count: 1, cardId: "KNOWN_MINION" }],
      opponentHandCount: 1
    });
  });

  it("does not reveal a new opponent hand entity without a reliable source link", () => {
    const richDb = createCardDatabase([
      { id: 1, cardId: "KNOWN_MINION", name: "场外已公开随从", type: "MINION" }
    ]);
    const engine = new TrackerEngine({ cardDatabase: richDb });
    engine.setFriendlyController(1);
    engine.applyText(`
D 12:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 PowerTaskList.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=场外已公开随从 id=97 zone=SETASIDE cardId= player=2] CardID=KNOWN_MINION
D 12:00:02.000 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=普通亡语随从 id=98 zone=PLAY cardId=DEATHRATTLE_MINION player=1] CardID=DEATHRATTLE_MINION
D 12:00:03.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=TRIGGER Entity=[entityName=普通亡语随从 id=98 zone=GRAVEYARD cardId=DEATHRATTLE_MINION player=1] EffectCardId=0 EffectIndex=0 Target=0 SubOption=-1 TriggerKeyword=DEATHRATTLE
D 12:00:03.000 PowerTaskList.DebugPrintPower() -     FULL_ENTITY - Creating ID=100 CardID=
D 12:00:03.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND
D 12:00:03.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=2
D 12:00:03.000 PowerTaskList.DebugPrintPower() -         tag=ENTITY_ID value=100
D 12:00:03.000 PowerTaskList.DebugPrintPower() - BLOCK_END
`);

    expect(engine.getState()).toMatchObject({
      opponentHand: [],
      opponentHandCount: 1
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

  it("adds generated cards created directly in the friendly deck exactly once", () => {
    const richDb = createCardDatabase([
      { id: 105539, cardId: "MIS_707", name: "批量生产", type: "SPELL" }
    ]);
    const engine = new TrackerEngine({ deckText: "1x 批量生产", cardDatabase: richDb });
    engine.setFriendlyController(1);

    const generatedCopies = `
D 20:28:30.7028510 GameState.DebugPrintPower() -             FULL_ENTITY - Creating ID=234 CardID=
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=ZONE value=DECK
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=CONTROLLER value=1
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=ENTITY_ID value=234
D 20:28:30.7028510 GameState.DebugPrintPower() -             TAG_CHANGE Entity=234 tag=DISPLAYED_CREATOR value=219
D 20:28:30.7028510 GameState.DebugPrintPower() -             SHOW_ENTITY - Updating Entity=234 CardID=MIS_707
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=CONTROLLER value=1
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=CARDTYPE value=SPELL
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=ZONE value=DECK
D 20:28:30.7028510 GameState.DebugPrintPower() -             FULL_ENTITY - Creating ID=235 CardID=
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=ZONE value=DECK
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=CONTROLLER value=1
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=ENTITY_ID value=235
D 20:28:30.7028510 GameState.DebugPrintPower() -             TAG_CHANGE Entity=235 tag=DISPLAYED_CREATOR value=219
D 20:28:30.7028510 GameState.DebugPrintPower() -             SHOW_ENTITY - Updating Entity=235 CardID=MIS_707
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=CONTROLLER value=1
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=CARDTYPE value=SPELL
D 20:28:30.7028510 GameState.DebugPrintPower() -                 tag=ZONE value=DECK
`;

    engine.applyLine("D 20:28:00.0000000 GameState.DebugPrintPower() - CREATE_GAME");
    engine.setFriendlyDeckSnapshot({ initialDeckSize: 30, remainingDeckSize: 30 });
    engine.applyLine(
      "D 20:28:20.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION"
    );
    engine.applyText(`
${generatedCopies}
${generatedCopies.replaceAll("GameState", "PowerTaskList")}
`);

    expect(engine.getState().deck.find((card) => card.cardId === "MIS_707")).toMatchObject({
      count: 3,
      remaining: 3,
      drawn: 0
    });
    expect(engine.getState().summary).toMatchObject({
      totalCards: 32,
      remainingCards: 32,
      drawnCards: 0
    });
  });

  it("keeps an unidentified inserted entity as one placeholder when it leaves and returns", () => {
    const engine = new TrackerEngine({ deckText: "1x Fireball" });
    engine.setFriendlyController(1);
    engine.applyLine("D 20:28:00.0000000 GameState.DebugPrintPower() - CREATE_GAME");
    engine.setFriendlyDeckSnapshot({ initialDeckSize: 30, remainingDeckSize: 30 });
    engine.applyText(`
D 20:28:20.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION
D 20:28:30.7028510 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=234 CardID=
D 20:28:30.7028510 GameState.DebugPrintPower() -     tag=ZONE value=DECK
D 20:28:30.7028510 GameState.DebugPrintPower() -     tag=CONTROLLER value=1
D 20:28:30.7028510 GameState.DebugPrintPower() - TAG_CHANGE Entity=234 tag=DISPLAYED_CREATOR value=219
D 20:28:31.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=234 tag=ZONE value=HAND
D 20:28:32.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=234 tag=ZONE value=DECK
D 20:28:32.0000000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=234 tag=ZONE value=DECK
`);

    expect(engine.getState().deck.find((card) => card.name === "被塞入的未知牌")).toMatchObject({
      count: 1,
      remaining: 1,
      drawn: 0
    });
    expect(engine.getState().deck.some((card) => card.name === "234")).toBe(false);
    expect(engine.getState().summary).toMatchObject({
      totalCards: 31,
      remainingCards: 31,
      drawnCards: 0
    });
  });

  it("does not count setup-generated deck entities twice before the first action", () => {
    const engine = new TrackerEngine({
      collectionDecks: [
        createCollectionDeck("base-deck", "开局生成牌套牌", [
          { name: "Sample Singleton", count: 30, cardId: "TEST_001" }
        ])
      ]
    });
    engine.setFriendlyController(1);
    engine.applyLine("D 20:28:00.0000000 GameState.DebugPrintPower() - CREATE_GAME");
    engine.setFriendlyDeckSnapshot({ initialDeckSize: 32, remainingDeckSize: 32, baseDeckSize: 30 });
    expect(engine.activateCollectionDeck("base-deck")).toBe(true);

    engine.applyText(`
D 20:28:10.0000000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=234 CardID=
D 20:28:10.0000000 GameState.DebugPrintPower() -     tag=ZONE value=DECK
D 20:28:10.0000000 GameState.DebugPrintPower() -     tag=CONTROLLER value=1
D 20:28:10.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=234 tag=DISPLAYED_CREATOR value=64
D 20:28:10.0000000 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=234 CardID=TEST_002
D 20:28:10.0000000 GameState.DebugPrintPower() -     tag=ZONE value=DECK
D 20:28:20.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION
`);

    expect(engine.getState().summary).toMatchObject({
      totalCards: 32,
      remainingCards: 32,
      drawnCards: 0
    });
    expect(engine.getState().deck.find((card) => card.name === "对局生成的未知牌")).toMatchObject({
      count: 2,
      remaining: 2
    });
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

  describe("public card lifecycle tracking", () => {
    it("records friendly, opponent, duplicate, hidden, and late-revealed PLAY actions once", () => {
      const engine = createLifecycleEngine();
      engine.applyText(`
D 12:00:00.000 GameState.DebugPrintPower() - CREATE_GAME
D 12:00:01.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=友方使用牌 id=51 zone=HAND cardId=FRIEND_USE player=1]
D 12:00:01.100 GameState.DebugPrintPower() - BLOCK_END
D 12:00:01.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=友方使用牌 id=51 zone=HAND cardId=FRIEND_USE player=1]
D 12:00:01.100 PowerTaskList.DebugPrintPower() - BLOCK_END
D 12:00:02.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=对手使用牌 id=61 zone=HAND cardId=OPP_USE player=2]
D 12:00:02.100 GameState.DebugPrintPower() - BLOCK_END
D 12:00:03.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=UNKNOWN ENTITY id=71 zone=HAND cardId= player=1]
D 12:00:03.100 GameState.DebugPrintPower() - BLOCK_END
D 12:00:04.000 GameState.DebugPrintPower() - BLOCK_START BlockType=POWER Entity=[entityName=古神子法术 id=81 zone=PLAY cardId=AUTO_SPELL player=1]
D 12:00:04.100 GameState.DebugPrintPower() - BLOCK_END
`);

      const beforeReveal = engine.getState().cardTracking!;
      expect(beforeReveal.friendly.used.totalCount).toBe(2);
      expect(beforeReveal.opponent.used.totalCount).toBe(1);
      expect(beforeReveal.friendly.used.items.find((item) => item.entityId === "71")).toMatchObject({
        confidence: "confirmed"
      });
      expect(beforeReveal.friendly.used.items.find((item) => item.entityId === "71")?.card).toBeUndefined();
      expect(beforeReveal.friendly.used.items.find((item) => item.entityId === "51")?.id)
        .toMatch(/^game-1:use:\d+$/);

      engine.applyLine(
        "D 12:00:05.000 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=晚揭示使用牌 id=71 zone=PLAY cardId= player=1] CardID=LATE_USE"
      );

      const afterReveal = engine.getState().cardTracking!;
      expect(afterReveal.friendly.used.totalCount).toBe(2);
      expect(afterReveal.friendly.used.items.find((item) => item.entityId === "71")).toMatchObject({
        card: expect.objectContaining({ cardId: "LATE_USE", name: "晚揭示使用牌" })
      });
      expect(() => parsePublicTrackerState(engine.getState())).not.toThrow();
    });

    it("creates a new usageId only after the same entity truly returns to hand", () => {
      const engine = createLifecycleEngine();
      engine.applyText(`
D 13:00:00.000 GameState.DebugPrintPower() - CREATE_GAME
D 13:00:01.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=友方使用牌 id=90 zone=HAND cardId=FRIEND_USE player=1]
D 13:00:01.100 GameState.DebugPrintPower() - BLOCK_END
D 13:00:01.000 PowerTaskList.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=友方使用牌 id=90 zone=HAND cardId=FRIEND_USE player=1]
D 13:00:01.100 PowerTaskList.DebugPrintPower() - BLOCK_END
D 13:00:02.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=友方使用牌 id=90 zone=PLAY cardId=FRIEND_USE player=1] tag=ZONE value=HAND
D 13:00:03.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=友方使用牌 id=90 zone=HAND cardId=FRIEND_USE player=1]
D 13:00:03.100 GameState.DebugPrintPower() - BLOCK_END
`);

      const used = engine.getState().cardTracking!.friendly.used;
      expect(used.totalCount).toBe(2);
      expect(used.items.map((item) => item.entityId)).toEqual(["90", "90"]);
      expect(new Set(used.items.map((item) => item.id)).size).toBe(2);
      expect(used.items.map((item) => item.sequence)).toEqual([2, 1]);
    });

    it("records a named PLAY missing from the database and does not duplicate it after a late reveal", () => {
      const engine = createLifecycleEngine();
      engine.applyText(`
D 13:30:00.000 GameState.DebugPrintPower() - CREATE_GAME
D 13:30:01.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=数据库外卡牌 id=91 zone=HAND cardId=OUTSIDE_DB player=1]
D 13:30:01.100 GameState.DebugPrintPower() - BLOCK_END
`);

      expectSingleOutsideDatabaseUse(engine);

      engine.setCardDatabase(createCardDatabase([
        { id: 91, cardId: "OUTSIDE_DB", name: "数据库外卡牌", type: "SPELL" }
      ]));
      expectSingleOutsideDatabaseUse(engine);

      engine.applyLine(
        "D 13:30:02.000 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=数据库外卡牌 id=91 zone=PLAY cardId= player=1] CardID=OUTSIDE_DB"
      );

      expectSingleOutsideDatabaseUse(engine);
    });

    it("records an inferred burn once, updates all physical zones, and allows a later real reburn", () => {
      const engine = createLifecycleEngine("2x 烧毁测试牌");
      engine.applyText([
        "D 14:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
        ...createHandEntityLines(10, 1),
        "D 14:00:20.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=烧毁测试牌 id=43 zone=DECK cardId=BURNED_CARD player=1] tag=ZONE value=GRAVEYARD",
        "D 14:00:20.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=烧毁测试牌 id=43 zone=DECK cardId=BURNED_CARD player=1] tag=ZONE value=GRAVEYARD"
      ].join("\n"));

      const first = engine.getState().cardTracking!;
      expect(first.friendly.current.deck.totalCount).toBe(1);
      expect(first.friendly.current.hand.totalCount).toBe(10);
      expect(first.friendly.current.graveyard).toMatchObject({
        totalCount: 1,
        cards: [expect.objectContaining({ cardId: "BURNED_CARD", name: "烧毁测试牌", count: 1 })]
      });
      expect(first.friendly.burned).toMatchObject({
        totalCount: 1,
        items: [expect.objectContaining({
          id: expect.stringMatching(/^game-1:burn:\d+$/),
          entityId: "43",
          confidence: "inferred"
        })]
      });
      expect(first.friendly.used.totalCount).toBe(0);

      engine.applyText(`
D 14:01:00.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=烧毁测试牌 id=43 zone=GRAVEYARD cardId=BURNED_CARD player=1] tag=ZONE value=DECK
D 14:01:01.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=烧毁测试牌 id=43 zone=DECK cardId=BURNED_CARD player=1] tag=ZONE value=GRAVEYARD
`);
      const second = engine.getState().cardTracking!;
      expect(second.friendly.burned.totalCount).toBe(2);
      expect(new Set(second.friendly.burned.items.map((item) => item.id)).size).toBe(2);
    });

    it("keeps a hidden burn action and fills its identity without adding another event", () => {
      const engine = createLifecycleEngine("1x 烧毁测试牌");
      engine.applyText([
        "D 15:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
        ...createHandEntityLines(10, 1),
        "D 15:00:20.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=UNKNOWN ENTITY id=44 zone=DECK cardId= player=1] tag=ZONE value=GRAVEYARD"
      ].join("\n"));

      expect(engine.getState().cardTracking!.friendly.burned).toMatchObject({
        totalCount: 1,
        items: [expect.objectContaining({ entityId: "44" })]
      });
      expect(engine.getState().cardTracking!.friendly.burned.items[0]?.card).toBeUndefined();

      engine.applyLine(
        "D 15:00:21.000 GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=[entityName=烧毁测试牌 id=44 zone=GRAVEYARD cardId= player=1] CardID=BURNED_CARD"
      );
      expect(engine.getState().cardTracking!.friendly.burned).toMatchObject({
        totalCount: 1,
        items: [expect.objectContaining({
          entityId: "44",
          card: expect.objectContaining({ cardId: "BURNED_CARD", name: "烧毁测试牌" })
        })]
      });
    });

    it("does not count an attached enchantment as the tenth hand card", () => {
      const engine = createLifecycleEngine("1x 烧毁测试牌");
      engine.applyText([
        "D 16:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
        ...createHandEntityLines(9, 1),
        "D 16:00:10.000 GameState.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=附属测试实体 id=199 zone=HAND cardId=ATTACHMENT player=1] CardID=ATTACHMENT",
        "D 16:00:10.100 GameState.DebugPrintPower() - tag=ATTACHED value=100",
        "D 16:00:20.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=烧毁测试牌 id=45 zone=DECK cardId=BURNED_CARD player=1] tag=ZONE value=GRAVEYARD"
      ].join("\n"));

      const tracking = engine.getState().cardTracking!;
      expect(tracking.friendly.current.hand.totalCount).toBe(9);
      expect(tracking.friendly.burned.totalCount).toBe(0);
      expect(tracking.friendly.current.graveyard.totalCount).toBe(1);
    });

    it("does not infer a burn from a plain nine-card hand", () => {
      const engine = createLifecycleEngine("1x 烧毁测试牌");
      engine.applyText([
        "D 16:30:00.000 GameState.DebugPrintPower() - CREATE_GAME",
        ...createHandEntityLines(9, 1),
        "D 16:30:20.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=烧毁测试牌 id=45 zone=DECK cardId=BURNED_CARD player=1] tag=ZONE value=GRAVEYARD"
      ].join("\n"));

      const tracking = engine.getState().cardTracking!;
      expect(tracking.friendly.current.hand.totalCount).toBe(9);
      expect(tracking.friendly.current.graveyard.totalCount).toBe(1);
      expect(tracking.friendly.burned.totalCount).toBe(0);
    });

    it("deduplicates duplicate CREATE_GAME records", () => {
      const engine = createLifecycleEngine("1x 烧毁测试牌");
      seedResetSensitiveLifecycle(engine);
      const first = engine.getState().cardTracking!;
      expect(first.friendly.used.totalCount).toBe(2);
      expect(first.friendly.burned.totalCount).toBe(1);

      engine.applyLine("D 17:00:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME");
      const duplicateStart = engine.getState().cardTracking!;
      expect(duplicateStart.gameKey).toBe(first.gameKey);
      expect(duplicateStart.friendly.used.totalCount).toBe(2);
      expect(duplicateStart.friendly.burned.totalCount).toBe(1);
      expect(findLegacyAncientOutcomeSections(engine)).toHaveLength(1);
    });

    it("resetForGame clears use, burn, and ancient outcome deduplication before replay", () => {
      const engine = createLifecycleEngine("1x 烧毁测试牌");
      seedResetSensitiveLifecycle(engine);
      const oldGameKey = engine.getState().cardTracking!.gameKey;

      engine.resetForGame();

      expect(engine.getState().cardTracking).toMatchObject({
        friendly: { used: { totalCount: 0 }, burned: { totalCount: 0 } }
      });
      expect(engine.getState().cardTracking!.gameKey).not.toBe(oldGameKey);
      engine.applyLine(
        "D 17:00:30.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=DECK cardId=TOY_372 player=1] tag=ZONE value=HAND"
      );
      expect(findLegacyAncientOutcomeSections(engine)).toBeUndefined();
      engine.applyLine(
        "D 17:00:30.500 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=HAND cardId=TOY_372 player=1] tag=ZONE value=DECK"
      );

      expectResetSensitiveLifecycleCanReplay(engine);
    });

    it("resetAfterGame clears use, burn, and ancient outcome state", () => {
      const engine = createLifecycleEngine("1x 烧毁测试牌");
      seedResetSensitiveLifecycle(engine);

      engine.resetAfterGame();

      expect(engine.getState().cardTracking).toMatchObject({
        gameKey: "no-game",
        friendly: { used: { totalCount: 0 }, burned: { totalCount: 0 } }
      });
      engine.loadDeckCards([{ name: "匣中古神", count: 1, cardId: "TOY_372" }], "重置检查牌库");
      expect(findLegacyAncientOutcomeSections(engine)).toBeUndefined();

      resumeLifecycleRecordingWithoutAnotherReset(engine);
      expectResetSensitiveLifecycleCanReplay(engine);
    });

    it("clearArenaDeck clears use, burn, and ancient outcome state", () => {
      const engine = createLifecycleEngine();
      engine.loadDeckCards([
        { name: "烧毁测试牌", count: 1, cardId: "BURNED_CARD" },
        { name: "匣中古神", count: 1, cardId: "TOY_372" }
      ], "竞技场牌库");
      seedResetSensitiveLifecycle(engine);

      engine.clearArenaDeck();

      expect(engine.getState().cardTracking).toMatchObject({
        gameKey: "no-game",
        friendly: { used: { totalCount: 0 }, burned: { totalCount: 0 } }
      });
      expect(findLegacyAncientOutcomeSections(engine)).toBeUndefined();

      resumeLifecycleRecordingWithoutAnotherReset(engine);
      prepareRetainedArenaEntitiesForReplay(engine);
      expectResetSensitiveLifecycleCanReplay(engine, createRetainedArenaPreBurnLines());
    });
  });
});

function createLifecycleEngine(deckText?: string) {
  const cardDatabase = createCardDatabase([
    { id: 1, cardId: "FRIEND_USE", name: "友方使用牌", type: "SPELL" },
    { id: 2, cardId: "OPP_USE", name: "对手使用牌", type: "MINION" },
    { id: 3, cardId: "LATE_USE", name: "晚揭示使用牌", type: "SPELL" },
    { id: 4, cardId: "AUTO_SPELL", name: "古神子法术", type: "SPELL" },
    { id: 5, cardId: "BURNED_CARD", name: "烧毁测试牌", type: "SPELL" },
    { id: 6, cardId: "ATTACHMENT", name: "附属测试实体", type: "ENCHANTMENT" },
    {
      id: 7,
      cardId: "TOY_372",
      name: "匣中古神",
      type: "SPELL",
      text: "随机施放5个法术。"
    },
    { id: 8, cardId: "RESET_OUTCOME", name: "重置结果法术", type: "SPELL" }
  ]);
  const engine = new TrackerEngine({ cardDatabase, deckText });
  engine.setFriendlyController(1);
  return engine;
}

function createOutcomeBindingEngine() {
  const cardDatabase = createCardDatabase([
    {
      id: 103270,
      cardId: "TOY_372",
      name: "匣中古神",
      collectible: 1,
      type: "SPELL",
      text: "随机施放5个法术。"
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: 9200 + index,
      cardId: `SPELL_${index + 1}`,
      name: `第${index + 1}张法术`,
      collectible: 1,
      type: "SPELL"
    })),
    {
      id: 9300,
      cardId: "NORMAL_SPELL",
      name: "普通法术",
      collectible: 1,
      type: "SPELL"
    }
  ]);
  const engine = new TrackerEngine({ cardDatabase });
  engine.setFriendlyController(1);
  return engine;
}

function renderRandomSpellCapture(input: {
  readonly source: "GameState" | "PowerTaskList";
  readonly time: string;
  readonly sourceEntityId: number;
  readonly resultEntityStart: number;
  readonly resultCardIds: readonly string[];
  readonly controller: number;
}) {
  const prefix = (suffix: string) =>
    `D ${input.time}.${suffix} ${input.source}.DebugPrintPower() -`;
  return [
    `${prefix("000")} BLOCK_START BlockType=PLAY Entity=[entityName=匣中古神 id=${input.sourceEntityId} zone=HAND cardId=TOY_372 player=${input.controller}]`,
    `${prefix("100")}     BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=${input.sourceEntityId} zone=PLAY cardId=TOY_372 player=${input.controller}]`,
    ...input.resultCardIds.map((cardId, index) =>
      `${prefix(`2${String(index).padStart(2, "0")}`)}         FULL_ENTITY - Creating ID=${input.resultEntityStart + index} CardID=${cardId}`
    ),
    `${prefix("800")}     BLOCK_END`,
    `${prefix("900")} BLOCK_END`
  ];
}

function seedResetSensitiveLifecycle(engine: TrackerEngine) {
  engine.applyText([
    "D 17:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
    ...createResetSensitiveLifecycleLines()
  ].join("\n"));
  expect(engine.getState().cardTracking!.friendly).toMatchObject({
    used: { totalCount: 2 },
    burned: { totalCount: 1 }
  });
  expect(findLegacyAncientOutcomeSections(engine)).toHaveLength(1);
}

function expectResetSensitiveLifecycleCanReplay(
  engine: TrackerEngine,
  preBurnLines = createResetSensitivePreBurnLines()
) {
  engine.applyText(preBurnLines.join("\n"));
  expect(engine.getState().cardTracking!.friendly.current.hand.totalCount).toBe(10);

  engine.applyLine(createResetSensitiveBurnLine());
  expect(engine.getState().cardTracking!.friendly.burned.totalCount).toBe(1);

  engine.applyText(createResetSensitiveOutcomeLines().join("\n"));
  expect(engine.getState().cardTracking!.friendly).toMatchObject({
    used: { totalCount: 2 },
    burned: { totalCount: 1 }
  });
  expect(findLegacyAncientOutcomeSections(engine)).toHaveLength(1);
}

function createResetSensitiveLifecycleLines() {
  return [
    ...createResetSensitivePreBurnLines(),
    createResetSensitiveBurnLine(),
    ...createResetSensitiveOutcomeLines()
  ];
}

function createResetSensitivePreBurnLines() {
  return [
    "D 17:00:01.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=友方使用牌 id=51 zone=HAND cardId=FRIEND_USE player=1]",
    "D 17:00:01.100 GameState.DebugPrintPower() - BLOCK_END",
    ...createHandEntityLines(10, 1, 300)
  ];
}

function createRetainedArenaPreBurnLines() {
  return [
    "D 17:00:01.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=友方使用牌 id=51 zone=HAND cardId=FRIEND_USE player=1]",
    "D 17:00:01.100 GameState.DebugPrintPower() - BLOCK_END",
    ...Array.from({ length: 10 }, (_, index) =>
      `D 17:00:39.${String(index).padStart(3, "0")} GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=填充手牌${index + 1} id=${300 + index} zone=REMOVEDFROMGAME cardId=FILLER_${300 + index} player=1] tag=ZONE value=HAND`
    )
  ];
}

function createResetSensitiveBurnLine() {
  return "D 17:00:20.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=烧毁测试牌 id=46 zone=DECK cardId=BURNED_CARD player=1] tag=ZONE value=GRAVEYARD";
}

function createResetSensitiveOutcomeLines() {
  return [
    "D 17:00:30.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=DECK cardId=TOY_372 player=1] tag=ZONE value=HAND",
    "D 17:00:31.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=匣中古神 id=60 zone=HAND cardId=TOY_372 player=1]",
    "D 17:00:32.000 GameState.DebugPrintPower() - BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=60 zone=PLAY cardId=TOY_372 player=1]",
    "D 17:00:33.000 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=71 CardID=RESET_OUTCOME",
    "D 17:00:34.000 GameState.DebugPrintPower() - BLOCK_END",
    "D 17:00:35.000 GameState.DebugPrintPower() - BLOCK_END"
  ];
}

function resumeLifecycleRecordingWithoutAnotherReset(engine: TrackerEngine) {
  Reflect.set(engine, "gameActive", true);
}

function prepareRetainedArenaEntitiesForReplay(engine: TrackerEngine) {
  engine.applyText([
    ...Array.from({ length: 10 }, (_, index) =>
      `D 17:00:36.${String(index).padStart(3, "0")} GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=填充手牌${index + 1} id=${300 + index} zone=HAND cardId=FILLER_${300 + index} player=1] tag=ZONE value=REMOVEDFROMGAME`
    ),
    "D 17:00:37.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=匣中古神 id=60 zone=HAND cardId=TOY_372 player=1] tag=ZONE value=DECK",
    "D 17:00:38.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=烧毁测试牌 id=46 zone=GRAVEYARD cardId=BURNED_CARD player=1] tag=ZONE value=DECK"
  ].join("\n"));
}

function findLegacyAncientOutcomeSections(engine: TrackerEngine) {
  const state = engine.getState();
  return [...state.deck, ...(state.friendlyHand ?? [])]
    .find((card) => card.cardId === "TOY_372")
    ?.details?.cardOutcomeSections;
}

function expectSingleOutsideDatabaseUse(engine: TrackerEngine) {
  expect(engine.getState().cardTracking!.friendly.used).toMatchObject({
    totalCount: 1,
    items: [
      expect.objectContaining({
        entityId: "91",
        card: expect.objectContaining({ cardId: "OUTSIDE_DB", name: "数据库外卡牌" })
      })
    ]
  });
}

function createHandEntityLines(count: number, controller: number, startId = 100) {
  return Array.from({ length: count }, (_, index) =>
    `D 11:00:${String(index + 1).padStart(2, "0")}.000 GameState.DebugPrintPower() - FULL_ENTITY - Updating Entity=[entityName=填充手牌${index + 1} id=${startId + index} zone=HAND cardId=FILLER_${startId + index} player=${controller}] CardID=FILLER_${startId + index}`
  );
}

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
