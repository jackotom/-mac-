import { describe, expect, it } from "vitest";

import { parseDeckImport } from "../src/shared/deckImport.js";

describe("parseDeckImport", () => {
  it("keeps a Hearthstone deck string and parses manual deck list cards", () => {
    const deck = parseDeckImport(`
### Tempo Mage
# Class: Mage
# Format: Standard
#
# 2x (4) Fireball
# 1x (2) Frostbolt
#
AAECAf0EAabcdefghijklmno1234567890==
`);

    expect(deck.name).toBe("Tempo Mage");
    expect(deck.heroClass).toBe("Mage");
    expect(deck.format).toBe("Standard");
    expect(deck.rawDeckString).toBe("AAECAf0EAabcdefghijklmno1234567890==");
    expect(deck.cards).toEqual([
      expect.objectContaining({ name: "Fireball", count: 2 }),
      expect.objectContaining({ name: "Frostbolt", count: 1 })
    ]);
    expect(deck.warnings).toEqual([]);
  });

  it("supports plain manual card name lists", () => {
    const deck = parseDeckImport(`
2x Arcane Intellect
Fireball
1 Frostbolt
`);

    expect(deck.cards).toEqual([
      expect.objectContaining({ name: "Arcane Intellect", count: 2 }),
      expect.objectContaining({ name: "Fireball", count: 1 }),
      expect.objectContaining({ name: "Frostbolt", count: 1 })
    ]);
  });
});
