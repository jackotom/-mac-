import { listCardInfos, normalizeHeroClass, toCardDetails, type CardDatabase } from "./cardDatabase.js";
import type { OpponentSecretSlot, SecretCandidate } from "./types.js";

type SupportedAction = "friendly-spell" | "friendly-minion" | "other";

const SUPPORTED_NON_TRIGGER_RULES: Readonly<Record<string, SupportedAction>> = {
  EX1_287: "friendly-spell",
  DMF_236: "friendly-spell",
  EX1_294: "friendly-minion",
  LOOT_101: "friendly-minion",
  REV_828: "friendly-minion"
};

export class SecretTracker {
  private readonly slots = new Map<string, { candidates: SecretCandidate[]; revealedCardId?: string }>();
  private opponentClass?: string;
  private action?: SupportedAction;

  constructor(private readonly database?: CardDatabase) {}

  setOpponentClass(heroClass?: string) {
    this.opponentClass = normalizeHeroClass(heroClass);
    for (const slot of this.slots.values()) {
      const previous = new Map(slot.candidates.map((candidate) => [candidate.cardId, candidate.status]));
      slot.candidates = this.buildCandidates().map((candidate) => ({ ...candidate, status: previous.get(candidate.cardId) ?? candidate.status }));
    }
  }

  enterSecret(entityId: string) {
    if (!this.slots.has(entityId)) this.slots.set(entityId, { candidates: this.buildCandidates() });
  }

  revealSecret(entityId: string, cardId: string) {
    const slot = this.slots.get(entityId);
    if (!slot) return;
    const knownCard = this.database
      ? listCardInfos(this.database).find((card) => (card.cardId ?? card.id)?.toUpperCase() === cardId.toUpperCase())
      : undefined;
    if (knownCard && !knownCard.mechanics?.includes("SECRET")) {
      this.slots.delete(entityId);
      return;
    }
    slot.revealedCardId = cardId;
  }

  leaveSecret(entityId: string) { this.slots.delete(entityId); }
  beginAction(action: SupportedAction) { this.action = action; }
  endAction() {
    const action = this.action;
    this.action = undefined;
    if (!action) return;
    for (const slot of this.slots.values()) {
      slot.candidates = slot.candidates.map((candidate) =>
        SUPPORTED_NON_TRIGGER_RULES[candidate.cardId] === action ? { ...candidate, status: "excluded" } : candidate
      );
    }
  }

  reset() { this.slots.clear(); this.action = undefined; }

  getSlots(): OpponentSecretSlot[] {
    return [...this.slots].map(([entityId, slot]) => ({ entityId, candidates: slot.candidates, revealedCardId: slot.revealedCardId }));
  }

  private buildCandidates(): SecretCandidate[] {
    if (!this.database) return [];
    return listCardInfos(this.database)
      .filter((card) => card.collectible === true && card.mechanics?.includes("SECRET") && Boolean(card.cardId))
      .filter((card) => !this.opponentClass || !card.heroClasses?.length || card.heroClasses.includes(this.opponentClass!))
      .map((card) => ({ cardId: card.cardId!, name: card.name, status: "possible", details: toCardDetails(this.database!, card) }));
  }
}
