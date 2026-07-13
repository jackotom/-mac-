import { describe, expect, it } from "vitest";

import { findActiveCollectionDeck, parseCollectionDecksLog } from "../src/shared/collectionDeckParser.js";

describe("parseCollectionDecksLog", () => {
  it("extracts collection decks from Decks.log style text", () => {
    const decks = parseCollectionDecksLog(
      `
D 12:00:00.000 Decks - Name: Tempo Mage
D 12:00:00.001 Decks - Class: Mage
D 12:00:00.002 Decks - Format: Standard
D 12:00:00.003 Decks - Mode: Ranked
D 12:00:00.004 Decks - 2x (4) Fireball
D 12:00:00.005 Decks - 1x (2) Frostbolt
D 12:00:00.006 Decks - DeckCode: AAECAf0EAabcdefghijklmno1234567890==

### Control Warrior
# Class: Warrior
# Format: Wild
# 1x Shield Block
`,
      { sourcePath: "/tmp/Decks.log", updatedAt: "2026-07-10T00:00:00.000Z" }
    );

    expect(decks).toHaveLength(2);
    expect(decks[0]).toEqual(
      expect.objectContaining({
        name: "Tempo Mage",
        heroClass: "Mage",
        format: "Standard",
        mode: "Ranked",
        rawDeckString: "AAECAf0EAabcdefghijklmno1234567890==",
        sourcePath: "/tmp/Decks.log",
        updatedAt: "2026-07-10T00:00:00.000Z"
      })
    );
    expect(decks[0]?.cards).toEqual([
      expect.objectContaining({ name: "Fireball", count: 2 }),
      expect.objectContaining({ name: "Frostbolt", count: 1 })
    ]);
    expect(decks[0]?.warnings).toEqual([]);
    expect(decks[1]).toEqual(
      expect.objectContaining({
        name: "Control Warrior",
        heroClass: "Warrior",
        format: "Wild"
      })
    );
  });

  it("extracts deck names and deck strings from current macOS Decks.log lines", () => {
    const decks = parseCollectionDecksLog(
      `
I 20:56:52.9687400 Deck Contents Received:
I 20:56:52.9687400 ### 任务无限龙
I 20:56:52.9687400 # Deck ID: 9222863564
I 20:56:52.9687400 AAEBAQcMogTRngbHpAaOvwa6wQb6yQaq6gbUlwfblweCmAeEnQfKqwcJS47UBIegBvPKBrDiBraUB+qnB/yvB4+xBwABA/WzBsekBvezBsekBu7eBsekBgAA
I 20:56:52.9687400 ### 偷取牌库
I 20:56:52.9687400 # Deck ID: 9455227336
I 20:56:52.9687400 AAEBAa0GAvCfBOfYBwmg+wbD/waFhgedrQevyQeq2Qes2Qev2Qew3wcAAA==
I 20:56:52.9687400 ### 10-3 海啸飞机法
I 20:56:52.9687400 # Deck ID: 9310101010
I 20:56:52.9687400 AAEBAf0GDuqzBqn1BvWYB4ilB4mlB4qlB5GlB5OlB5SlB5WlB5alB5elB5qlB6mtBw2PnwTnoASJtQacwQaTywbK5AaA+AaD+AbZggepiAeGnQeqrQeBrgcAAA==
I 20:56:52.9687400 ### 自定义 牧师
I 20:56:52.9687400 # Deck ID: 9455227846
I 20:56:52.9687400 AAEBAa0GAvCfBPO4Bg7LCNMK1wqFnwS+nwS7xwXCtgaQ9Aag+waFhgeslAedrQesrQfksgcAAA==
I 20:57:48.8376790 Finished Editing Deck:
I 20:57:48.8376790 ### 自定义 牧师
I 20:57:48.8376790 # Deck ID: 9455227846
I 20:57:48.8376790 AAEBAa0GAvCfBPO4Bg7LCNMK1wqFnwS+nwS7xwXCtgaQ9Aag+waFhgeslAedrQesrQfksgcAAA==
`,
      { sourcePath: "/Applications/Hearthstone/Logs/session/Decks.log", updatedAt: "2026-07-10T12:57:00.000Z" }
    );

    expect(decks).toHaveLength(4);
    expect(decks[0]).toEqual(
      expect.objectContaining({
        deckId: "9222863564",
        name: "任务无限龙",
        rawDeckString:
          "AAEBAQcMogTRngbHpAaOvwa6wQb6yQaq6gbUlwfblweCmAeEnQfKqwcJS47UBIegBvPKBrDiBraUB+qnB/yvB4+xBwABA/WzBsekBvezBsekBu7eBsekBgAA",
        warnings: []
      })
    );
    expect(decks.map((deck) => deck.name)).toEqual(["任务无限龙", "偷取牌库", "10-3 海啸飞机法", "自定义 牧师"]);
    expect(decks[3]?.rawDeckString).toBe(
      "AAEBAa0GAvCfBPO4Bg7LCNMK1wqFnwS+nwS7xwXCtgaQ9Aag+waFhgeslAedrQesrQfksgcAAA=="
    );
    expect(decks[3]?.cards).toEqual([]);
  });

  it("finds the deck that Hearthstone selected for the current game", () => {
    const activeDeck = findActiveCollectionDeck(
      `
I 20:56:52.9687400 Deck Contents Received:
I 20:56:52.9687400 ### 任务无限龙
I 20:56:52.9687400 # Deck ID: 9222863564
I 20:56:52.9687400 AAEBAQcMogTRngbHpAaOvwa6wQb6yQaq6gbUlwfblweCmAeEnQfKqwcJS47UBIegBvPKBrDiBraUB+qnB/yvB4+xBwABA/WzBsekBvezBsekBu7eBsekBgAA
I 20:57:48.8376790 Finding Game With Deck:
I 20:57:48.8376790 ### 自定义 牧师
I 20:57:48.8376790 # Deck ID: 9455227846
I 20:57:48.8376790 AAEBAa0GAvCfBPO4Bg7LCNMK1wqFnwS+nwS7xwXCtgaQ9Aag+waFhgeslAedrQesrQfksgcAAA==
`,
      { sourcePath: "/Applications/Hearthstone/Logs/session/Decks.log", updatedAt: "2026-07-11T00:26:22.000Z" }
    );

    expect(activeDeck).toEqual(
      expect.objectContaining({
        deckId: "9455227846",
        name: "自定义 牧师",
        rawDeckString: "AAEBAa0GAvCfBPO4Bg7LCNMK1wqFnwS+nwS7xwXCtgaQ9Aag+waFhgeslAedrQesrQfksgcAAA=="
      })
    );
  });

  it("preserves unknown blocks with a warning", () => {
    const decks = parseCollectionDecksLog("unexpected format line\nstill useful raw text", {
      sourcePath: "/tmp/Decks.log",
      updatedAt: "2026-07-10T00:00:00.000Z"
    });

    expect(decks).toHaveLength(1);
    expect(decks[0]?.rawText).toContain("unexpected format line");
    expect(decks[0]?.warnings).toContain("Unrecognized Decks.log block; preserved raw text.");
  });
});
