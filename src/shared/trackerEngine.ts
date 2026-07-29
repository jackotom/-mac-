import { createEmptyDeckRows, deckCardKey, parseDeckText } from "./deck.js";
import { normalizeZone, parseLogLine, type FriendlyDeckSnapshot } from "./powerLogParser.js";
import {
  createCardIdNameLookup,
  isRandomSpellPoolCard,
  listCardInfos,
  normalizeCardId,
  toCardDetails,
  toRelatedCardInfo,
  type CardOutcomeNode,
  type CardOutcomeSection,
  type CardDatabase,
  type CardDetails,
  type CardInfo
} from "./cardDatabase.js";
import type {
  CardTrackerRow,
  CollectionDeck,
  DeckCard,
  EntitySnapshot,
  ParsedLogEvent,
  PlayerMatchCounters,
  PublicTrackerState,
  TrackerEvent,
  TrackerZoneCard,
  Zone
} from "./types.js";
import { SecretTracker } from "./secretTracker.js";
import { resolveMatchCardRelations } from "./matchCardRelations.js";

interface EngineOptions {
  deckText?: string;
  cardDatabase?: CardDatabase;
  cardDatabaseWarnings?: readonly string[];
  collectionDecks?: readonly CollectionDeck[];
}

interface FriendlyObservation {
  readonly cardName: string;
  readonly rawCardName?: string;
  readonly cardId?: string;
  readonly kind: "draw" | "play";
  readonly fromZone?: Zone;
  readonly toZone: Zone;
  readonly raw: string;
  applied: boolean;
}

type CardOutcomeSide = "friendly" | "opponent";

interface RecordedCardOutcomeNode {
  readonly key: string;
  readonly entityId?: string;
  readonly card: CardInfo;
  readonly children: RecordedCardOutcomeNode[];
}

interface RecordedCardOutcome {
  readonly key: string;
  readonly source: CardInfo;
  readonly cards: RecordedCardOutcomeNode[];
  readonly keepWhenEmpty: boolean;
}

interface CardOutcomeBlockFrame {
  readonly key: string;
  readonly blockType?: string;
  readonly entityId?: string;
  readonly parentCards?: RecordedCardOutcomeNode[];
  readonly parentSourceEntityId?: string;
  readonly parentAcceptsFullEntityOutcomes?: boolean;
  side?: CardOutcomeSide;
  sourceEntityId?: string;
  cards?: RecordedCardOutcomeNode[];
  acceptsFullEntityOutcomes?: boolean;
  capture?: RecordedCardOutcome;
  configured?: boolean;
  suppressed?: boolean;
}

const GENERATED_DECK_ROW_NAME = "对局生成的未知牌";
const MISSING_COLLECTION_DECK_ROW_NAME = "日志缺失的收藏牌";
const INSERTED_UNKNOWN_DECK_ROW_NAME = "被塞入的未知牌";
const UNRESOLVED_HAND_CARD_NAME = "未识别手牌";
const GALACTIC_PROJECTION_ORB_CARD_ID = "toy_378";
const FRIENDLY_HAND_ZONES = new Set<Zone>(["HAND"]);
const FRIENDLY_OTHER_ZONES = new Set<Zone>(["PLAY", "GRAVEYARD", "REMOVEDFROMGAME", "SECRET"]);
const OPPONENT_OTHER_ZONES = new Set<Zone>(["PLAY", "GRAVEYARD", "REMOVEDFROMGAME", "SETASIDE", "SECRET"]);
const DISPLAYABLE_CARD_TYPE_IDS = new Set([4, 5, 7, 39]);
const NON_DISPLAYABLE_CARD_TYPE_IDS = new Set([2, 3, 6, 10]);
const DISPLAYABLE_CARD_TYPES = new Set(["MINION", "SPELL", "WEAPON", "LOCATION", "随从", "法术", "武器", "地标"]);
const NON_DISPLAYABLE_CARD_TYPES = new Set([
  "PLAYER",
  "HERO",
  "HEROPOWER",
  "ENCHANTMENT",
  "玩家",
  "英雄",
  "英雄技能",
  "附魔"
]);

export class TrackerEngine {
  private deckCards: DeckCard[] = [];
  private deckCode: string | undefined;
  private deckName: string | undefined;
  private autoMatchedDeckId: string | undefined;
  private deckRows = new Map<string, CardTrackerRow>();
  private opponentRows = new Map<string, CardTrackerRow>();
  private globalEffects = new Map<string, EntitySnapshot>();
  private opponentGlobalEffects = new Map<string, EntitySnapshot>();
  private events: TrackerEvent[] = [];
  private entities = new Map<string, EntitySnapshot>();
  private collectionDecks: CollectionDeck[] = [];
  private friendlyObservations: FriendlyObservation[] = [];
  private eventCounter = 0;
  private status: PublicTrackerState["status"] = "idle";
  private gameActive = false;
  private gameSetupComplete = false;
  private logPath: string | undefined;
  private error: string | undefined;
  private friendlyController: number | undefined;
  private configuredFriendlyController: number | undefined;
  private deckRowsByCardId = new Map<string, CardTrackerRow>();
  private cardNameByCardId = new Map<string, string>();
  private cardInfoByCardId = new Map<string, CardInfo>();
  private cardInfoByName = new Map<string, CardInfo>();
  private cardDatabase: CardDatabase | undefined;
  private pendingControllerEvents: ParsedLogEvent[] = [];
  private unresolvedDrawEntityIds = new Set<string>();
  private pendingUnknownDeckExitZones = new Map<string, Zone>();
  private generatedEntityIds = new Set<string>();
  private insertedDeckEntityRowKeys = new Map<string, string>();
  private pendingEntityDetail: EntitySnapshot | undefined;
  private playerIdByName = new Map<string, number>();
  private playerIdentityIds = new Set<number>();
  private unknownPlayerIds = new Set<number>();
  private matchCountersByPlayerId = new Map<number, PlayerMatchCounters>();
  private friendlyDeckSnapshot: FriendlyDeckSnapshot | undefined;
  private usingUnmatchedDeckSnapshot = false;
  private lastGameStartTimestamp: string | undefined;
  private friendlyCardsUsedThisGame: CardInfo[] = [];
  private opponentCardsUsedThisGame: CardInfo[] = [];
  private friendlyDeadMinionsThisGame: CardInfo[] = [];
  private opponentDeadMinionsThisGame: CardInfo[] = [];
  private recordedCardPlayEntityIds = new Set<string>();
  private recordedDeathEntityIds = new Set<string>();
  private cardOutcomeBlockStack: CardOutcomeBlockFrame[] = [];
  private friendlyCardOutcomes = new Map<string, RecordedCardOutcome[]>();
  private opponentCardOutcomes = new Map<string, RecordedCardOutcome[]>();
  private completedCardOutcomeKeys = new Set<string>();
  private lastBlockBoundaryFingerprint: string | undefined;
  private pendingKnownEntityReturn: EntitySnapshot | undefined;
  private pendingKnownEntityReturnCandidateIds = new Set<string>();
  private secretTracker: SecretTracker;

  constructor(options: EngineOptions = {}) {
    this.secretTracker = new SecretTracker(options.cardDatabase);
    if (options.cardDatabase) {
      this.setCardDatabase(options.cardDatabase);
    }

    if (options.deckText) {
      this.importDeck(options.deckText, options.cardDatabase, options.cardDatabaseWarnings);
    }

    if (options.collectionDecks) {
      this.setCollectionDecks(options.collectionDecks);
    }
  }

  setCardDatabase(cardDatabase?: CardDatabase) {
    this.cardDatabase = cardDatabase;
    this.secretTracker = new SecretTracker(cardDatabase);
    this.cardNameByCardId = cardDatabase ? new Map(createCardIdNameLookup(cardDatabase)) : new Map();
    this.cardInfoByCardId = new Map();
    this.cardInfoByName = new Map();
    for (const card of cardDatabase ? listCardInfos(cardDatabase) : []) {
      if (card.cardId ?? card.id) {
        this.cardInfoByCardId.set(normalizeCardId(card.cardId ?? card.id!), card);
      }
      this.cardInfoByName.set(normalizeCardKey(card.name), card);
    }
  }

  setFriendlyController(controller?: number) {
    this.configuredFriendlyController = controller;
    this.friendlyController = controller;
    if (controller !== undefined && this.pendingControllerEvents.length > 0) {
      const pending = this.pendingControllerEvents;
      this.pendingControllerEvents = [];
      pending.forEach((event) => this.applyParsedEvent(event));
    }
  }

  importDeck(deckText: string, cardDatabase?: CardDatabase, cardDatabaseWarnings: readonly string[] = []) {
    if (cardDatabase) {
      this.setCardDatabase(cardDatabase);
    }

    const imported = parseDeckText(deckText, cardDatabase, cardDatabaseWarnings);
    this.deckCards = imported.cards;
    this.deckCode = imported.rawCode;
    this.deckName = undefined;
    this.autoMatchedDeckId = undefined;
    this.deckRows = new Map(createEmptyDeckRows(imported.cards).map((row) => [deckCardKey(row), row]));
    this.rebuildDeckCardIdIndex();
    this.opponentRows.clear();
    this.globalEffects.clear();
    this.opponentGlobalEffects.clear();
    this.events = [];
    this.entities.clear();
    this.friendlyObservations = [];
    this.pendingControllerEvents = [];
    this.unresolvedDrawEntityIds.clear();
    this.generatedEntityIds.clear();
    this.insertedDeckEntityRowKeys.clear();
    this.pendingEntityDetail = undefined;
    this.pendingKnownEntityReturn = undefined;
    this.pendingKnownEntityReturnCandidateIds.clear();
    this.clearMatchCounters();
    this.clearMatchCardHistory();
    this.eventCounter = 0;
    this.gameActive = false;
    this.gameSetupComplete = false;
    this.error = imported.warnings[0];
    this.addEvent("info", "unknown", {
      cardName: imported.cards.length ? `已导入 ${imported.cards.length} 种卡牌` : "未导入卡牌列表"
    });
  }

  setCollectionDecks(decks: readonly CollectionDeck[]) {
    this.collectionDecks = decks.filter((deck) => deck.cards.length > 0);
    if (this.collectionDecks.length > 0 && this.deckRows.size === 0) {
      this.tryAutoMatchDeck();
    }
  }

  activateCollectionDeck(deckId: string): boolean {
    const deck = this.collectionDecks.find((candidate) => candidate.id === deckId);
    if (!deck || !this.gameActive) {
      return false;
    }

    if (!this.matchesFriendlyDeckSnapshot(deck)) {
      return false;
    }

    if (this.deckRows.size > 0 && this.autoMatchedDeckId === undefined && !this.usingUnmatchedDeckSnapshot) {
      return false;
    }

    if (this.autoMatchedDeckId === deck.id) {
      return true;
    }

    this.activateAutoMatchedDeck(deck);
    return true;
  }

  activateExplicitCollectionDeck(deckId: string, options: { expectedSize?: number } = {}): boolean {
    const deck = this.collectionDecks.find((candidate) => candidate.id === deckId);
    if (!deck || !this.gameActive) {
      return false;
    }

    const deckSize = deck.cards.reduce((total, card) => total + card.count, 0);
    if (this.friendlyDeckSnapshot && deckSize > this.friendlyDeckSnapshot.initialDeckSize) {
      return false;
    }

    if (this.autoMatchedDeckId === deck.id) {
      return true;
    }

    this.activateExplicitDeck(deck, options);
    return true;
  }

  previewCollectionDeck(deckId: string, options: { expectedSize?: number } = {}): boolean {
    const deck = this.collectionDecks.find((candidate) => candidate.id === deckId);
    if (!deck) {
      return false;
    }

    const deckSize = deck.cards.reduce((total, card) => total + card.count, 0);
    const missingCards = options.expectedSize && options.expectedSize > deckSize
      ? { name: MISSING_COLLECTION_DECK_ROW_NAME, count: options.expectedSize - deckSize }
      : undefined;
    this.deckCards = [...deck.cards.map((card) => ({ ...card })), ...(missingCards ? [missingCards] : [])];
    this.deckCode = deck.rawDeckString;
    this.deckName = deck.name ?? "当前套牌";
    this.autoMatchedDeckId = deck.id;
    this.deckRows = new Map(createEmptyDeckRows(this.deckCards).map((row) => [deckCardKey(row), row]));
    this.rebuildDeckCardIdIndex();
    this.usingUnmatchedDeckSnapshot = false;
    this.error = undefined;
    this.gameActive = false;
    this.gameSetupComplete = false;
    return true;
  }

  clearCollectionDeckPreview(): boolean {
    if (this.gameActive || !this.autoMatchedDeckId) {
      return false;
    }

    this.deckCards = [];
    this.deckCode = undefined;
    this.deckName = undefined;
    this.autoMatchedDeckId = undefined;
    this.deckRows.clear();
    this.deckRowsByCardId.clear();
    this.usingUnmatchedDeckSnapshot = false;
    return true;
  }

  setFriendlyDeckSnapshot(snapshot?: FriendlyDeckSnapshot) {
    this.friendlyDeckSnapshot = snapshot;
  }

  useUnmatchedDeckSnapshot(): boolean {
    const snapshot = this.friendlyDeckSnapshot;
    if (!this.gameActive || !snapshot || snapshot.initialDeckSize <= 0) {
      return false;
    }

    const placeholder: DeckCard = { name: "未识别的剩余牌", count: snapshot.initialDeckSize };
    this.deckCards = [placeholder];
    this.deckCode = undefined;
    this.deckName = "等待精确识别";
    this.autoMatchedDeckId = undefined;
    this.deckRows = new Map([
      [
        deckCardKey(placeholder),
        {
          name: placeholder.name,
          count: snapshot.initialDeckSize,
          remaining: snapshot.remainingDeckSize,
          drawn: Math.max(0, snapshot.initialDeckSize - snapshot.remainingDeckSize),
          played: 0
        }
      ]
    ]);
    this.rebuildDeckCardIdIndex();
    this.usingUnmatchedDeckSnapshot = true;
    this.addEvent("info", "friendly", { cardName: "游戏牌库与收藏记录不一致，正在等待精确识别" });
    return true;
  }

  loadDeckCards(cards: readonly DeckCard[], name: string) {
    this.deckCards = cards.map((card) => ({ ...card }));
    this.deckCode = undefined;
    this.deckName = name;
    this.autoMatchedDeckId = undefined;
    this.deckRows = new Map(createEmptyDeckRows(this.deckCards).map((row) => [deckCardKey(row), row]));
    this.rebuildDeckCardIdIndex();
    this.unresolvedDrawEntityIds.clear();
    this.generatedEntityIds.clear();
    this.insertedDeckEntityRowKeys.clear();
    this.error = undefined;
    this.gameActive = false;
    this.gameSetupComplete = false;
  }

  clearArenaDeck() {
    if (this.deckName !== "竞技场牌库") {
      return;
    }

    this.deckCards = [];
    this.deckCode = undefined;
    this.deckName = undefined;
    this.autoMatchedDeckId = undefined;
    this.deckRows.clear();
    this.deckRowsByCardId.clear();
    this.unresolvedDrawEntityIds.clear();
    this.generatedEntityIds.clear();
    this.insertedDeckEntityRowKeys.clear();
    this.clearMatchCardHistory();
    this.gameActive = false;
  }

  resetForGame() {
    this.deckRows = new Map(createEmptyDeckRows(this.deckCards).map((row) => [deckCardKey(row), row]));
    this.rebuildDeckCardIdIndex();
    this.opponentRows.clear();
    this.globalEffects.clear();
    this.opponentGlobalEffects.clear();
    this.events = [];
    this.entities.clear();
    this.friendlyObservations = [];
    this.pendingControllerEvents = [];
    this.unresolvedDrawEntityIds.clear();
    this.generatedEntityIds.clear();
    this.insertedDeckEntityRowKeys.clear();
    this.pendingEntityDetail = undefined;
    this.pendingKnownEntityReturn = undefined;
    this.pendingKnownEntityReturnCandidateIds.clear();
    this.clearMatchCounters();
    this.clearMatchCardHistory();
    this.eventCounter = 0;
    this.friendlyController = this.configuredFriendlyController;
    this.gameActive = true;
    this.gameSetupComplete = false;
    this.friendlyDeckSnapshot = undefined;
    this.usingUnmatchedDeckSnapshot = false;
    this.lastGameStartTimestamp = undefined;
    this.addEvent("game-start", "unknown", { cardName: "新对局开始" });
  }

  resetAfterGame() {
    this.deckCards = [];
    this.deckCode = undefined;
    this.deckName = undefined;
    this.autoMatchedDeckId = undefined;
    this.deckRows.clear();
    this.deckRowsByCardId.clear();
    this.opponentRows.clear();
    this.globalEffects.clear();
    this.opponentGlobalEffects.clear();
    this.events = [];
    this.entities.clear();
    this.friendlyObservations = [];
    this.pendingControllerEvents = [];
    this.unresolvedDrawEntityIds.clear();
    this.generatedEntityIds.clear();
    this.insertedDeckEntityRowKeys.clear();
    this.pendingEntityDetail = undefined;
    this.pendingKnownEntityReturn = undefined;
    this.pendingKnownEntityReturnCandidateIds.clear();
    this.clearMatchCounters();
    this.clearMatchCardHistory();
    this.eventCounter = 0;
    this.friendlyController = this.configuredFriendlyController;
    this.gameActive = false;
    this.gameSetupComplete = false;
    this.error = undefined;
    this.friendlyDeckSnapshot = undefined;
    this.usingUnmatchedDeckSnapshot = false;
    this.lastGameStartTimestamp = undefined;
    this.secretTracker.reset();
  }

  setStatus(status: PublicTrackerState["status"], logPath?: string, error?: string) {
    this.status = status;
    this.logPath = logPath;
    this.error = error;
  }

  hasActiveGame() {
    return this.gameActive;
  }

  getFriendlyController() {
    return this.friendlyController;
  }

  applyLine(line: string) {
    const events = parseLogLine(line);
    for (const event of events) {
      this.applyParsedEvent(event);
    }
    this.applyEntityDetailContinuation(line, events);
  }

  applyText(text: string) {
    for (const line of text.split(/\r?\n/)) {
      this.applyLine(line);
    }
  }

  getState(): PublicTrackerState {
    const deck = Array.from(this.deckRows.values()).sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
    const friendlyHand = this.buildFriendlyZoneCards(FRIENDLY_HAND_ZONES);
    const friendlyOther = this.buildFriendlyZoneCards(FRIENDLY_OTHER_ZONES);
    const opponentZones = this.buildOpponentZones();
    const opponentPlayed = Array.from(this.opponentRows.values()).sort((a, b) => b.played - a.played || a.name.localeCompare(b.name));
    const calculatedSummary = {
      totalCards: deck.reduce((total, row) => total + row.count, 0),
      remainingCards: deck.reduce((total, row) => total + row.remaining, 0),
      drawnCards: deck.reduce((total, row) => total + row.drawn, 0),
      opponentPlayedCount: opponentPlayed.reduce((total, row) => total + row.played, 0)
    };
    const snapshot = this.deckRows.size > 0 ? this.friendlyDeckSnapshot : undefined;
    const insertedDeckSize = this.insertedDeckEntityRowKeys.size;
    const insertedDeckRemaining = [...this.insertedDeckEntityRowKeys.keys()].filter(
      (entityId) => this.entities.get(entityId)?.zone === "DECK"
    ).length;
    const summary = snapshot
      ? {
          totalCards: snapshot.initialDeckSize + insertedDeckSize,
          remainingCards: snapshot.remainingDeckSize + insertedDeckRemaining,
          drawnCards: Math.max(
            0,
            snapshot.initialDeckSize + insertedDeckSize - snapshot.remainingDeckSize - insertedDeckRemaining
          ),
          opponentPlayedCount: calculatedSummary.opponentPlayedCount
        }
      : calculatedSummary;

    return {
      status: this.status,
      gameActive: this.gameActive,
      logPath: this.logPath,
      deckCode: this.deckCode,
      deckName: this.deckName,
      autoMatchedDeckId: this.autoMatchedDeckId,
      deck: deck.map((row) => this.withCardDetails(row, true)),
      friendlyHand,
      friendlyOther,
      opponentDeck: opponentZones.deck,
      opponentHand: opponentZones.hand,
      opponentOther: opponentZones.other,
      globalEffects: this.buildGlobalEffects(this.globalEffects),
      opponentGlobalEffects: this.buildGlobalEffects(this.opponentGlobalEffects),
      opponentDeckCount: opponentZones.deckCount,
      opponentHandCount: opponentZones.handCount,
      opponentPlayed: opponentPlayed.map((row) => this.withCardDetails(row, "opponent")),
      opponentSecrets: this.secretTracker.getSlots(),
      boardAttack: this.buildBoardAttack(),
      matchCounters: this.buildMatchCounters(),
      events: this.events.slice(-120).reverse(),
      summary,
      lastUpdated: new Date().toISOString(),
      error: this.error
    };
  }

  private applyParsedEvent(event: ParsedLogEvent) {
    if (this.shouldWaitForFriendlyController(event)) {
      this.pendingControllerEvents.push(event);
      return;
    }

    if (event.type === "game-start") {
      if (event.timestamp && event.timestamp === this.lastGameStartTimestamp) {
        return;
      }
      this.resetForGame();
      this.lastGameStartTimestamp = event.timestamp;
      this.secretTracker.reset();
      return;
    }

    if (event.type === "game-end") {
      this.resetAfterGame();
      return;
    }

    if (event.type === "game-setup-complete") {
      this.gameSetupComplete = true;
      return;
    }

    if (event.type === "player-identity") {
      this.rememberPlayerIdentity(event.playerId, event.playerName);
      return;
    }

    if (event.type === "player-counter") {
      if (this.gameActive) {
        this.updatePlayerCounter(event);
      }
      return;
    }

    if (event.type === "global-effect") {
      const controller = event.entity.controller;
      const target = this.isFriendlyController(controller)
        ? this.globalEffects
        : this.isKnownOpponentController(controller) ? this.opponentGlobalEffects : undefined;
      if (!target) return;
      const key = event.entity.id ?? `${controller}:${normalizeCardId(event.entity.cardId ?? "")}`;
      target.set(key, event.entity);
      return;
    }

    if (event.type === "block-boundary") {
      this.applyCardOutcomeBoundary(event);
      return;
    }

    if (event.type === "causal-trigger") {
      if (event.phase === "end") {
        this.finalizePendingKnownEntityReturn();
        return;
      }
      this.pendingKnownEntityReturn = event.trigger === "deathrattle" && event.entity?.id
        ? this.findKnownEntityStoredByAttachment(event.entity.id)
        : undefined;
      this.pendingKnownEntityReturnCandidateIds.clear();
      return;
    }

    if (event.type === "entity-reference") {
      const field = event.relation === "attached" ? "attachedToEntityId" : "storedEntityId";
      this.mergeEntity({ id: event.entityId, [field]: event.referencedEntityId });
      return;
    }

    if (event.type === "generated-entity") {
      if (this.gameSetupComplete && event.entityId) {
        this.generatedEntityIds.add(event.entityId);
        this.reconcileInsertedDeckEntity(event.entityId);
      }
      return;
    }

    if (event.type === "entity") {
      const existing = event.entity.id ? this.entities.get(event.entity.id) : undefined;
      const merged = this.mergeEntity(existing?.zone ? { ...event.entity, zone: existing.zone } : event.entity);
      if (
        event.creating &&
        merged?.id &&
        !merged.cardId &&
        this.pendingKnownEntityReturn
      ) {
        this.pendingKnownEntityReturnCandidateIds.add(merged.id);
      }
      if (merged?.id) {
        this.reconcileInsertedDeckEntity(merged.id);
        this.resolvePendingUnknownDeckExit(merged, event.raw);
        this.resolveCurrentCardOutcomeFrame(merged);
        if (/\bFULL_ENTITY\b/.test(event.raw)) {
          this.recordFullEntityCardOutcome(merged);
        }
      }
      const info = event.entity.cardId ? this.cardInfoByCardId.get(normalizeCardId(event.entity.cardId)) : undefined;
      if (this.isKnownOpponentController(event.entity.controller) && info?.cardType === "英雄") {
        this.secretTracker.setOpponentClass(info.heroClasses?.[0]);
      }
      if (merged?.id && merged.zone === "SECRET" && merged.cardId && this.isKnownOpponentController(merged.controller)) {
        this.secretTracker.revealSecret(merged.id, merged.cardId);
      }
      return;
    }

    if (event.type === "attack-change") {
      this.mergeEntity({ id: event.entityId, attack: event.attack });
      return;
    }

    if (event.type === "action-boundary") {
      if (event.phase === "start") {
        const existing = event.entity?.id ? this.entities.get(event.entity.id) : undefined;
        const cardId = event.entity?.cardId ?? existing?.cardId;
        const controller = event.entity?.controller ?? existing?.controller;
        const info = this.findCardInfo(cardId, event.entity?.name ?? existing?.name);
        const isFriendlyPlay = event.action === "play" && this.isFriendlyController(controller);
        const isOpponentPlay = event.action === "play" && this.isKnownOpponentController(controller);
        const action = isFriendlyPlay && info?.cardType === "法术"
          ? "friendly-spell"
          : isFriendlyPlay && info?.cardType === "随从" ? "friendly-minion" : "other";
        if (this.gameActive && info && event.entity?.id && (isFriendlyPlay || isOpponentPlay)) {
          this.recordUsedCard(event.entity.id, info, isFriendlyPlay ? "friendly" : "opponent");
        }
        this.secretTracker.beginAction(action);
      } else this.secretTracker.endAction();
      return;
    }

    if (event.type === "controller") {
      const merged = this.mergeEntity({ id: event.entityId, controller: event.controller });
      if (merged?.id) {
        this.reconcileInsertedDeckEntity(merged.id);
      }
      return;
    }

    const existing = event.entityId ? this.entities.get(event.entityId) : undefined;
    const cardId = event.cardId ?? existing?.cardId;
    const cardName = this.resolveCardName(event.cardName ?? existing?.name, cardId);
    const controller = event.controller ?? existing?.controller;
    const fromZone = existing?.zone === event.toZone
      ? existing.zone
      : event.fromZone ?? existing?.zone;

    if (event.entityId && event.toZone === "HAND" && fromZone !== "HAND") {
      this.recordedCardPlayEntityIds.delete(event.entityId);
    }

    if (event.entityId && event.toZone === "PLAY" && fromZone !== "PLAY") {
      this.recordedDeathEntityIds.delete(event.entityId);
    }

    if (event.entityId) {
      const merged = this.mergeEntity({
        id: event.entityId,
        name: cardName,
        cardId,
        zone: event.toZone,
        controller
      });
      if (merged?.id) {
        this.reconcileInsertedDeckEntity(merged.id);
      }
    }

    const deckRow = this.resolveDeckRow(cardName, cardId) ?? this.resolveDeckRow(event.cardName ?? existing?.name, cardId);
    const isFriendly =
      this.isFriendlyController(controller) ||
      (deckRow !== undefined && controller === undefined) ||
      (this.friendlyController === undefined && this.collectionDecks.length === 0 && controller === 1 && deckRow !== undefined);
    const isOpponent = this.isKnownOpponentController(controller) || (this.friendlyController === undefined && controller !== undefined && !isFriendly);
    const cardInfo = this.findCardInfo(cardId, cardName);

    if (
      this.gameActive &&
      event.entityId &&
      fromZone === "PLAY" &&
      event.toZone === "GRAVEYARD" &&
      cardInfo?.cardType === "随从" &&
      (isFriendly || isOpponent)
    ) {
      this.recordDeadMinion(event.entityId, cardInfo, isFriendly ? "friendly" : "opponent");
    }

    if (event.entityId && isOpponent) {
      if (event.toZone === "SECRET") {
        this.secretTracker.enterSecret(event.entityId);
        if (cardId) this.secretTracker.revealSecret(event.entityId, cardId);
      } else if (fromZone === "SECRET") {
        if (cardId) this.secretTracker.revealSecret(event.entityId, cardId);
        this.secretTracker.leaveSecret(event.entityId);
      }
    }

    const insertedDeckRow = event.entityId ? this.getInsertedDeckRow(event.entityId) : undefined;
    if (!this.insertedDeckEntityRowKeys.has(event.entityId ?? "")) {
      this.updateFriendlyDeckSnapshot(isFriendly, fromZone, event.toZone);
    }

    if (!cardName) {
      if (
        event.entityId &&
        isFriendly &&
        fromZone === "DECK" &&
        event.toZone !== "DECK" &&
        event.toZone !== "HAND"
      ) {
        this.pendingUnknownDeckExitZones.set(event.entityId, event.toZone);
      }
      if (insertedDeckRow && fromZone !== event.toZone) {
        if (fromZone === "DECK") {
          decrementRemaining(insertedDeckRow);
          insertedDeckRow.drawn += 1;
        } else if (event.toZone === "DECK") {
          insertedDeckRow.remaining = Math.min(insertedDeckRow.count, insertedDeckRow.remaining + 1);
          insertedDeckRow.drawn = Math.max(0, insertedDeckRow.drawn - 1);
        }
      }
      return;
    }

    if (deckRow && isFriendly && cardId && !deckRow.cardId) {
      deckRow.cardId = cardId;
      this.deckRowsByCardId.set(normalizeCardId(cardId), deckRow);
    }

    if (
      this.gameActive &&
      fromZone === "DECK" &&
      event.toZone === "HAND" &&
      !deckRow &&
      this.deckRows.size === 0 &&
      this.isFriendlyController(controller)
    ) {
      const observation = this.observeFriendlyCard({
        cardName,
        rawCardName: event.cardName ?? existing?.name,
        cardId,
        kind: "draw",
        fromZone,
        toZone: event.toZone,
        raw: event.raw,
        applied: false
      });
      if (observation.applied) {
        return;
      }
    }

    if (this.gameActive && isFriendly && fromZone === "DECK" && event.toZone === "HAND" && !deckRow) {
      const generatedRow = this.getGeneratedDeckRow();
      const unresolvedRow = this.getUnresolvedDeckRow();
      const fallbackRow = generatedRow && generatedRow.remaining > 0
        ? generatedRow
        : unresolvedRow && unresolvedRow.remaining > 0
          ? unresolvedRow
          : undefined;
      if (fallbackRow) {
        decrementRemaining(fallbackRow);
        fallbackRow.drawn += 1;
        if (fallbackRow.unresolved && event.entityId) {
          this.unresolvedDrawEntityIds.add(event.entityId);
        }
        this.addEvent("draw", "friendly", { cardName, cardId, fromZone, toZone: event.toZone, raw: event.raw });
        return;
      }
    }

    if (deckRow && isFriendly && fromZone === "DECK" && event.toZone === "HAND") {
      decrementRemaining(deckRow);
      deckRow.drawn += 1;
      this.addEvent("draw", "friendly", { cardName, cardId, fromZone, toZone: event.toZone, raw: event.raw });
      return;
    }

    if (deckRow && isFriendly && fromZone === "DECK" && event.toZone !== "DECK") {
      decrementRemaining(deckRow);
      deckRow.drawn += 1;
      this.addEvent("zone-change", "friendly", { cardName, cardId, fromZone, toZone: event.toZone, raw: event.raw });
      if (event.toZone !== "PLAY") {
        return;
      }
    }

    if (deckRow && isFriendly && fromZone === "HAND" && event.toZone === "DECK") {
      deckRow.remaining = Math.min(deckRow.count, deckRow.remaining + 1);
      deckRow.drawn = Math.max(0, deckRow.drawn - 1);
      this.addEvent("zone-change", "friendly", { cardName, cardId, fromZone, toZone: event.toZone, raw: event.raw });
      return;
    }

    if (
      !deckRow &&
      isFriendly &&
      fromZone === "HAND" &&
      event.toZone === "DECK" &&
      event.entityId &&
      this.unresolvedDrawEntityIds.delete(event.entityId)
    ) {
      const unresolvedRow = this.getUnresolvedDeckRow();
      if (unresolvedRow) {
        unresolvedRow.remaining = Math.min(unresolvedRow.count, unresolvedRow.remaining + 1);
        unresolvedRow.drawn = Math.max(0, unresolvedRow.drawn - 1);
        this.addEvent("zone-change", "friendly", { cardName, cardId, fromZone, toZone: event.toZone, raw: event.raw });
      }
      return;
    }

    if (event.toZone === "PLAY") {
      if (!deckRow && this.deckRows.size === 0 && this.gameActive && this.isFriendlyController(controller)) {
        const observation = this.observeFriendlyCard({
          cardName,
          rawCardName: event.cardName ?? existing?.name,
          cardId,
          kind: "play",
          fromZone,
          toZone: event.toZone,
          raw: event.raw,
          applied: false
        });
        if (observation.applied) {
          return;
        }
      }

      if (isFriendly && deckRow) {
        deckRow.played += 1;
        this.addEvent("friendly-play", "friendly", { cardName, cardId, fromZone, toZone: event.toZone, raw: event.raw });
      } else if (isOpponent) {
        this.incrementOpponentPlayed(cardName, cardId);
        this.addEvent("opponent-play", "opponent", { cardName, cardId, fromZone, toZone: event.toZone, raw: event.raw });
      }
      return;
    }

    if (event.toZone !== fromZone) {
      this.addEvent("zone-change", isFriendly ? "friendly" : "unknown", {
        cardName,
        cardId,
        fromZone,
        toZone: event.toZone,
        raw: event.raw
      });
    }
  }

  private mergeEntity(entity: Partial<EntitySnapshot>) {
    if (!entity.id) {
      return undefined;
    }
    const current = this.entities.get(entity.id) ?? { id: entity.id };
    const next = { ...current, ...withoutUndefined(entity), id: entity.id };
    this.entities.set(entity.id, next);
    return next;
  }

  private finalizePendingKnownEntityReturn() {
    const source = this.pendingKnownEntityReturn;
    const candidates = source
      ? [...this.pendingKnownEntityReturnCandidateIds]
          .map((entityId) => this.entities.get(entityId))
          .filter((entity): entity is EntitySnapshot =>
            Boolean(
              entity?.id &&
              entity.zone === "HAND" &&
              entity.controller === source.controller &&
              !entity.cardId
            )
          )
      : [];
    if (source?.cardId && candidates.length === 1) {
      const [candidate] = candidates;
      this.entities.set(candidate.id!, {
        ...candidate,
        name: source.name,
        cardId: source.cardId
      });
    }
    this.pendingKnownEntityReturn = undefined;
    this.pendingKnownEntityReturnCandidateIds.clear();
  }

  private findKnownEntityStoredByAttachment(attachedEntityId: string): EntitySnapshot | undefined {
    const candidates = new Map<string, EntitySnapshot>();
    for (const linkEntity of this.entities.values()) {
      if (linkEntity.attachedToEntityId !== attachedEntityId || !linkEntity.storedEntityId) {
        continue;
      }
      const storedEntity = this.entities.get(linkEntity.storedEntityId);
      if (
        storedEntity?.id &&
        storedEntity.cardId &&
        storedEntity.controller !== undefined &&
        this.isKnownOpponentController(storedEntity.controller)
      ) {
        candidates.set(storedEntity.id, storedEntity);
      }
    }
    return candidates.size === 1 ? candidates.values().next().value : undefined;
  }

  private applyEntityDetailContinuation(line: string, events: readonly ParsedLogEvent[]) {
    const detailEvent = events.find((event): event is Extract<ParsedLogEvent, { type: "entity" }> => event.type === "entity");
    if (/(?:FULL_ENTITY|SHOW_ENTITY)\s+-\s+(?:Creating|Updating)\b/.test(line)) {
      this.pendingEntityDetail = detailEvent?.entity.id
        ? (this.entities.get(detailEvent.entity.id) ?? detailEvent.entity)
        : undefined;
      return;
    }

    const tag = line.match(/-\s+tag=([A-Z0-9_]+)\s+value=([^\s]+)/i);
    if (!tag) {
      this.pendingEntityDetail = undefined;
      return;
    }

    if (!this.pendingEntityDetail?.id) {
      return;
    }

    const [, tagName, tagValue] = tag;
    if (tagName === "CONTROLLER") {
      const controller = Number(tagValue);
      if (Number.isFinite(controller)) {
        this.pendingEntityDetail = this.mergeEntity({ ...this.pendingEntityDetail, controller });
      }
      return;
    }

    if (tagName === "ATK") {
      const attack = Number(tagValue);
      if (Number.isFinite(attack)) this.pendingEntityDetail = this.mergeEntity({ ...this.pendingEntityDetail, attack });
      return;
    }

    if (tagName === "CARDTYPE") {
      this.pendingEntityDetail = this.mergeEntity({ ...this.pendingEntityDetail, cardType: tagValue });
      return;
    }

    if (tagName === "ATTACHED" || tagName === "TAG_SCRIPT_DATA_NUM_1") {
      this.pendingEntityDetail = this.mergeEntity({
        ...this.pendingEntityDetail,
        ...(tagName === "ATTACHED"
          ? { attachedToEntityId: tagValue }
          : { storedEntityId: tagValue })
      });
      return;
    }

    if (tagName !== "ZONE") {
      return;
    }

    const toZone = normalizeZone(tagValue);
    this.applyParsedEvent({
      type: "zone-change",
      entityId: this.pendingEntityDetail.id,
      cardName: this.pendingEntityDetail.name,
      cardId: this.pendingEntityDetail.cardId,
      fromZone: this.pendingEntityDetail.zone,
      toZone,
      controller: this.pendingEntityDetail.controller,
      raw: line
    });
    this.pendingEntityDetail = this.entities.get(this.pendingEntityDetail.id) ?? {
      ...this.pendingEntityDetail,
      zone: toZone
    };
  }

  private incrementOpponentPlayed(cardName: string, cardId?: string) {
    const key = cardId ? normalizeCardId(cardId) : normalizeCardKey(cardName);
    const current = this.opponentRows.get(key) ?? {
      name: cardName,
      count: 0,
      remaining: 0,
      drawn: 0,
      played: 0,
      cardId
    };
    current.played += 1;
    this.opponentRows.set(key, current);
  }

  private buildBoardAttack() {
    let friendly = 0;
    let opponent = 0;
    for (const entity of this.entities.values()) {
      if (entity.zone !== "PLAY" || !entity.attack || entity.attack < 0) continue;
      const cardInfo = entity.cardId
        ? this.cardInfoByCardId.get(normalizeCardId(entity.cardId))
        : entity.name ? this.cardInfoByName.get(normalizeCardKey(entity.name)) : undefined;
      const cardType = (entity.cardType ?? cardInfo?.cardType)?.toLocaleUpperCase();
      if (cardType !== "随从" && cardType !== "MINION" && cardType !== "英雄" && cardType !== "HERO") continue;
      if (this.isFriendlyController(entity.controller)) friendly += entity.attack;
      else if (this.isKnownOpponentController(entity.controller)) opponent += entity.attack;
    }
    return { friendly, opponent };
  }

  private observeFriendlyCard(observation: FriendlyObservation) {
    this.friendlyObservations.push(observation);
    this.tryAutoMatchDeck();
    return observation;
  }

  private tryAutoMatchDeck() {
    if (
      !this.gameActive ||
      (this.deckRows.size > 0 && !this.usingUnmatchedDeckSnapshot) ||
      this.collectionDecks.length === 0 ||
      this.friendlyObservations.length === 0
    ) {
      return;
    }

    const matches = this.collectionDecks
      .filter((deck) => this.matchesFriendlyDeckSnapshot(deck))
      .map((deck) => ({ deck, score: scoreCollectionDeck(deck, this.friendlyObservations) }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score);

    if (matches.length === 0) {
      return;
    }

    const observedDistinctCards = new Set(this.friendlyObservations.map((observation) => observationKey(observation))).size;
    const best = matches[0];
    const second = matches[1];
    const isConfident = matches.length === 1 || (observedDistinctCards >= 2 && (!second || best.score > second.score));

    if (!isConfident) {
      return;
    }

    this.activateAutoMatchedDeck(best.deck);
  }

  private activateAutoMatchedDeck(deck: CollectionDeck) {
    const generatedDeckCard = this.createGeneratedDeckCard(deck);
    this.deckCards = [...deck.cards.map((card) => ({ ...card })), ...(generatedDeckCard ? [generatedDeckCard] : [])];
    this.deckCode = deck.rawDeckString;
    this.deckName = deck.name ?? "自动匹配套牌";
    this.autoMatchedDeckId = deck.id;
    this.deckRows = new Map(createEmptyDeckRows(this.deckCards).map((row) => [deckCardKey(row), row]));
    this.rebuildDeckCardIdIndex();
    this.initializeGeneratedDeckRow(generatedDeckCard);
    this.usingUnmatchedDeckSnapshot = false;
    this.error = undefined;
    this.addEvent("info", "friendly", { cardName: `已自动匹配：${this.deckName}` });
    this.applyPendingFriendlyObservations();
  }

  private activateExplicitDeck(deck: CollectionDeck, options: { expectedSize?: number }) {
    const missingDeckCard = this.createMissingCollectionDeckCard(deck, options.expectedSize);
    this.deckCards = [...deck.cards.map((card) => ({ ...card })), ...(missingDeckCard ? [missingDeckCard] : [])];
    this.deckCode = deck.rawDeckString;
    this.deckName = deck.name ?? "当前套牌";
    this.autoMatchedDeckId = deck.id;
    this.deckRows = new Map(createEmptyDeckRows(this.deckCards).map((row) => [deckCardKey(row), row]));
    this.rebuildDeckCardIdIndex();
    this.initializeMissingCollectionDeckRow(missingDeckCard, deck);
    this.usingUnmatchedDeckSnapshot = false;
    this.error = undefined;
    this.addEvent("info", "friendly", { cardName: `已读取当前套牌：${this.deckName}` });
    this.applyPendingFriendlyObservations();
  }

  private applyPendingFriendlyObservations() {
    for (const observation of this.friendlyObservations) {
      if (observation.applied) {
        continue;
      }

      const deckRow =
        this.resolveDeckRow(observation.cardName, observation.cardId) ?? this.resolveDeckRow(observation.rawCardName);
      if (!deckRow) {
        continue;
      }

      if (observation.cardId && !deckRow.cardId) {
        deckRow.cardId = observation.cardId;
        this.deckRowsByCardId.set(normalizeCardId(observation.cardId), deckRow);
      }

      if (observation.kind === "draw") {
        decrementRemaining(deckRow);
        deckRow.drawn += 1;
        this.addEvent("draw", "friendly", observationToEventPayload(observation));
      } else {
        deckRow.played += 1;
        this.addEvent("friendly-play", "friendly", observationToEventPayload(observation));
      }

      observation.applied = true;
    }
  }

  private rebuildDeckCardIdIndex() {
    this.deckRowsByCardId.clear();
    for (const row of this.deckRows.values()) {
      if (row.cardId) {
        this.deckRowsByCardId.set(normalizeCardId(row.cardId), row);
      }
    }
  }

  private matchesFriendlyDeckSnapshot(deck: CollectionDeck) {
    const expectedSize = this.friendlyDeckSnapshot?.baseDeckSize ?? this.friendlyDeckSnapshot?.initialDeckSize;
    return expectedSize === undefined || deck.cards.reduce((total, card) => total + card.count, 0) === expectedSize;
  }

  private createGeneratedDeckCard(deck: CollectionDeck): DeckCard | undefined {
    const snapshot = this.friendlyDeckSnapshot;
    const baseDeckSize = deck.cards.reduce((total, card) => total + card.count, 0);
    if (!snapshot || snapshot.baseDeckSize !== baseDeckSize) {
      return undefined;
    }

    const extraCards = snapshot.initialDeckSize - baseDeckSize;
    return extraCards > 0 ? { name: GENERATED_DECK_ROW_NAME, count: extraCards } : undefined;
  }

  private createMissingCollectionDeckCard(deck: CollectionDeck, expectedSize?: number): DeckCard | undefined {
    const targetSize = this.friendlyDeckSnapshot?.initialDeckSize ?? expectedSize;
    if (!targetSize) {
      return undefined;
    }

    const knownDeckSize = deck.cards.reduce((total, card) => total + card.count, 0);
    const missingCards = targetSize - knownDeckSize;
    return missingCards > 0 ? { name: MISSING_COLLECTION_DECK_ROW_NAME, count: missingCards } : undefined;
  }

  private initializeGeneratedDeckRow(generatedDeckCard: DeckCard | undefined) {
    if (!generatedDeckCard || !this.friendlyDeckSnapshot) {
      return;
    }

    const row = this.deckRows.get(deckCardKey(generatedDeckCard));
    if (!row) {
      return;
    }

    const baseDeckSize = this.friendlyDeckSnapshot.baseDeckSize ?? 0;
    const remaining = Math.max(0, Math.min(row.count, this.friendlyDeckSnapshot.remainingDeckSize - baseDeckSize));
    row.remaining = remaining;
    row.drawn = row.count - remaining;
  }

  private initializeMissingCollectionDeckRow(missingDeckCard: DeckCard | undefined, deck: CollectionDeck) {
    if (!missingDeckCard || !this.friendlyDeckSnapshot) {
      return;
    }

    const row = this.deckRows.get(deckCardKey(missingDeckCard));
    if (!row) {
      return;
    }

    const knownDeckSize = deck.cards.reduce((total, card) => total + card.count, 0);
    const remaining = Math.max(0, Math.min(row.count, this.friendlyDeckSnapshot.remainingDeckSize - knownDeckSize));
    row.remaining = remaining;
    row.drawn = row.count - remaining;
  }

  private getGeneratedDeckRow() {
    return this.deckRows.get(deckCardKey({ name: GENERATED_DECK_ROW_NAME }));
  }

  private getUnresolvedDeckRow() {
    return [...this.deckRows.values()].find((row) => row.unresolved);
  }

  private getInsertedDeckRow(entityId: string) {
    const rowKey = this.insertedDeckEntityRowKeys.get(entityId);
    return rowKey ? this.deckRows.get(rowKey) : undefined;
  }

  private reconcileInsertedDeckEntity(entityId: string) {
    if (!this.gameActive || !this.generatedEntityIds.has(entityId)) {
      return;
    }

    const entity = this.entities.get(entityId);
    if (!entity || entity.zone !== "DECK" || !this.isFriendlyController(entity.controller)) {
      return;
    }

    const resolvedName = this.resolveCardName(entity.name, entity.cardId);
    const targetRow = this.resolveDeckRow(resolvedName, entity.cardId);
    const targetName = targetRow?.name ?? resolvedName ?? INSERTED_UNKNOWN_DECK_ROW_NAME;
    const targetCardId = targetRow?.cardId ?? entity.cardId;
    const targetKey = targetRow
      ? deckCardKey(targetRow)
      : deckCardKey({ name: targetName, cardId: targetCardId });
    const currentKey = this.insertedDeckEntityRowKeys.get(entityId);

    if (!currentKey) {
      const row = targetRow ?? {
        name: targetName,
        count: 0,
        remaining: 0,
        drawn: 0,
        played: 0,
        cardId: targetCardId
      };
      row.count += 1;
      row.remaining += 1;
      if (!targetRow) {
        this.deckRows.set(targetKey, row);
        if (row.cardId) {
          this.deckRowsByCardId.set(normalizeCardId(row.cardId), row);
        }
      }
      this.insertedDeckEntityRowKeys.set(entityId, targetKey);
      return;
    }

    if (currentKey === targetKey) {
      const row = this.deckRows.get(currentKey);
      if (row && row.name === INSERTED_UNKNOWN_DECK_ROW_NAME && resolvedName) {
        row.name = resolvedName;
      }
      return;
    }

    const currentRow = this.deckRows.get(currentKey);
    if (currentRow) {
      currentRow.count = Math.max(0, currentRow.count - 1);
      currentRow.remaining = Math.max(0, currentRow.remaining - 1);
      if (currentRow.count === 0) {
        this.deckRows.delete(currentKey);
      }
    }

    const row = targetRow ?? {
      name: targetName,
      count: 0,
      remaining: 0,
      drawn: 0,
      played: 0,
      cardId: targetCardId
    };
    row.count += 1;
    row.remaining += 1;
    if (!targetRow) {
      this.deckRows.set(targetKey, row);
      if (row.cardId) {
        this.deckRowsByCardId.set(normalizeCardId(row.cardId), row);
      }
    }
    this.insertedDeckEntityRowKeys.set(entityId, targetKey);
  }

  private updateFriendlyDeckSnapshot(isFriendly: boolean, fromZone: Zone | undefined, toZone: Zone) {
    const snapshot = this.friendlyDeckSnapshot;
    if (!snapshot || !isFriendly) {
      return;
    }

    const delta = fromZone === "DECK" && toZone !== "DECK"
      ? -1
      : fromZone !== "DECK" && toZone === "DECK"
        ? 1
        : 0;
    if (delta === 0) {
      return;
    }

    this.friendlyDeckSnapshot = {
      ...snapshot,
      remainingDeckSize: Math.max(0, Math.min(snapshot.initialDeckSize, snapshot.remainingDeckSize + delta))
    };
  }

  private resolveDeckRow(cardName?: string, cardId?: string): CardTrackerRow | undefined {
    if (cardId) {
      const row = this.deckRowsByCardId.get(normalizeCardId(cardId));
      if (row) {
        return row;
      }
    }

    if (!cardName) {
      return undefined;
    }

    const matches = [...this.deckRows.values()].filter((row) => normalizeCardKey(row.name) === normalizeCardKey(cardName));
    if (matches.length !== 1) {
      return undefined;
    }

    const row = matches[0];
    return cardId && row.cardId ? undefined : row;
  }

  private buildFriendlyZoneCards(zones: ReadonlySet<Zone>): TrackerZoneCard[] {
    if (this.friendlyController === undefined) {
      return [];
    }

    const cards = new Map<string, TrackerZoneCard>();
    for (const entity of this.entities.values()) {
      if (entity.controller !== this.friendlyController || !entity.zone || !zones.has(entity.zone)) {
        continue;
      }

      const card = this.resolveTrackerZoneCard(entity) ?? (
        zones === FRIENDLY_HAND_ZONES && !this.isKnownNonDisplayableEntity(entity)
          ? { name: UNRESOLVED_HAND_CARD_NAME, count: 1 }
          : undefined
      );
      if (!card) {
        continue;
      }

      const key = card.cardId ? `id:${normalizeCardId(card.cardId)}` : `name:${normalizeCardKey(card.name)}`;
      const current = cards.get(key);
      if (current) {
        current.count += 1;
      } else {
        cards.set(key, card);
      }
    }

    return [...cards.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  private resolveTrackerZoneCard(entity: EntitySnapshot): TrackerZoneCard | undefined {
    const deckRow = this.resolveDeckRow(entity.name, entity.cardId);
    const cardInfo =
      this.findCardInfo(entity.cardId, entity.name) ?? this.findCardInfo(deckRow?.cardId, deckRow?.name);
    const displayClassification = cardInfo ? classifyCardInfo(cardInfo) : "unknown";

    if (displayClassification === "non-displayable") {
      return undefined;
    }

    if (!deckRow && displayClassification !== "displayable") {
      return undefined;
    }

    const name = deckRow?.name ?? cardInfo?.name ?? entity.name;
    if (!name) {
      return undefined;
    }

    const cardId = deckRow?.cardId ?? entity.cardId ?? cardInfo?.cardId ?? cardInfo?.id;
    return {
      name,
      count: 1,
      ...(cardId ? { cardId } : {}),
      ...(cardInfo && this.cardDatabase ? { details: this.buildFriendlyCardDetails(cardInfo) } : {})
    };
  }

  private buildOpponentZones() {
    const deck = new Map<string, TrackerZoneCard>();
    const hand = new Map<string, TrackerZoneCard>();
    const other = new Map<string, TrackerZoneCard>();
    let deckCount = 0;
    let handCount = 0;

    for (const entity of this.entities.values()) {
      if (!this.isKnownOpponentController(entity.controller) || !entity.zone) continue;
      if (entity.zone === "DECK") deckCount += 1;
      if (entity.zone === "HAND") handCount += 1;

      const target = entity.zone === "DECK"
        ? deck
        : entity.zone === "HAND"
          ? hand
          : OPPONENT_OTHER_ZONES.has(entity.zone) ? other : undefined;
      if (!target) continue;

      const card = this.resolveOpponentZoneCard(entity);
      if (!card) {
        continue;
      }
      addZoneCard(target, card);
    }

    return {
      deck: sortZoneCards(deck.values()),
      hand: sortZoneCards(hand.values()),
      other: sortZoneCards(other.values()),
      deckCount,
      handCount
    };
  }

  private buildGlobalEffects(effects: ReadonlyMap<string, EntitySnapshot>) {
    const cards = new Map<string, TrackerZoneCard>();
    for (const entity of effects.values()) {
      const cardInfo = this.findCardInfo(entity.cardId, entity.name);
      const name = cardInfo?.name ?? entity.name;
      if (!name) continue;
      const cardId = entity.cardId ?? cardInfo?.cardId ?? cardInfo?.id;
      addZoneCard(cards, {
        name,
        count: 1,
        ...(cardId ? { cardId } : {}),
        ...(cardInfo && this.cardDatabase ? { details: toCardDetails(this.cardDatabase, cardInfo) } : {})
      });
    }
    return sortZoneCards(cards.values());
  }

  private resolveOpponentZoneCard(entity: EntitySnapshot): TrackerZoneCard | undefined {
    const cardInfo = this.findCardInfo(entity.cardId, entity.name);
    if (cardInfo && classifyCardInfo(cardInfo) === "non-displayable") return undefined;
    const name = cardInfo?.name ?? entity.name;
    if (!name) return undefined;
    const cardId = entity.cardId ?? cardInfo?.cardId ?? cardInfo?.id;
    return {
      name,
      count: 1,
      ...(cardId ? { cardId } : {}),
      ...(cardInfo && this.cardDatabase ? { details: this.buildOpponentCardDetails(cardInfo) } : {})
    };
  }

  private isKnownNonDisplayableEntity(entity: EntitySnapshot): boolean {
    const cardInfo = this.findCardInfo(entity.cardId, entity.name);
    return cardInfo !== undefined && classifyCardInfo(cardInfo) === "non-displayable";
  }

  private findCardInfo(cardId?: string, name?: string): CardInfo | undefined {
    return (
      (cardId ? this.cardInfoByCardId.get(normalizeCardId(cardId)) : undefined) ??
      (name ? this.cardInfoByName.get(normalizeCardKey(name)) : undefined)
    );
  }

  private isFriendlyController(controller?: number) {
    return this.friendlyController !== undefined && controller === this.friendlyController;
  }

  private isKnownOpponentController(controller?: number) {
    return this.friendlyController !== undefined && controller !== undefined && controller !== this.friendlyController;
  }

  private rememberPlayerIdentity(playerId: number, playerName: string) {
    const normalizedName = normalizePlayerIdentityName(playerName);
    if (!normalizedName) {
      return;
    }
    this.playerIdentityIds.add(playerId);
    if (normalizedName === "UNKNOWN HUMAN PLAYER") {
      this.unknownPlayerIds.add(playerId);
      return;
    }

    this.playerIdByName.set(normalizedName, playerId);
    const withoutBattleTag = normalizedName.replace(/#\d+$/, "");
    if (withoutBattleTag !== normalizedName) {
      this.playerIdByName.set(withoutBattleTag, playerId);
    }
  }

  private updatePlayerCounter(event: Extract<ParsedLogEvent, { type: "player-counter" }>) {
    const playerId = event.playerId ?? this.resolveCounterPlayerId(event.playerName);
    if (playerId === undefined || event.value < 0) {
      return;
    }

    let counters: PlayerMatchCounters = this.matchCountersByPlayerId.get(playerId) ?? {};
    if (event.counter === "fatigue") {
      if (event.value > 0) {
        counters = { ...counters, nextFatigueDamage: event.value + 1 };
      } else {
        const { nextFatigueDamage: _nextFatigueDamage, ...remainingCounters } = counters;
        counters = remainingCounters;
      }
    } else if (event.counter === "corpses") {
      counters = { ...counters, corpses: event.value };
    } else {
      counters = { ...counters, spellsPlayed: event.value };
    }

    if (Object.keys(counters).length > 0) {
      this.matchCountersByPlayerId.set(playerId, counters);
    } else {
      this.matchCountersByPlayerId.delete(playerId);
    }
  }

  private resolveCounterPlayerId(playerName?: string) {
    const normalizedName = normalizePlayerIdentityName(playerName);
    if (!normalizedName) {
      return undefined;
    }

    const exactPlayerId = this.playerIdByName.get(normalizedName);
    if (exactPlayerId !== undefined) {
      return exactPlayerId;
    }

    return this.playerIdentityIds.size === 2 && this.unknownPlayerIds.size === 1
      ? this.unknownPlayerIds.values().next().value
      : undefined;
  }

  private buildMatchCounters(): PublicTrackerState["matchCounters"] {
    if (this.friendlyController === undefined || this.matchCountersByPlayerId.size === 0) {
      return undefined;
    }

    const friendly = this.matchCountersByPlayerId.get(this.friendlyController) ?? {};
    let opponent: PlayerMatchCounters = {};
    for (const [playerId, counters] of this.matchCountersByPlayerId) {
      if (playerId !== this.friendlyController) {
        opponent = { ...opponent, ...counters };
      }
    }

    return {
      friendly: { ...friendly },
      opponent
    };
  }

  private clearMatchCounters() {
    this.playerIdByName.clear();
    this.playerIdentityIds.clear();
    this.unknownPlayerIds.clear();
    this.matchCountersByPlayerId.clear();
  }

  private shouldWaitForFriendlyController(event: ParsedLogEvent) {
    if (this.friendlyController !== undefined || this.collectionDecks.length === 0 || event.type !== "zone-change") {
      return false;
    }

    const controller = event.controller;
    if (controller === undefined) {
      return false;
    }

    return (event.fromZone === "DECK" && event.toZone === "HAND") || event.toZone === "PLAY";
  }

  private resolveCardName(rawName?: string, cardId?: string): string | undefined {
    if (cardId) {
      const deckRow = this.deckRowsByCardId.get(normalizeCardId(cardId));
      if (deckRow) {
        return deckRow.name;
      }

      const localizedName = this.cardNameByCardId.get(normalizeCardId(cardId));
      if (localizedName) {
        return localizedName;
      }
    }

    return rawName;
  }

  private addEvent(kind: TrackerEvent["kind"], player: TrackerEvent["player"], payload: Partial<TrackerEvent>) {
    this.eventCounter += 1;
    this.events.push({
      id: `${Date.now()}-${this.eventCounter}`,
      at: new Date().toISOString(),
      kind,
      player,
      ...payload
    });
  }

  private withCardDetails(row: CardTrackerRow, context: "none" | "friendly" | "opponent" | true = "none"): CardTrackerRow {
    if (!this.cardDatabase) {
      return row;
    }

    const card = (row.cardId ? this.cardInfoByCardId.get(normalizeCardId(row.cardId)) : undefined) ?? this.cardInfoByName.get(normalizeCardKey(row.name));
    if (!card) {
      return row;
    }

    const details = context === "friendly" || context === true
      ? this.buildFriendlyCardDetails(card)
      : context === "opponent"
        ? this.buildOpponentCardDetails(card)
        : toCardDetails(this.cardDatabase, card);
    return { ...row, details };
  }

  private recordUsedCard(entityId: string, card: CardInfo, player: "friendly" | "opponent") {
    if (this.recordedCardPlayEntityIds.has(entityId)) {
      return;
    }

    this.recordedCardPlayEntityIds.add(entityId);
    (player === "friendly" ? this.friendlyCardsUsedThisGame : this.opponentCardsUsedThisGame).push(card);
  }

  private recordDeadMinion(entityId: string, card: CardInfo, player: "friendly" | "opponent") {
    if (this.recordedDeathEntityIds.has(entityId)) {
      return;
    }

    this.recordedDeathEntityIds.add(entityId);
    (player === "friendly" ? this.friendlyDeadMinionsThisGame : this.opponentDeadMinionsThisGame).push(card);
  }

  private clearMatchCardHistory() {
    this.friendlyCardsUsedThisGame = [];
    this.opponentCardsUsedThisGame = [];
    this.friendlyDeadMinionsThisGame = [];
    this.opponentDeadMinionsThisGame = [];
    this.recordedCardPlayEntityIds.clear();
    this.recordedDeathEntityIds.clear();
    this.pendingUnknownDeckExitZones.clear();
    this.cardOutcomeBlockStack = [];
    this.friendlyCardOutcomes.clear();
    this.opponentCardOutcomes.clear();
    this.completedCardOutcomeKeys.clear();
    this.lastBlockBoundaryFingerprint = undefined;
  }

  private buildFriendlyCardDetails(card: CardInfo): CardDetails {
    const details = toCardDetails(this.cardDatabase!, card);
    const cardId = normalizeCardId(card.cardId ?? card.id ?? "");
    const history = {
      friendlyUsed: this.friendlyCardsUsedThisGame,
      opponentUsed: this.opponentCardsUsedThisGame,
      friendlyDeadMinions: this.friendlyDeadMinionsThisGame,
      opponentDeadMinions: this.opponentDeadMinionsThisGame
    };
    const gameContextSections = resolveMatchCardRelations(card, history);
    const playedSpellsThisGame = cardId === GALACTIC_PROJECTION_ORB_CARD_ID
      ? this.friendlyCardsUsedThisGame.filter((usedCard) => usedCard.cardType === "法术")
      : undefined;
    const cardOutcomeSections = this.buildCardOutcomeSections(card, this.friendlyCardOutcomes);
    return {
      ...details,
      ...(gameContextSections.length > 0 ? { gameContextSections } : {}),
      ...(cardOutcomeSections.length > 0 ? { cardOutcomeSections } : {}),
      ...(playedSpellsThisGame ? { playedSpellsThisGame } : {})
    };
  }

  private buildOpponentCardDetails(card: CardInfo): CardDetails {
    const details = toCardDetails(this.cardDatabase!, card);
    const cardOutcomeSections = this.buildCardOutcomeSections(card, this.opponentCardOutcomes);
    return {
      ...details,
      ...(cardOutcomeSections.length > 0 ? { cardOutcomeSections } : {})
    };
  }

  private applyCardOutcomeBoundary(event: Extract<ParsedLogEvent, { type: "block-boundary" }>) {
    const fingerprint = blockBoundaryFingerprint(event);
    if (event.phase === "start" && fingerprint === this.lastBlockBoundaryFingerprint) {
      return;
    }
    this.lastBlockBoundaryFingerprint = event.phase === "start" ? fingerprint : undefined;

    if (event.phase === "end") {
      const frame = this.cardOutcomeBlockStack.pop();
      if (frame?.capture && !frame.suppressed) {
        this.completeCardOutcome(frame.capture, frame.side);
      }
      return;
    }

    const parent = this.cardOutcomeBlockStack.at(-1);
    const rootKey = `${event.blockType ?? "UNKNOWN"}:${event.entity?.id ?? "unknown"}:${fingerprint}`;
    const frame: CardOutcomeBlockFrame = {
      key: rootKey,
      blockType: event.blockType,
      entityId: event.entity?.id,
      parentCards: parent?.cards,
      parentSourceEntityId: parent?.sourceEntityId,
      parentAcceptsFullEntityOutcomes: parent?.acceptsFullEntityOutcomes,
      side: this.cardOutcomeSide(event.entity?.controller) ?? parent?.side,
      suppressed: parent?.suppressed || (!parent && this.completedCardOutcomeKeys.has(rootKey))
    };
    this.cardOutcomeBlockStack.push(frame);
    if (!frame.suppressed) {
      const existing = event.entity?.id ? this.entities.get(event.entity.id) : undefined;
      const entity = existing ? { ...existing, ...event.entity } : event.entity;
      if (entity) {
        this.configureCardOutcomeFrame(frame, entity);
      }
    }
  }

  private resolveCurrentCardOutcomeFrame(entity: EntitySnapshot) {
    const frame = [...this.cardOutcomeBlockStack]
      .reverse()
      .find((candidate) => !candidate.configured && candidate.entityId === entity.id);
    if (frame && !frame.suppressed) {
      this.configureCardOutcomeFrame(frame, entity);
    }
  }

  private configureCardOutcomeFrame(frame: CardOutcomeBlockFrame, entity: EntitySnapshot) {
    const card = this.findCardInfo(entity.cardId, entity.name);
    if (!card) {
      return;
    }
    frame.configured = true;
    frame.side ??= this.cardOutcomeSide(entity.controller);

    if (card.cardType !== "法术") {
      frame.cards = frame.parentCards;
      frame.sourceEntityId = frame.parentSourceEntityId;
      frame.acceptsFullEntityOutcomes = frame.parentAcceptsFullEntityOutcomes;
      return;
    }

    if (entity.id && entity.id === frame.parentSourceEntityId) {
      frame.cards = frame.parentCards;
      frame.sourceEntityId = frame.parentSourceEntityId;
      frame.acceptsFullEntityOutcomes = frame.parentAcceptsFullEntityOutcomes;
      return;
    }

    if (frame.parentCards) {
      const node = frame.parentCards.find((candidate) => candidate.entityId === entity.id) ?? {
        key: frame.key,
        entityId: entity.id,
        card,
        children: []
      };
      if (!frame.parentCards.includes(node)) {
        frame.parentCards.push(node);
      }
      frame.cards = node.children;
    } else {
      frame.cards = [];
    }
    frame.sourceEntityId = entity.id;
    frame.acceptsFullEntityOutcomes = isRandomSpellPoolCard(card);
    if (!frame.parentCards) {
      frame.capture = {
        key: frame.key,
        source: card,
        cards: frame.cards,
        keepWhenEmpty: isRandomSpellPoolCard(card)
      };
    }
  }

  private recordFullEntityCardOutcome(entity: EntitySnapshot) {
    const frame = this.cardOutcomeBlockStack.at(-1);
    if (
      !frame?.cards ||
      !frame.acceptsFullEntityOutcomes ||
      frame.suppressed ||
      !entity.id ||
      entity.id === frame.sourceEntityId
    ) {
      return;
    }
    const card = this.findCardInfo(entity.cardId, entity.name);
    if (card?.cardType !== "法术" || frame.cards.some((candidate) => candidate.entityId === entity.id)) {
      return;
    }
    frame.cards.push({
      key: `entity:${entity.id}`,
      entityId: entity.id,
      card,
      children: []
    });
  }

  private completeCardOutcome(outcome: RecordedCardOutcome, side: CardOutcomeSide | undefined) {
    if (!side || (!outcome.keepWhenEmpty && outcome.cards.length === 0) || this.completedCardOutcomeKeys.has(outcome.key)) {
      return;
    }
    this.completedCardOutcomeKeys.add(outcome.key);
    const target = side === "friendly" ? this.friendlyCardOutcomes : this.opponentCardOutcomes;
    const cardId = normalizeCardId(outcome.source.cardId ?? outcome.source.id ?? "");
    if (!cardId) {
      return;
    }
    const records = target.get(cardId) ?? [];
    records.push(outcome);
    target.set(cardId, records);
  }

  private buildCardOutcomeSections(
    card: CardInfo,
    outcomesByCardId: ReadonlyMap<string, readonly RecordedCardOutcome[]>
  ): readonly CardOutcomeSection[] {
    const cardId = normalizeCardId(card.cardId ?? card.id ?? "");
    const outcomes = outcomesByCardId.get(cardId) ?? [];
    return outcomes.map((outcome, index) => ({
      key: outcome.key,
      title: outcomes.length === 1 ? "本次实际施放" : `第${index + 1}次实际施放`,
      emptyText: "日志中没有识别到实际施放的法术",
      cards: outcome.cards.map(toPublicCardOutcomeNode)
    }));
  }

  private cardOutcomeSide(controller: number | undefined): CardOutcomeSide | undefined {
    return this.isFriendlyController(controller)
      ? "friendly"
      : this.isKnownOpponentController(controller) ? "opponent" : undefined;
  }

  private resolvePendingUnknownDeckExit(entity: EntitySnapshot, raw: string) {
    if (!entity.id || !entity.cardId || !this.pendingUnknownDeckExitZones.has(entity.id)) {
      return;
    }
    const toZone = this.pendingUnknownDeckExitZones.get(entity.id)!;
    this.pendingUnknownDeckExitZones.delete(entity.id);
    const card = this.findCardInfo(entity.cardId, entity.name);
    const deckRow = this.resolveDeckRow(card?.name ?? entity.name, entity.cardId);
    if (!deckRow) {
      return;
    }
    if (!deckRow.cardId) {
      deckRow.cardId = entity.cardId;
      this.deckRowsByCardId.set(normalizeCardId(entity.cardId), deckRow);
    }
    decrementRemaining(deckRow);
    deckRow.drawn += 1;
    this.addEvent("zone-change", "friendly", {
      cardName: card?.name ?? entity.name,
      cardId: entity.cardId,
      fromZone: "DECK",
      toZone,
      raw
    });
  }
}

function toPublicCardOutcomeNode(node: RecordedCardOutcomeNode): CardOutcomeNode {
  return {
    key: node.key,
    card: toRelatedCardInfo(node.card),
    ...(node.children.length > 0 ? { children: node.children.map(toPublicCardOutcomeNode) } : {})
  };
}

function blockBoundaryFingerprint(event: Extract<ParsedLogEvent, { type: "block-boundary" }>): string {
  const timestamp = event.raw.match(/\b\d{2}:\d{2}:\d{2}\.\d+\b/)?.[0] ?? "";
  const boundary = event.raw.slice(Math.max(event.raw.indexOf("BLOCK_START"), event.raw.indexOf("BLOCK_END")));
  return `${event.phase}:${timestamp}:${boundary}`;
}

function scoreCollectionDeck(deck: CollectionDeck, observations: readonly FriendlyObservation[]): number {
  const deckCounts = buildDeckCountIndex(deck.cards);
  const observedCounts = new Map<string, number>();
  let score = 0;

  for (const observation of observations) {
    const keys = observationKeys(observation);
    const key = keys.find((candidateKey) => deckCounts.has(candidateKey));
    if (!key) {
      return 0;
    }

    const nextObservedCount = (observedCounts.get(key) ?? 0) + 1;
    if (nextObservedCount > (deckCounts.get(key) ?? 0)) {
      return 0;
    }

    observedCounts.set(key, nextObservedCount);
    score += observation.cardId ? 3 : 1;
  }

  return score;
}

function buildDeckCountIndex(cards: readonly DeckCard[]) {
  const index = new Map<string, number>();
  for (const card of cards) {
    if (card.cardId) {
      index.set(`id:${normalizeCardId(card.cardId)}`, card.count);
    }
    index.set(`name:${normalizeCardKey(card.name)}`, card.count);
  }
  return index;
}

function observationKeys(observation: FriendlyObservation) {
  const keys = [`name:${normalizeCardKey(observation.cardName)}`];
  if (observation.rawCardName && normalizeCardKey(observation.rawCardName) !== normalizeCardKey(observation.cardName)) {
    keys.push(`name:${normalizeCardKey(observation.rawCardName)}`);
  }
  if (observation.cardId) {
    keys.unshift(`id:${normalizeCardId(observation.cardId)}`);
  }
  return keys;
}

function observationKey(observation: FriendlyObservation) {
  return observation.cardId ? `id:${normalizeCardId(observation.cardId)}` : `name:${normalizeCardKey(observation.cardName)}`;
}

function observationToEventPayload(observation: FriendlyObservation): Partial<TrackerEvent> {
  return {
    cardName: observation.cardName,
    cardId: observation.cardId,
    fromZone: observation.fromZone,
    toZone: observation.toZone,
    raw: observation.raw
  };
}

function decrementRemaining(row: CardTrackerRow) {
  row.remaining = Math.max(0, row.remaining - 1);
}

function addZoneCard(cards: Map<string, TrackerZoneCard>, card: TrackerZoneCard) {
  const key = card.cardId ? `id:${normalizeCardId(card.cardId)}` : `name:${normalizeCardKey(card.name)}`;
  const current = cards.get(key);
  if (current) current.count += card.count;
  else cards.set(key, card);
}

function sortZoneCards(cards: Iterable<TrackerZoneCard>, firstName?: string) {
  return [...cards].sort((left, right) => {
    if (left.name === firstName) return -1;
    if (right.name === firstName) return 1;
    return left.name.localeCompare(right.name);
  });
}

function normalizeCardKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

function normalizePlayerIdentityName(name?: string) {
  return name?.replace(/\s+/g, " ").trim().toLocaleUpperCase();
}

function classifyCardInfo(card: CardInfo): "displayable" | "non-displayable" | "unknown" {
  if (card.cardTypeId !== undefined) {
    if (NON_DISPLAYABLE_CARD_TYPE_IDS.has(card.cardTypeId)) {
      return "non-displayable";
    }
    return DISPLAYABLE_CARD_TYPE_IDS.has(card.cardTypeId) ? "displayable" : "non-displayable";
  }

  if (card.cardType) {
    const cardType = card.cardType.replace(/[\s_-]+/g, "").toUpperCase();
    if (NON_DISPLAYABLE_CARD_TYPES.has(cardType)) {
      return "non-displayable";
    }
    return DISPLAYABLE_CARD_TYPES.has(cardType) ? "displayable" : "non-displayable";
  }

  const cardId = card.cardId ?? card.id;
  return cardId && /^HERO_/i.test(cardId) ? "non-displayable" : "unknown";
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
