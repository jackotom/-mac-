import type {
  PublicCardTracking,
  PublicCardZoneGroup,
  PublicPlayerCardTracking,
  PublicTrackerState
} from "../../src/shared/types";
import { parsePublicTrackerState } from "../../src/renderer/runtimeValidation";

type TrackerStateOverrides = Partial<Omit<PublicTrackerState, "cardTracking">> & {
  readonly cardTracking?: PublicCardTracking;
};

function createKnownEmptyZone(): PublicCardZoneGroup {
  return {
    status: "known",
    knownCount: 0,
    totalCount: 0,
    cards: []
  };
}

function createUnknownEmptyZone(): PublicCardZoneGroup {
  return {
    status: "unknown",
    knownCount: 0,
    cards: []
  };
}

function createPlayerTracking(opponent: boolean): PublicPlayerCardTracking {
  return {
    current: {
      deck: opponent ? createUnknownEmptyZone() : createKnownEmptyZone(),
      hand: opponent ? createUnknownEmptyZone() : createKnownEmptyZone(),
      play: createKnownEmptyZone(),
      secret: createKnownEmptyZone(),
      graveyard: createKnownEmptyZone(),
      removed: createKnownEmptyZone()
    },
    burned: { totalCount: 0, items: [], truncated: false },
    used: { totalCount: 0, items: [], truncated: false }
  };
}

export function createEmptyCardTracking(gameKey: string): PublicCardTracking {
  return {
    schemaVersion: 1,
    gameKey,
    friendly: createPlayerTracking(false),
    opponent: createPlayerTracking(true),
    opponentSecretSlots: [],
    detailsByCardKey: {}
  };
}

function createBaseTrackerState(): PublicTrackerState {
  return {
    status: "idle",
    gameActive: false,
    deck: [],
    opponentPlayed: [],
    events: [],
    summary: {
      totalCards: 0,
      remainingCards: 0,
      drawnCards: 0,
      opponentPlayedCount: 0
    },
    cardTracking: createEmptyCardTracking("no-game")
  };
}

export function createPublicTrackerState(
  overrides: TrackerStateOverrides = {}
): PublicTrackerState {
  const { cardTracking, ...rest } = overrides;
  const state = structuredClone({
    ...createBaseTrackerState(),
    ...rest,
    cardTracking: cardTracking === undefined
      ? createEmptyCardTracking("no-game")
      : cardTracking
  });
  try {
    return parsePublicTrackerState(state);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cardTracking 或状态覆盖无效：${reason}`);
  }
}
