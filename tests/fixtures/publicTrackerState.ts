import type {
  PublicCardTracking,
  PublicCardZoneGroup,
  PublicPlayerCardTracking,
  PublicTrackerState
} from "../../src/shared/types";

type TrackerStateOverrides = Omit<Partial<PublicTrackerState>, "cardTracking"> & {
  readonly cardTracking?: PublicCardTracking;
};

type CompletePublicTrackerState = PublicTrackerState & {
  readonly cardTracking: PublicCardTracking;
};

type RejectExplicitUndefinedCardTracking<T> =
  "cardTracking" extends keyof T
    ? T extends { readonly cardTracking: infer Value }
      ? [Value] extends [undefined] ? never : unknown
      : unknown
    : unknown;

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
    }
  };
}

export function createLegacyPublicTrackerState(
  overrides: Omit<Partial<PublicTrackerState>, "cardTracking"> = {}
): PublicTrackerState {
  return {
    ...createBaseTrackerState(),
    ...overrides
  };
}

export function createPublicTrackerState(): CompletePublicTrackerState;
export function createPublicTrackerState<const T extends TrackerStateOverrides>(
  overrides: T & RejectExplicitUndefinedCardTracking<T>
): CompletePublicTrackerState;
export function createPublicTrackerState(
  overrides: TrackerStateOverrides = {}
): CompletePublicTrackerState {
  if (Object.prototype.hasOwnProperty.call(overrides, "cardTracking") &&
      overrides.cardTracking === undefined) {
    throw new Error("cardTracking 不能显式设为 undefined");
  }
  const { cardTracking, ...rest } = overrides;
  return {
    ...createBaseTrackerState(),
    ...rest,
    cardTracking: cardTracking === undefined
      ? createEmptyCardTracking("no-game")
      : structuredClone(cardTracking)
  };
}
