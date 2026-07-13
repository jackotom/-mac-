import {
  createCardIdNameLookup,
  listCardInfos,
  normalizeCardId,
  toCardDetails,
  type CardDatabase,
  type CardInfo
} from "./cardDatabase.js";
import { ArenaChoiceParser, type ArenaPowerChoiceEvent } from "./arenaChoiceParser.js";
import { parseArenaLogLine, type ArenaLogEvent } from "./arenaLogParser.js";
import {
  getArenaCardRating,
  getArenaScoreQuality,
  getArenaScoreSourceLabel,
  type ArenaRatingTable
} from "./arenaRatings.js";
import type {
  ArenaCardChoice,
  ArenaHero,
  ArenaPick,
  ArenaState,
  DeckCard
} from "./types.js";

interface CardReference {
  readonly cardId?: string;
  readonly cardName?: string;
  readonly entityId?: string;
}

export class ArenaDraftEngine {
  private readonly choiceParser = new ArenaChoiceParser();
  private cardNameByCardId = new Map<string, string>();
  private cardInfoByCardId = new Map<string, CardInfo>();
  private cardInfoByName = new Map<string, CardInfo>();
  private cardDatabase: CardDatabase | undefined;
  private ratings: ArenaRatingTable | undefined;
  private status: ArenaState["status"] = "inactive";
  private hero: ArenaHero | undefined;
  private currentChoices: ArenaCardChoice[] = [];
  private picks: ArenaPick[] = [];
  private pendingDraftContents: ArenaLogEvent[] = [];
  private preferArenaLogPicks: boolean;
  private lastPick: { cardId?: string; name: string; source: string } | undefined;
  private lastUpdated: string | undefined;
  private error: string | undefined;

  constructor(options: { cardDatabase?: CardDatabase; ratings?: ArenaRatingTable; preferArenaLogPicks?: boolean } = {}) {
    this.preferArenaLogPicks = options.preferArenaLogPicks ?? false;
    if (options.cardDatabase) {
      this.setCardDatabase(options.cardDatabase);
    }
    if (options.ratings) {
      this.setRatings(options.ratings);
    }
  }

  setPreferArenaLogPicks(value: boolean) {
    this.preferArenaLogPicks = value;
  }

  setCardDatabase(cardDatabase?: CardDatabase) {
    this.cardDatabase = cardDatabase;
    this.cardNameByCardId = cardDatabase ? new Map(createCardIdNameLookup(cardDatabase)) : new Map();
    this.cardInfoByCardId = new Map();
    this.cardInfoByName = new Map();
    for (const card of cardDatabase ? listCardInfos(cardDatabase) : []) {
      if (card.cardId ?? card.id) {
        this.cardInfoByCardId.set(normalizeCardId(card.cardId ?? card.id!), card);
      }
      this.cardInfoByName.set(normalizeCardName(card.name), card);
    }
    this.rebuildScores();
  }

  setRatings(ratings?: ArenaRatingTable) {
    this.ratings = ratings;
    if (ratings) {
      this.error = undefined;
    }
    this.rebuildScores();
  }

  setError(error?: string) {
    this.error = error;
    this.touch();
  }

  reset() {
    this.choiceParser.reset();
    this.status = "inactive";
    this.hero = undefined;
    this.currentChoices = [];
    this.picks = [];
    this.pendingDraftContents = [];
    this.lastPick = undefined;
    this.lastUpdated = undefined;
    this.error = undefined;
  }

  applyArenaLine(line: string) {
    for (const event of parseArenaLogLine(line)) {
      this.applyArenaEvent(event);
    }
  }

  applyArenaText(text: string) {
    for (const line of text.split(/\r?\n/)) {
      this.applyArenaLine(line);
    }
  }

  applyPowerLine(line: string) {
    if (!isArenaChoosingStatus(this.status)) {
      return;
    }
    for (const event of this.choiceParser.applyLine(line)) {
      this.applyPowerChoiceEvent(event);
    }
  }

  applyPowerText(text: string) {
    if (!isArenaChoosingStatus(this.status)) {
      this.choiceParser.reset();
      return;
    }
    for (const line of text.split(/\r?\n/)) {
      this.applyPowerLine(line);
    }

    for (const event of this.choiceParser.flush()) {
      this.applyPowerChoiceEvent(event);
    }
  }

  applyScreenChoices(names: readonly string[]) {
    if (!isArenaChoosingStatus(this.status)) {
      return false;
    }

    const choices = uniqueScreenChoices(names)
      .map((name) => this.findCardInfoByRecognizedName(name))
      .filter((card): card is CardInfo => card !== undefined)
      .map((card) => this.scoreChoice({
        name: card.name,
        count: 1,
        cardId: card.cardId ?? card.id
      }));

    if (choices.length !== 3) {
      return false;
    }

    const nextSignature = choices.map((choice) => choice.cardId ?? choice.name).join("|");
    const currentSignature = this.currentChoices.map((choice) => choice.cardId ?? choice.name).join("|");
    if (nextSignature === currentSignature) {
      return false;
    }

    this.currentChoices = choices;
    this.touch();
    return true;
  }

  private findCardInfoByRecognizedName(name: string): CardInfo | undefined {
    const normalized = normalizeCardName(name);
    const exact = this.cardInfoByName.get(normalized);
    if (exact || normalized.length < 4) {
      return exact;
    }

    const maxDistance = normalized.length <= 5 ? 1 : 2;
    let best: { card: CardInfo; distance: number } | undefined;
    let bestDistanceMatches = 0;
    for (const [cardName, card] of this.cardInfoByName) {
      const distance = boundedLevenshteinDistance(normalized, cardName, maxDistance);
      if (distance === undefined) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = { card, distance };
        bestDistanceMatches = 1;
      } else if (distance === best.distance) {
        bestDistanceMatches += 1;
      }
    }

    return best && bestDistanceMatches === 1 ? best.card : undefined;
  }

  markPlaying() {
    if (this.status === "complete") {
      this.status = "playing";
      this.touch();
    }
  }

  getState(): ArenaState {
    const deck = buildArenaDeck(this.picks, this.status);
    const deckCount = deck.reduce((total, card) => total + card.count, 0);
    return {
      status: this.status,
      hero: this.hero,
      currentChoices: this.currentChoices.map((choice) => ({ ...choice })),
      picks: this.picks.map((pick) => ({
        ...pick,
        chosen: { ...pick.chosen },
        offered: pick.offered.map((choice) => ({ ...choice }))
      })),
      deck,
      draftCount: this.status === "complete" || this.status === "playing" ? Math.max(this.picks.length, Math.min(30, deckCount)) : this.picks.length,
      scoreSource: getArenaScoreSourceLabel(this.ratings),
      ratingsVersion: this.ratings?.version,
      lastUpdated: this.lastUpdated,
      error: this.error
    };
  }

  private applyArenaEvent(event: ArenaLogEvent) {
    if (isDraftContentsRestoreEvent(event)) {
      this.pendingDraftContents.push(event);
      return;
    }

    if (event.type === "mode") {
      if (event.mode === "drafting") {
        const pendingDraftContents = this.pendingDraftContents;
        this.pendingDraftContents = [];
        if (this.status !== "drafting" || pendingDraftContents.length > 0) {
          this.resetDraft();
        }
        this.status = "drafting";
        this.restoreDraftContents(pendingDraftContents);
      } else if (event.mode === "redrafting") {
        this.restorePendingDraftContents();
        this.status = "redrafting";
        this.currentChoices = [];
      } else if (event.mode === "complete") {
        this.restorePendingDraftContents();
        this.status = "complete";
        this.currentChoices = [];
      } else if (event.mode === "playing") {
        this.restorePendingDraftContents();
        this.status = "playing";
        this.currentChoices = [];
      } else {
        this.pendingDraftContents = [];
        this.status = "inactive";
        this.hero = undefined;
        this.currentChoices = [];
        this.picks = [];
        this.lastPick = undefined;
      }
      this.touch();
      return;
    }

    if (!isArenaChoosingStatus(this.status)) {
      return;
    }

    if (event.type === "hero-selected") {
      this.hero = this.toHero(event);
      this.rebuildScores();
      this.touch();
      return;
    }

    const reference: CardReference = {
      cardId: event.cardId,
      cardName: event.cardName
    };

    if (event.type === "deck-card") {
      this.recordPick(reference, this.currentChoices, "deck-card");
    } else {
      this.recordPick(reference, this.currentChoices, "arena-log");
    }
  }

  private applyPowerChoiceEvent(event: ArenaPowerChoiceEvent) {
    if (!isArenaChoosingStatus(this.status)) {
      return;
    }

    if (event.type === "offered") {
      this.currentChoices = event.offered.map((choice) => this.scoreChoice(choice));
      this.touch();
      return;
    }

    if (event.chosen.length === 0) {
      return;
    }

    this.currentChoices = event.offered.map((choice) => this.scoreChoice(choice));
    if (!this.preferArenaLogPicks) {
      const chosen = event.chosen[0];
      this.recordPick(chosen, this.currentChoices, "power-log");
    }
  }

  private recordPick(reference: CardReference, offered: readonly ArenaCardChoice[], source: string) {
    const chosen = this.scoreChoice({
      name: reference.cardName ?? reference.cardId ?? "未知卡牌",
      count: 1,
      cardId: reference.cardId,
      entityId: reference.entityId
    });

    if (this.lastPick && sameCard(this.lastPick, chosen) && this.lastPick.source !== source && offered.length === 0) {
      return;
    }

    this.picks.push({
      slot: this.picks.length + 1,
      chosen,
      offered: offered.map((choice) => this.scoreChoice(choice)),
      at: new Date().toISOString()
    });
    this.lastPick = { cardId: chosen.cardId, name: chosen.name, source };
    this.currentChoices = [];
    if (!this.hero && chosen.cardId?.startsWith("HERO_")) {
      this.hero = this.toHero(chosen);
      this.picks.pop();
    }
    if (this.picks.length >= 30) {
      this.status = "complete";
    }
    this.touch();
  }

  private restoreDraftContents(events: readonly ArenaLogEvent[]) {
    for (const event of events) {
      if (event.type === "hero-selected") {
        this.hero = this.toHero(event);
        this.rebuildScores();
        this.touch();
        continue;
      }

      if (event.type === "deck-card") {
        this.recordPick({
          cardId: event.cardId,
          cardName: event.cardName
        }, this.currentChoices, "deck-card");
      }
    }
  }

  private restorePendingDraftContents() {
    const pendingDraftContents = this.pendingDraftContents;
    this.pendingDraftContents = [];
    if (pendingDraftContents.length === 0) {
      return;
    }

    this.resetDraft();
    this.status = "drafting";
    this.restoreDraftContents(pendingDraftContents);
  }

  private toHero(reference: CardReference | ArenaCardChoice): ArenaHero {
    const cardId = reference.cardId;
    const referenceName = "name" in reference ? reference.name : reference.cardName;
    const name = referenceName ?? (cardId ? this.cardNameByCardId.get(normalizeCardId(cardId)) : undefined) ?? cardId ?? "未知职业";
    return {
      name,
      cardId,
      className: cardId ? heroClassForCardId(cardId) : undefined
    };
  }

  private scoreChoice(choice: ArenaCardChoice): ArenaCardChoice {
    const cardId = choice.cardId;
    const card = (cardId ? this.cardInfoByCardId.get(normalizeCardId(cardId)) : undefined) ?? this.cardInfoByName.get(normalizeCardName(choice.name));
    const name = card?.name ?? (cardId ? this.cardNameByCardId.get(normalizeCardId(cardId)) ?? choice.name : choice.name);
    const rating = getArenaCardRating(this.ratings, cardId, this.hero?.className);
    const score = rating?.hearthArena;
    return {
      ...choice,
      name,
      score,
      scoreSource: score === undefined ? undefined : getArenaScoreSourceLabel(this.ratings),
      details: card && this.cardDatabase ? toCardDetails(this.cardDatabase, card) : choice.details,
      quality: getArenaScoreQuality(score),
      rating
    };
  }

  private rebuildScores() {
    this.currentChoices = this.currentChoices.map((choice) => this.scoreChoice(choice));
    this.picks = this.picks.map((pick) => ({
      ...pick,
      chosen: this.scoreChoice(pick.chosen),
      offered: pick.offered.map((choice) => this.scoreChoice(choice))
    }));
    if (this.hero?.cardId) {
      this.hero = this.toHero(this.hero);
    }
  }

  private resetDraft() {
    this.hero = undefined;
    this.currentChoices = [];
    this.picks = [];
    this.lastPick = undefined;
    this.error = undefined;
  }

  private touch() {
    this.lastUpdated = new Date().toISOString();
  }
}

function aggregateDeck(picks: readonly ArenaPick[]): DeckCard[] {
  const cards = new Map<string, DeckCard>();
  for (const pick of picks) {
    const key = pick.chosen.cardId ? `id:${normalizeCardId(pick.chosen.cardId)}` : `name:${pick.chosen.name.trim().toLocaleLowerCase()}`;
    const current = cards.get(key);
    if (current) {
      current.count += 1;
    } else {
      cards.set(key, {
        name: pick.chosen.name,
        count: 1,
        cardId: pick.chosen.cardId,
        details: pick.chosen.details
      });
    }
  }
  return [...cards.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function buildArenaDeck(picks: readonly ArenaPick[], status: ArenaState["status"]): DeckCard[] {
  const deck = aggregateDeck(picks);
  const total = deck.reduce((sum, card) => sum + card.count, 0);
  if ((status === "redrafting" || status === "complete" || status === "playing") && total > 0 && total < 30) {
    return [
      ...deck,
      {
        name: "日志缺失的竞技场牌",
        count: 30 - total
      }
    ];
  }
  return deck;
}

function isArenaChoosingStatus(status: ArenaState["status"]) {
  return status === "drafting" || status === "redrafting";
}

function isDraftContentsRestoreEvent(event: ArenaLogEvent) {
  return (event.type === "hero-selected" || event.type === "deck-card") && /DraftManager\.OnChoicesAndContents/i.test(event.raw);
}

function sameCard(previous: { cardId?: string; name: string }, current: ArenaCardChoice) {
  if (previous.cardId && current.cardId) {
    return normalizeCardId(previous.cardId) === normalizeCardId(current.cardId);
  }
  return previous.name.trim().toLocaleLowerCase() === current.name.trim().toLocaleLowerCase();
}

function heroClassForCardId(cardId: string): string | undefined {
  const heroClasses: Record<string, string> = {
    HERO_01: "Warrior",
    HERO_02: "Shaman",
    HERO_03: "Rogue",
    HERO_04: "Paladin",
    HERO_05: "Hunter",
    HERO_06: "Druid",
    HERO_07: "Warlock",
    HERO_08: "Mage",
    HERO_09: "Priest",
    HERO_10: "Demon Hunter",
    HERO_11: "Death Knight"
  };
  return heroClasses[cardId.toUpperCase()];
}

function normalizeCardName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function boundedLevenshteinDistance(left: string, right: string, maxDistance: number): number | undefined {
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  if (Math.abs(leftChars.length - rightChars.length) > maxDistance) {
    return undefined;
  }

  let previous = Array.from({ length: rightChars.length + 1 }, (_value, index) => index);
  for (let leftIndex = 0; leftIndex < leftChars.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    let rowMinimum = current[0]!;
    for (let rightIndex = 0; rightIndex < rightChars.length; rightIndex += 1) {
      const substitutionCost = leftChars[leftIndex] === rightChars[rightIndex] ? 0 : 1;
      const next = Math.min(
        previous[rightIndex + 1]! + 1,
        current[rightIndex]! + 1,
        previous[rightIndex]! + substitutionCost
      );
      current.push(next);
      rowMinimum = Math.min(rowMinimum, next);
    }
    if (rowMinimum > maxDistance) {
      return undefined;
    }
    previous = current;
  }

  const distance = previous[rightChars.length]!;
  return distance <= maxDistance ? distance : undefined;
}

function uniqueScreenChoices(names: readonly string[]) {
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const normalized = normalizeCardName(name);
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [name];
  });
}
