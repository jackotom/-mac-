import { describe, expect, it } from "vitest";
import { createCardDatabase } from "../src/shared/cardDatabase";
import { TrackerEngine } from "../src/shared/trackerEngine";

describe("compact card tracking payload", () => {
  it("stores one base detail entry and keeps 30 uses scoped below 500 KB", () => {
    const poolCards = Array.from({ length: 100 }, (_, index) => ({
      id: 10_000 + index,
      cardId: `POOL_${String(index).padStart(3, "0")}`,
      name: `候选法术${index}`,
      collectible: 1,
      type: "SPELL",
      manaCost: index % 10
    }));
    const cardDatabase = createCardDatabase([
      {
        id: 103_270,
        cardId: "TOY_372",
        name: "匣中古神",
        collectible: 1,
        type: "SPELL",
        text: "随机施放10个法术。"
      },
      ...poolCards
    ]);
    const engine = new TrackerEngine({ cardDatabase, deckText: "1x 匣中古神" });
    engine.setFriendlyController(1);
    engine.applyText([
      "D 20:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
      ...Array.from({ length: 30 }, (_, useIndex) =>
        renderOutcomeCapture(useIndex, poolCards.slice(0, 10).map((card) => card.cardId))
      ).flat()
    ].join("\n"));

    const state = engine.getState();
    const tracking = state.cardTracking!;
    const yoggKey = "id:toy_372";
    const yoggDetails = tracking.detailsByCardKey[yoggKey];

    expect(Object.keys(tracking.detailsByCardKey)).toEqual([yoggKey]);
    expect(yoggDetails?.cardPoolSections?.[0]?.cards).toHaveLength(100);
    expect(yoggDetails).not.toHaveProperty("cardOutcomeSections");
    expect(tracking.friendly.used).toMatchObject({
      totalCount: 30,
      truncated: false
    });
    expect(tracking.friendly.used.items).toHaveLength(30);
    expect(tracking.friendly.used.items.every((item) =>
      item.outcomeSections?.length === 1 &&
      item.outcomeSections[0]?.cards.length === 10
    )).toBe(true);
    expect(tracking.friendly.used.items.every((item) =>
      item.card && !("details" in item.card)
    )).toBe(true);

    const serialized = JSON.stringify(state);
    expect(serialized.match(/POOL_099/g)).toHaveLength(1);
    expect(serialized.length).toBeLessThan(500_000);
  });

  it("keeps base details neutral and publishes truthful friendly spell history separately", () => {
    const cardDatabase = createCardDatabase([
      {
        id: 110_001,
        cardId: "EXPENSIVE_SPELL",
        name: "高费法术",
        collectible: 1,
        type: "SPELL",
        cost: 5
      },
      {
        id: 110_003,
        cardId: "CHEAP_SPELL",
        name: "低费法术",
        collectible: 1,
        type: "SPELL",
        cost: 2
      },
      {
        id: 110_002,
        cardId: "TOY_378",
        name: "星空投影球",
        collectible: 1,
        type: "SPELL"
      }
    ]);
    const engine = new TrackerEngine({ cardDatabase });
    engine.setFriendlyController(1);
    engine.applyText([
      "D 21:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
      "D 21:00:01.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=高费法术 id=401 zone=HAND cardId=EXPENSIVE_SPELL player=1]",
      "D 21:00:01.100 GameState.DebugPrintPower() - BLOCK_END",
      "D 21:00:02.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=低费法术 id=404 zone=HAND cardId=CHEAP_SPELL player=1]",
      "D 21:00:02.100 GameState.DebugPrintPower() - BLOCK_END",
      "D 21:00:02.200 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=低费法术 id=404 zone=PLAY cardId=CHEAP_SPELL player=1] tag=ZONE value=HAND",
      "D 21:00:02.300 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=低费法术 id=404 zone=HAND cardId=CHEAP_SPELL player=1]",
      "D 21:00:02.400 GameState.DebugPrintPower() - BLOCK_END",
      "D 21:00:02.500 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=星空投影球 id=402 zone=DECK cardId=TOY_378 player=1] tag=ZONE value=HAND",
      "D 21:00:02.600 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=本地玩家 id=1 zone=PLAY cardId= player=1] tag=NUM_SPELLS_PLAYED_THIS_GAME value=7",
      "D 21:00:03.000 GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY Entity=[entityName=星空投影球 id=403 zone=HAND cardId=TOY_378 player=2]",
      "D 21:00:03.050 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=对手 id=2 zone=PLAY cardId= player=2] tag=NUM_SPELLS_PLAYED_THIS_GAME value=4",
      "D 21:00:03.100 GameState.DebugPrintPower() - BLOCK_END"
    ].join("\n"));

    const tracking = engine.getState().cardTracking!;
    const sharedKey = "id:toy_378";
    expect(tracking.friendly.current.hand.cards.some((card) => card.cardKey === sharedKey)).toBe(true);
    expect(tracking.opponent.used.items.some((item) => item.card?.cardKey === sharedKey)).toBe(true);
    expect(Object.keys(tracking.detailsByCardKey).filter((key) => key === sharedKey)).toHaveLength(1);
    expect(tracking.detailsByCardKey[sharedKey]).not.toHaveProperty("playedSpellsThisGame");
    expect(tracking.detailsByCardKey[sharedKey]).not.toHaveProperty("gameContextSections");
    expect(tracking.detailsByCardKey[sharedKey]).not.toHaveProperty("cardOutcomeSections");
    expect(tracking.contextDetailsBySideAndCardKey.friendly[sharedKey]).toEqual({
      playedSpellsThisGame: [
        expect.objectContaining({ cardId: "CHEAP_SPELL", name: "低费法术", manaCost: 2 }),
        expect.objectContaining({ cardId: "CHEAP_SPELL", name: "低费法术", manaCost: 2 }),
        expect.objectContaining({ cardId: "EXPENSIVE_SPELL", name: "高费法术", manaCost: 5 })
      ],
      playedSpellsThisGameCount: 7,
      playedSpellsThisGameIncomplete: true
    });
    expect(tracking.contextDetailsBySideAndCardKey.opponent[sharedKey]).toEqual({
      playedSpellsThisGame: [
        expect.objectContaining({ cardId: "TOY_378", name: "星空投影球" })
      ],
      playedSpellsThisGameCount: 4,
      playedSpellsThisGameIncomplete: true
    });
  });
});

function renderOutcomeCapture(useIndex: number, resultCardIds: readonly string[]) {
  const minute = String(useIndex + 1).padStart(2, "0");
  const sourceEntityId = 1_000 + useIndex;
  const resultEntityStart = 10_000 + useIndex * resultCardIds.length;
  const prefix = (suffix: string) =>
    `D 20:${minute}:00.${suffix} GameState.DebugPrintPower() -`;
  return [
    `${prefix("000")} BLOCK_START BlockType=PLAY Entity=[entityName=匣中古神 id=${sourceEntityId} zone=HAND cardId=TOY_372 player=1]`,
    `${prefix("100")}     BLOCK_START BlockType=POWER Entity=[entityName=匣中古神 id=${sourceEntityId} zone=PLAY cardId=TOY_372 player=1]`,
    ...resultCardIds.map((cardId, index) =>
      `${prefix(`2${String(index).padStart(2, "0")}`)}         FULL_ENTITY - Creating ID=${resultEntityStart + index} CardID=${cardId}`
    ),
    `${prefix("800")}     BLOCK_END`,
    `${prefix("900")} BLOCK_END`
  ];
}
