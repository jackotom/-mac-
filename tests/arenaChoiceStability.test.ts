import { describe, expect, it } from "vitest";
import { preserveArenaChoiceStatistics } from "../src/renderer/arenaChoiceStability";
import type { ArenaCardChoice, PublicTrackerState } from "../src/shared/types";
import { createPublicTrackerState } from "./fixtures/publicTrackerState";

function trackerState(
  heroClass: string,
  currentChoices: readonly ArenaCardChoice[]
): PublicTrackerState {
  return createPublicTrackerState({
    status: "watching",
    deck: [],
    events: [],
    summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
    arena: {
      status: "drafting",
      hero: { name: heroClass, className: heroClass },
      draftCount: 0,
      unresolvedCount: 30,
      currentChoices,
      picks: [],
      deck: []
    }
  });
}

const ratedChoice: ArenaCardChoice = {
  name: "候选一",
  cardId: "TEST_001",
  count: 1,
  score: 88,
  scoreSource: "cached",
  quality: { tier: "b", label: "良好" },
  rating: {
    hearthArena: 88,
    pickRate: 41.2,
    firestone: { includedWinrate: 56.8, playedWinrate: 58.1, sampleSize: 3000 }
  }
};

describe("preserveArenaChoiceStatistics", () => {
  it("fills only missing statistics for the same class and card ID", () => {
    const result = preserveArenaChoiceStatistics(
      trackerState("Mage", [ratedChoice]),
      trackerState("Mage", [{
        name: "候选一",
        cardId: "test_001",
        count: 1,
        rating: { pickRate: 43, firestone: { includedWinrate: 57.4 } }
      }])
    );

    expect(result.arena?.currentChoices[0]).toMatchObject({
      score: 88,
      scoreSource: "cached",
      quality: { tier: "b", label: "良好" },
      rating: {
        hearthArena: 88,
        pickRate: 43,
        firestone: { includedWinrate: 57.4, playedWinrate: 58.1, sampleSize: 3000 }
      }
    });
  });

  it("does not carry statistics to a different card ID", () => {
    const next = trackerState("Mage", [{ name: "新候选", cardId: "TEST_999", count: 1 }]);

    expect(preserveArenaChoiceStatistics(trackerState("Mage", [ratedChoice]), next)).toBe(next);
    expect(next.arena?.currentChoices[0].rating).toBeUndefined();
  });

  it("does not carry statistics across arena classes", () => {
    const next = trackerState("Hunter", [{ name: "候选一", cardId: "TEST_001", count: 1 }]);

    expect(preserveArenaChoiceStatistics(trackerState("Mage", [ratedChoice]), next)).toBe(next);
    expect(next.arena?.currentChoices[0].rating).toBeUndefined();
  });

  it("does not use a matching name when either card ID is missing", () => {
    const next = trackerState("Mage", [{ name: "候选一", count: 1 }]);

    expect(preserveArenaChoiceStatistics(trackerState("Mage", [ratedChoice]), next)).toBe(next);
    expect(next.arena?.currentChoices[0].rating).toBeUndefined();
  });
});
