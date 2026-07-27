import type { ArenaCardRating, FirestoneCardRating } from "../shared/arenaRatings";
import type { ArenaCardChoice, ArenaState, PublicTrackerState } from "../shared/types";

export function preserveArenaChoiceStatistics(
  previous: PublicTrackerState,
  next: PublicTrackerState
): PublicTrackerState {
  if (!previous.arena || !next.arena || !sameArenaHero(previous.arena, next.arena)) {
    return next;
  }

  const previousByCardId = new Map(
    previous.arena.currentChoices
      .filter((choice): choice is ArenaCardChoice & { readonly cardId: string } => Boolean(choice.cardId))
      .map((choice) => [normalizeCardId(choice.cardId), choice])
  );
  let preservedAny = false;
  const currentChoices = next.arena.currentChoices.map((choice) => {
    if (!choice.cardId) {
      return choice;
    }

    const previousChoice = previousByCardId.get(normalizeCardId(choice.cardId));
    if (!previousChoice) {
      return choice;
    }

    const merged = mergeChoiceStatistics(previousChoice, choice);
    preservedAny ||= merged !== choice;
    return merged;
  });

  return preservedAny
    ? { ...next, arena: { ...next.arena, currentChoices } }
    : next;
}

function sameArenaHero(previous: ArenaState, next: ArenaState): boolean {
  const previousHero = arenaHeroKey(previous);
  return previousHero !== undefined && previousHero === arenaHeroKey(next);
}

function arenaHeroKey(arena: ArenaState): string | undefined {
  const value = arena.hero?.className ?? arena.hero?.cardId ?? arena.hero?.name;
  return value?.trim().toLowerCase();
}

function normalizeCardId(cardId: string): string {
  return cardId.trim().toUpperCase();
}

function mergeChoiceStatistics(previous: ArenaCardChoice, next: ArenaCardChoice): ArenaCardChoice {
  const rating = mergeArenaRating(previous.rating, next.rating);
  const score = next.score ?? previous.score;
  const scoreSource = next.scoreSource ?? previous.scoreSource;
  const quality = next.quality ?? previous.quality;

  if (
    rating === next.rating &&
    score === next.score &&
    scoreSource === next.scoreSource &&
    quality === next.quality
  ) {
    return next;
  }

  return {
    ...next,
    score,
    scoreSource,
    quality,
    rating
  };
}

function mergeArenaRating(
  previous: ArenaCardRating | undefined,
  next: ArenaCardRating | undefined
): ArenaCardRating | undefined {
  if (!previous) {
    return next;
  }
  if (!next) {
    return previous;
  }

  return {
    ...previous,
    ...withoutUndefined(next),
    firestone: mergeFirestoneRating(previous.firestone, next.firestone)
  };
}

function mergeFirestoneRating(
  previous: FirestoneCardRating | undefined,
  next: FirestoneCardRating | undefined
): FirestoneCardRating | undefined {
  if (!previous) {
    return next;
  }
  if (!next) {
    return previous;
  }
  return { ...previous, ...withoutUndefined(next) };
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined)
  ) as Partial<T>;
}
