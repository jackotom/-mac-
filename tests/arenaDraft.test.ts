import { describe, expect, it } from "vitest";
import sampleCardDb from "../fixtures/cards.sample.json";
import type { CardDatabase } from "../src/shared/cardDatabase";
import { ArenaDraftEngine } from "../src/shared/arenaDraftEngine";
import type { ArenaRatingTable } from "../src/shared/arenaRatings";
import { parseArenaLogLine, selectCurrentArenaLogText } from "../src/shared/arenaLogParser";

const cardDb = sampleCardDb as CardDatabase;
const ratings: ArenaRatingTable = {
  source: "test ratings",
  version: 7,
  fetchedAt: "2026-07-10T00:00:00.000Z",
  ratings: {
    Hunter: { TEST_001: 88 },
    Neutral: { TEST_002: 61 }
  },
  firestone: {
    source: "Firestone",
    version: "firestone-v1",
    lastUpdated: "2026-07-10T00:00:00.000Z",
    ratings: {
      TEST_001: {
        includedWinrate: 55.25,
        playedWinrate: 58.5,
        sampleSize: 5000,
        pickRate: 42,
        highWinPickRate: 51,
        highWinThreshold: 6,
        highWinPickRateImpact: 9
      }
    }
  }
};

describe("arena log parsing", () => {
  it("parses draft mode, hero and selected card lines", () => {
    expect(parseArenaLogLine("D 12:00:00.000 Arena.SetDraftMode - DRAFTING")).toEqual([
      expect.objectContaining({ type: "mode", mode: "drafting" })
    ]);
    expect(parseArenaLogLine("D 12:00:01.000 DraftManager.OnChosen(): hero=HERO_05")).toEqual([
      expect.objectContaining({ type: "hero-selected", cardId: "HERO_05" })
    ]);
    expect(parseArenaLogLine("D 12:00:02.000 Client chooses: [TEST_001]")).toEqual([
      expect.objectContaining({ type: "card-picked", cardId: "TEST_001" })
    ]);
  });

  it("recognizes an Arena redraft transition as an active choice state", () => {
    expect(parseArenaLogLine("D 12:00:00.000 Arena.SetDraftMode - REDRAFTING")).toEqual([
      expect.objectContaining({ type: "mode", mode: "redrafting" })
    ]);
  });

  it("keeps restored Arena cards and accepts screen choices during redrafting", () => {
    const engine = new ArenaDraftEngine({ cardDatabase: cardDb, ratings });

    engine.applyArenaText(`
D 12:00:00.000 DraftManager.OnChoicesAndContents - Draft Deck ID: arena, Hero Card = HERO_06
D 12:00:00.000 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_001
D 12:00:00.000 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_002
D 12:00:01.000 Arena.SetDraftMode - REDRAFTING
`);

    expect(engine.getState()).toMatchObject({ status: "redrafting", draftCount: 2 });
    expect(engine.getState().deck.reduce((total, card) => total + card.count, 0)).toBe(30);
    expect(engine.applyScreenChoices(["Sample Singleton", "Sample Pair", "Sample Multi"])).toBe(true);
    expect(engine.getState().currentChoices).toHaveLength(3);
  });

  it("selects only the current draft from a cumulative Arena.log", () => {
    const text = selectCurrentArenaLogText(`
D 11:00:00.000 Arena.SetDraftMode - ACTIVE_DRAFT_DECK
D 11:00:01.000 Client chooses: [TEST_001]
D 12:00:00.000 Arena.SetDraftMode - DRAFTING
D 12:00:01.000 Client chooses: [TEST_002]
`);

    expect(text).not.toContain("TEST_001");
    expect(text).toContain("DRAFTING");
    expect(text).toContain("TEST_002");
  });

  it("keeps the current draft contents written before the mode marker", () => {
    const text = selectCurrentArenaLogText(`
D 11:00:00.000 DraftManager.OnChoicesAndContents - Draft Deck ID: 1, Hero Card = HERO_05
D 11:00:00.000 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_001
D 11:00:00.000 SetDraftMode - DRAFTING
D 12:00:00.000 DraftManager.OnChoicesAndContents - Draft Deck ID: 2, Hero Card = HERO_05
D 12:00:00.000 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_002
D 12:00:00.000 SetDraftMode - DRAFTING
`);

    expect(text).not.toContain("TEST_001");
    expect(text).toContain("Hero Card = HERO_05");
    expect(text).toContain("TEST_002");
  });

  it("keeps restored deck contents when the latest Arena mode is complete", () => {
    const text = selectCurrentArenaLogText(`
D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06
D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_001
D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_002
D 17:39:59.6202750 SetDraftMode - DRAFTING
D 17:40:01.0000000 Client chooses: [TEST_003]
D 17:40:02.0000000 SetDraftMode - ACTIVE_DRAFT_DECK
`);

    expect(text).toContain("Hero Card = HERO_06");
    expect(text).toContain("TEST_001");
    expect(text).toContain("TEST_002");
    expect(text).toContain("TEST_003");
    expect(text).toContain("ACTIVE_DRAFT_DECK");
  });
});

describe("ArenaDraftEngine", () => {
  it("scores the live choices and builds the arena deck from selected cards", () => {
    const engine = new ArenaDraftEngine({ cardDatabase: cardDb, ratings, preferArenaLogPicks: true });

    engine.applyArenaText(`
D 12:00:00.000 Arena.SetDraftMode - DRAFTING
D 12:00:01.000 DraftManager.OnChosen(): hero=HERO_05
`);
    engine.applyPowerText(`
D 12:00:02.000 GameState.DebugPrintEntityChoices() - id=1 Player=Local TaskList=4 ChoiceType=GENERAL CountMin=1 CountMax=1
D 12:00:02.000 GameState.DebugPrintEntityChoices() -   Entities[0]=[entityName=Sample Singleton id=101 zone=SETASIDE zonePos=0 cardId=TEST_001 player=1]
D 12:00:02.000 GameState.DebugPrintEntityChoices() -   Entities[1]=[entityName=Sample Pair id=102 zone=SETASIDE zonePos=0 cardId=TEST_002 player=1]
D 12:00:02.000 GameState.DebugPrintEntityChoices() -   Entities[2]=[entityName=Sample Multi id=103 zone=SETASIDE zonePos=0 cardId=TEST_003 player=1]
D 12:00:02.000 ChoiceCardMgr.WaitThenShowChoices() - id=1 BEGIN
`);

    expect(engine.getState().currentChoices).toEqual([
      expect.objectContaining({
        cardId: "TEST_001",
        score: 88,
        quality: { tier: "c", label: "一般" },
        rating: {
          hearthArena: 88,
          pickRate: 42,
          highWinPickRate: 51,
          highWinThreshold: 6,
          highWinPickRateImpact: 9,
          firestone: {
            includedWinrate: 55.25,
            playedWinrate: 58.5,
            sampleSize: 5000,
            pickRate: 42,
            highWinPickRate: 51,
            highWinThreshold: 6,
            highWinPickRateImpact: 9
          }
        },
        name: "Sample Singleton"
      }),
      expect.objectContaining({ cardId: "TEST_002", score: 61, quality: { tier: "d", label: "偏弱" }, name: "Sample Pair" }),
      expect.objectContaining({ cardId: "TEST_003", quality: { tier: "unknown", label: "暂无评分" }, name: "Sample Multi" })
    ]);

    engine.applyArenaLine("D 12:00:03.000 Client chooses: [TEST_001]");
    engine.applyArenaLine("D 12:00:04.000 Client chooses: [TEST_002]");

    const state = engine.getState();
    expect(state.status).toBe("drafting");
    expect(state.draftCount).toBe(2);
    expect(state.deck).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: "TEST_001", name: "Sample Singleton", count: 1 }),
      expect.objectContaining({ cardId: "TEST_002", name: "Sample Pair", count: 1 })
    ]));
    expect(state.picks[0]).toMatchObject({ slot: 1, chosen: { score: 88 } });
  });

  it("restores draft contents that Hearthstone writes before the drafting mode marker", () => {
    const engine = new ArenaDraftEngine({ cardDatabase: cardDb, ratings, preferArenaLogPicks: true });

    engine.applyArenaText(`
D 15:58:16.7116490 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_05
D 15:58:16.7116490 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_001
D 15:58:16.7116490 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_002
D 15:58:16.7116490 SetDraftMode - DRAFTING
D 16:51:38.4065880 Client chooses: [TEST_003]
`);

    const state = engine.getState();
    expect(state.status).toBe("drafting");
    expect(state.draftCount).toBe(3);
    expect(state.deck).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: "TEST_001", name: "Sample Singleton", count: 1 }),
      expect.objectContaining({ cardId: "TEST_002", name: "Sample Pair", count: 1 }),
      expect.objectContaining({ cardId: "TEST_003", name: "Sample Multi", count: 1 })
    ]));
  });

  it("restores completed Arena contents without a drafting marker", () => {
    const engine = new ArenaDraftEngine({ cardDatabase: cardDb, ratings, preferArenaLogPicks: true });

    engine.applyArenaText(`
D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06
D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_001
D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_002
D 17:39:59.6202750 SetDraftMode - ACTIVE_DRAFT_DECK
`);

    const state = engine.getState();
    expect(state.status).toBe("complete");
    expect(state.hero).toEqual(expect.objectContaining({ cardId: "HERO_06", className: "Druid" }));
    expect(state.draftCount).toBe(30);
    expect(state.deck).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: "TEST_001", name: "Sample Singleton", count: 1 }),
      expect.objectContaining({ cardId: "TEST_002", name: "Sample Pair", count: 1 }),
      expect.objectContaining({ name: "日志缺失的竞技场牌", count: 28 })
    ]));
  });

  it("accepts Power.log choices as the fallback when Arena.log picks are unavailable", () => {
    const engine = new ArenaDraftEngine({ cardDatabase: cardDb, ratings });
    engine.applyArenaLine("D 12:00:00.000 Arena.SetDraftMode - DRAFTING");
    engine.applyPowerText(`
D 12:00:01.000 GameState.DebugPrintEntityChoices() - id=2 Player=Local TaskList=5 ChoiceType=GENERAL CountMin=1 CountMax=1
D 12:00:01.000 GameState.DebugPrintEntityChoices() -   Entities[0]=[entityName=Sample Pair id=201 zone=SETASIDE zonePos=0 cardId=TEST_002 player=1]
D 12:00:01.000 GameState.DebugPrintEntityChoices() -   Entities[1]=[entityName=Sample Multi id=202 zone=SETASIDE zonePos=0 cardId=TEST_003 player=1]
D 12:00:01.000 ChoiceCardMgr.WaitThenShowChoices() - id=2 BEGIN
D 12:00:02.000 GameState.SendChoices() - id=2 ChoiceType=GENERAL
D 12:00:02.000 GameState.SendChoices() -   m_chosenEntities[0]=[entityName=Sample Pair id=201 zone=SETASIDE zonePos=0 cardId=TEST_002 player=1]
`);

    expect(engine.getState().deck).toEqual([
      expect.objectContaining({ cardId: "TEST_002", name: "Sample Pair", count: 1 })
    ]);
  });

  it("scores exactly three recognized arena cards from the current game window", () => {
    const engine = new ArenaDraftEngine({ cardDatabase: cardDb, ratings });
    engine.applyArenaText(`
D 12:00:00.000 Arena.SetDraftMode - DRAFTING
D 12:00:00.001 DraftManager.OnChosen(): hero=HERO_05
`);

    expect(engine.applyScreenChoices(["Sample Multi", "Sample Singleton", "Sample Pair"])).toBe(true);
    expect(engine.getState().currentChoices).toEqual([
      expect.objectContaining({ cardId: "TEST_003", name: "Sample Multi" }),
      expect.objectContaining({ cardId: "TEST_001", name: "Sample Singleton", score: 88 }),
      expect.objectContaining({ cardId: "TEST_002", name: "Sample Pair", score: 61 })
    ]);
    expect(engine.applyScreenChoices(["Sample Pair", "Sample Pair", "Sample Multi"])).toBe(false);
  });

  it("accepts one-character OCR mistakes when the card name match is unambiguous", () => {
    const engine = new ArenaDraftEngine({ cardDatabase: cardDb, ratings });
    engine.applyArenaText(`
D 12:00:00.000 Arena.SetDraftMode - DRAFTING
D 12:00:00.001 DraftManager.OnChosen(): hero=HERO_05
`);

    expect(engine.applyScreenChoices(["Sample Multi", "Sample Singletom", "Sample Pair"])).toBe(true);
    expect(engine.getState().currentChoices).toEqual([
      expect.objectContaining({ cardId: "TEST_003", name: "Sample Multi" }),
      expect.objectContaining({ cardId: "TEST_001", name: "Sample Singleton" }),
      expect.objectContaining({ cardId: "TEST_002", name: "Sample Pair" })
    ]);
  });

  it("ignores orphan Arena picks and non-local or non-draft Power choices", () => {
    const engine = new ArenaDraftEngine({ cardDatabase: cardDb, ratings });

    engine.applyArenaLine("D 12:00:00.000 Client chooses: [TEST_001]");
    expect(engine.getState().draftCount).toBe(0);

    engine.applyArenaLine("D 12:00:01.000 Arena.SetDraftMode - DRAFTING");
    engine.applyPowerText(`
D 12:00:02.000 GameState.DebugPrintEntityChoices() - id=3 Player=Opponent TaskList=4 ChoiceType=GENERAL CountMin=1 CountMax=1
D 12:00:02.000 GameState.DebugPrintEntityChoices() -   Entities[0]=[entityName=Sample Singleton id=301 zone=SETASIDE zonePos=0 cardId=TEST_001 player=2]
D 12:00:02.000 ChoiceCardMgr.WaitThenShowChoices() - id=3 BEGIN
D 12:00:03.000 GameState.DebugPrintEntityChoices() - id=4 Player=Local TaskList=4 ChoiceType=DISCOVER CountMin=1 CountMax=1
D 12:00:03.000 GameState.DebugPrintEntityChoices() -   Entities[0]=[entityName=Sample Pair id=401 zone=SETASIDE zonePos=0 cardId=TEST_002 player=1]
D 12:00:03.000 ChoiceCardMgr.WaitThenShowChoices() - id=4 BEGIN
`);

    expect(engine.getState().currentChoices).toEqual([]);
    expect(engine.getState().draftCount).toBe(0);
  });
});
