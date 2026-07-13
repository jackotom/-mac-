import { describe, expect, it } from "vitest";

import sampleCardDb from "../fixtures/cards.sample.json";
import { decodeDeckString, parseDeckStringToCards } from "../src/shared/deckstring.js";
import type { CardDatabase } from "../src/shared/cardDatabase.js";

const cardDb = sampleCardDb as CardDatabase;

describe("deck string decoding", () => {
  it("decodes format, heroes, and one-copy, two-copy, and multi-copy cards", () => {
    const deckCode = encodeDeckString([
      0,
      1,
      2,
      1,
      7,
      1,
      1001,
      1,
      1002,
      1,
      1003,
      4
    ]);

    const decoded = decodeDeckString(deckCode);
    expect(decoded.warnings).toEqual([]);
    expect(decoded.format).toBe(2);
    expect(decoded.heroes).toEqual([7]);
    expect(decoded.cards).toEqual([
      { dbfId: 1001, count: 1 },
      { dbfId: 1002, count: 2 },
      { dbfId: 1003, count: 4 }
    ]);

    const parsed = parseDeckStringToCards(deckCode, cardDb);
    expect(parsed).toEqual({
      format: 2,
      heroes: [7],
      cards: [
        { name: "Sample Singleton", count: 1, cardId: "TEST_001", rawLine: "dbfId:1001" },
        { name: "Sample Pair", count: 2, cardId: "TEST_002", rawLine: "dbfId:1002" },
        { name: "Sample Multi", count: 4, cardId: "TEST_003", rawLine: "dbfId:1003" }
      ],
      warnings: []
    });
  });

  it("keeps parsing offline when a dbfId is not present in the supplied card database", () => {
    const deckCode = encodeDeckString([0, 1, 2, 1, 7, 1, 9999, 0, 0]);

    const parsed = parseDeckStringToCards(deckCode, cardDb);
    expect(parsed.cards).toEqual([{ name: "Unknown card 9999", count: 1, rawLine: "dbfId:9999" }]);
    expect(parsed.warnings).toContain("Missing card info for dbfId 9999.");
  });
});

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
