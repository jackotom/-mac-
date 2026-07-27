import { describe, expect, it } from "vitest";
import { getArenaCardRating } from "../src/shared/arenaRatings";
import type { ArenaRatingTable } from "../src/shared/arenaRatings";

function table(includeExact = false): ArenaRatingTable {
  return {
    source: "test",
    version: 1,
    fetchedAt: "2026-07-22T08:00:00.000Z",
    ratings: {
      Priest: {
        EX1_193: 90,
        ...(includeExact ? { CORE_EX1_193: 99 } : {})
      }
    },
    firestone: {
      source: "Firestone",
      version: "test",
      lastUpdated: "2026-07-22T08:00:00.000Z",
      ratings: {
        EX1_193: { includedWinrate: 58.1, pickRate: 77.2 },
        ...(includeExact ? { CORE_EX1_193: { includedWinrate: 61.5, pickRate: 80.4 } } : {})
      }
    },
    firestoneClasses: {
      priest: {
        source: "Firestone",
        playerClass: "priest",
        version: "test",
        lastUpdated: "2026-07-22T08:00:00.000Z",
        overallWinrate: 50,
        ratings: {
          EX1_193: { includedWinrate: 58.1, sampleSize: 1000, deckImpact: 8.1 },
          ...(includeExact ? { CORE_EX1_193: { includedWinrate: 61.5, sampleSize: 800, deckImpact: 11.5 } } : {})
        }
      }
    }
  };
}

describe("Arena rating card ID aliases", () => {
  it("fills a CORE card from the matching base-card ratings", () => {
    expect(getArenaCardRating(table(), "CORE_EX1_193", "Priest")).toMatchObject({
      hearthArena: 90,
      pickRate: 77.2,
      deckImpact: 8.1,
      firestone: { includedWinrate: 58.1 }
    });
  });

  it("keeps an exact CORE rating authoritative when both IDs exist", () => {
    expect(getArenaCardRating(table(true), "CORE_EX1_193", "Priest")).toMatchObject({
      hearthArena: 99,
      pickRate: 80.4,
      deckImpact: 11.5,
      firestone: { includedWinrate: 61.5 }
    });
  });
});
