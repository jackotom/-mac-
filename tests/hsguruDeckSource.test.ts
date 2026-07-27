import { describe, expect, it } from "vitest";
import { parseHsguruDecks } from "../src/main/hsguruDeckSource.js";

const deckCode = "AAECAQcC69YHstgHDuPmBqr8Bqv8BqWFB+iHB9KXB7etB+yyB4S9B7XAB5XCB5vCB5zCB/nDBwAA";

const html = `
  <a href="/decks?format=2&amp;period=patch_36.0.3&amp;rank=diamond_to_legend">36.0.3</a>
  <div id="deck_stats-40721799" class="column is-narrow">
    <div class="decklist-info warrior">
      <a class="basic-black-text" href="https://www.hsguru.com/deck/40721799">Dragon Warrior</a>
      <span style="display: block">${deckCode}</span>
    </div>
    <div class="card-name"><span># 2x (1) </span>Carrier Whelp</div>
    <div class="card-name"><span># 1x (8) </span>Chainbreaker Hogger</div>
    <span class="tag column"><span><span>60.0</span></span></span>
    <div class="column tag">Games: 3245</div>
  </div>
`;

describe("HSGuru deck source", () => {
  it("parses a current international deck with its public stats and code", () => {
    expect(parseHsguruDecks(html, {
      mode: "standard",
      expectedPatch: "36.0",
      updatedAt: "2026-07-22T08:00:00.000Z",
      sourceUrl: "https://www.hsguru.com/decks?format=2"
    })).toEqual([{
      id: "hsguru-40721799",
      mode: "standard",
      region: "GLOBAL",
      patch: "36.0",
      name: "Dragon Warrior",
      className: "战士",
      winRate: 60,
      games: 3245,
      deckCode,
      cards: [
        { name: "Carrier Whelp", count: 2, cost: 1 },
        { name: "Chainbreaker Hogger", count: 1, cost: 8 }
      ],
      source: { name: "国际服 HSGuru（钻石-传说）", url: "https://www.hsguru.com/decks?format=2" },
      updatedAt: "2026-07-22T08:00:00.000Z"
    }]);
  });

  it("rejects a page that does not match the locally installed patch", () => {
    expect(() => parseHsguruDecks(html, {
      mode: "standard",
      expectedPatch: "35.6",
      updatedAt: "2026-07-22T08:00:00.000Z",
      sourceUrl: "https://www.hsguru.com/decks?format=2"
    })).toThrow(/版本/);
  });
});
