import { describe, expect, it } from "vitest";
import { parseLadderDeckRecommendations, selectTopLadderDeck } from "../src/shared/ladderDeckRecommendation.js";

const valid = {
  id: "deck-1", mode: "standard", region: "CN", patch: "36.0", name: "测试卡组", className: "Mage",
  winRate: 55.4, games: 1200, deckCode: "AAECAQcCi6AE0LIHDuPmBqr8Bqv8BuiHB9KXB7etB4+xB+yyB4S9B7XAB5XCB5vCB5zCB/nDBwAA", cards: [{ name: "测试牌", count: 2 }],
  source: { name: "公开统计", url: "https://example.com/stats" }, updatedAt: "2026-07-12T00:00:00.000Z"
};

describe("ladder deck recommendation parsing", () => {
  const feed = (decks: unknown[], overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 1, region: "CN", patch: "36.0", generatedAt: "2026-07-12T00:00:00.000Z",
    source: { name: "公开统计", url: "https://example.com/stats" }, decks, ...overrides
  });

  it.each(["mode", "winRate", "games", "deckCode"])("rejects data missing %s", (field) => {
    const input = { ...valid } as Record<string, unknown>;
    delete input[field];
    expect(() => parseLadderDeckRecommendations(feed([input]))).toThrow();
  });

  it("rejects records that do not explicitly identify Chinese-server data", () => {
    expect(() => parseLadderDeckRecommendations(feed([valid], { region: "global" }))).toThrow(/国服/);
  });

  it("filters by mode and minimum games, then breaks win-rate ties by games", () => {
    const items = parseLadderDeckRecommendations(feed([
      valid,
      { ...valid, id: "small", winRate: 99, games: 4 },
      { ...valid, id: "more", winRate: 55.4, games: 1800 },
      { ...valid, id: "wild", mode: "wild", winRate: 70, games: 3000 }
    ]));
    expect(selectTopLadderDeck(items, "standard", 100)?.id).toBe("more");
  });

  it("requires the versioned top-level feed contract", () => {
    expect(() => parseLadderDeckRecommendations([valid])).toThrow(/schemaVersion/);
  });

  it("rejects a feed generated in the future", () => {
    expect(() => parseLadderDeckRecommendations(feed([valid], { generatedAt: "2099-01-01T00:00:00.000Z" }), { now: () => Date.parse("2026-07-12T12:00:00Z") })).toThrow(/未来/);
  });

  it("rejects a feed older than 48 hours", () => {
    expect(() => parseLadderDeckRecommendations(
      feed([valid], { generatedAt: "2026-07-09T11:59:59.000Z" }),
      { now: () => Date.parse("2026-07-11T12:00:00.000Z") }
    )).toThrow(/过期/);
  });

  it("isolates malformed records while retaining valid decks", () => {
    const result = parseLadderDeckRecommendations(feed([valid, { ...valid, id: "bad", deckCode: "not-a-deck" }]));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("deck-1");
  });

  it("rejects deck codes that look like base64 but cannot be decoded", () => {
    expect(() => parseLadderDeckRecommendations(feed([{ ...valid, deckCode: "AAECAf0EAQAAAQ==" }]))).toThrow(/卡组代码/);
  });
});
