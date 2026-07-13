import type {
  CreateMatchStateOptions,
  DeckCard,
  DeckImportResult,
  GameLogEvent,
  MatchPlayer,
  MatchState,
  SeenCard,
  ZoneChangeEvent
} from "./types.js";

export function createMatchState(options: CreateMatchStateOptions = {}): MatchState {
  const friendlyDeck = options.deck ? cloneDeck(options.deck.cards) : [];
  const events = options.deck
    ? [
        {
          type: "deck-loaded" as const,
          cards: friendlyDeck
        }
      ]
    : [];

  return {
    friendlyPlayerId: options.friendlyPlayerId,
    opponentPlayerId: options.opponentPlayerId,
    friendlyDeck,
    drawnCards: [],
    opponentPlayedCards: [],
    players: [],
    events
  };
}

export function createMatchStateFromDeck(
  deck: DeckImportResult,
  options: Omit<CreateMatchStateOptions, "deck"> = {}
): MatchState {
  return createMatchState({ ...options, deck });
}

export function applyGameLogEvents(state: MatchState, events: readonly GameLogEvent[]): MatchState {
  return events.reduce((nextState, event) => applyGameLogEvent(nextState, event), state);
}

export function applyGameLogEvent(state: MatchState, event: GameLogEvent): MatchState {
  const stateWithLog = appendEvent(state, { type: "log-event", event });

  if (event.type === "player-info") {
    return upsertPlayer(stateWithLog, {
      playerId: event.playerId,
      name: event.name,
      isLocal: event.isLocal
    });
  }

  if (event.type === "zone-change" && isFriendlyDraw(stateWithLog, event)) {
    return recordDraw(stateWithLog, toSeenCard(event));
  }

  if (event.type === "card-played" && resolveSide(stateWithLog, event.entity.playerId) === "opponent") {
    return recordOpponentPlayed(stateWithLog, toSeenCard(event));
  }

  return stateWithLog;
}

function isFriendlyDraw(state: MatchState, event: ZoneChangeEvent): boolean {
  return (
    event.tag === "ZONE" &&
    event.value === "HAND" &&
    event.entity.zone === "DECK" &&
    resolveSide(state, event.entity.playerId) === "friendly"
  );
}

function recordDraw(state: MatchState, card: SeenCard): MatchState {
  return appendEvent(
    {
      ...state,
      friendlyDeck: removeOneCard(state.friendlyDeck, card),
      drawnCards: [...state.drawnCards, card]
    },
    { type: "card-drawn", card }
  );
}

function recordOpponentPlayed(state: MatchState, card: SeenCard): MatchState {
  return appendEvent(
    {
      ...state,
      opponentPlayedCards: [...state.opponentPlayedCards, card]
    },
    { type: "opponent-card-played", card }
  );
}

function removeOneCard(deck: readonly DeckCard[], card: SeenCard): readonly DeckCard[] {
  let removed = false;

  return deck.flatMap((deckCard) => {
    if (!removed && matchesSeenCard(deckCard, card)) {
      removed = true;
      const nextCount = deckCard.count - 1;
      return nextCount > 0 ? [{ ...deckCard, count: nextCount }] : [];
    }

    return [deckCard];
  });
}

function matchesSeenCard(deckCard: DeckCard, card: SeenCard): boolean {
  if (deckCard.cardId && card.cardId) {
    return deckCard.cardId === card.cardId;
  }

  if (!deckCard.name || !card.name) {
    return false;
  }

  return deckCard.name.trim().toLocaleLowerCase() === card.name.trim().toLocaleLowerCase();
}

function upsertPlayer(state: MatchState, player: MatchPlayer): MatchState {
  const existingPlayer = state.players.find((existing) => existing.playerId === player.playerId);
  const mergedPlayer = {
    ...existingPlayer,
    ...withoutUndefined(player)
  };
  const players = state.players.filter((existing) => existing.playerId !== player.playerId);
  const friendlyPlayerId = mergedPlayer.isLocal ? mergedPlayer.playerId : state.friendlyPlayerId;

  return {
    ...state,
    friendlyPlayerId,
    opponentPlayerId: inferOpponentPlayerId(friendlyPlayerId, state.opponentPlayerId, mergedPlayer.playerId),
    players: [...players, mergedPlayer]
  };
}

function inferOpponentPlayerId(
  friendlyPlayerId: number | undefined,
  currentOpponentPlayerId: number | undefined,
  candidatePlayerId: number
): number | undefined {
  if (currentOpponentPlayerId || !friendlyPlayerId || candidatePlayerId === friendlyPlayerId) {
    return currentOpponentPlayerId;
  }

  return candidatePlayerId;
}

function resolveSide(state: MatchState, playerId: number | undefined): "friendly" | "opponent" | "unknown" {
  if (!playerId) {
    return "unknown";
  }

  if (state.friendlyPlayerId && playerId === state.friendlyPlayerId) {
    return "friendly";
  }

  if (state.opponentPlayerId && playerId === state.opponentPlayerId) {
    return "opponent";
  }

  return state.friendlyPlayerId ? "opponent" : "unknown";
}

function toSeenCard(event: ZoneChangeEvent | Extract<GameLogEvent, { type: "card-played" }>): SeenCard {
  return {
    name: event.entity.name,
    cardId: event.entity.cardId,
    entityId: event.entity.entityId,
    playerId: event.entity.playerId,
    timestamp: event.timestamp,
    raw: event.raw
  };
}

function appendEvent(state: MatchState, event: MatchState["events"][number]): MatchState {
  return {
    ...state,
    events: [...state.events, event]
  };
}

function cloneDeck(cards: readonly DeckCard[]): readonly DeckCard[] {
  return cards.map((card) => ({ ...card }));
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
