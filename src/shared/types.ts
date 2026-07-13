import type { CardDetails } from "./cardDatabase.js";
import type { ArenaCardRating, ArenaScoreQuality } from "./arenaRatings.js";

export type Zone = "DECK" | "HAND" | "PLAY" | "GRAVEYARD" | "REMOVEDFROMGAME" | "SETASIDE" | "SECRET" | "UNKNOWN";

export type EventKind =
  | "game-start"
  | "game-end"
  | "draw"
  | "friendly-play"
  | "opponent-play"
  | "arena-pick"
  | "zone-change"
  | "info";

export interface DeckCard {
  name: string;
  count: number;
  cardId?: string;
  rawLine?: string;
  details?: CardDetails;
}

export interface DeckImport {
  cards: DeckCard[];
  rawCode?: string;
  warnings: string[];
}

export interface CardTrackerRow {
  name: string;
  count: number;
  remaining: number;
  drawn: number;
  played: number;
  cardId?: string;
  details?: CardDetails;
}

export interface TrackerZoneCard {
  name: string;
  count: number;
  cardId?: string;
  details?: CardDetails;
}

export interface TrackerEvent {
  id: string;
  at: string;
  kind: EventKind;
  player: "friendly" | "opponent" | "unknown";
  cardName?: string;
  fromZone?: Zone;
  toZone?: Zone;
  raw?: string;
  cardId?: string;
}

export interface TrackerSummary {
  totalCards: number;
  remainingCards: number;
  drawnCards: number;
  opponentPlayedCount: number;
}

export type ArenaStatus = "inactive" | "drafting" | "redrafting" | "complete" | "playing";

export interface ArenaCardChoice {
  readonly name: string;
  readonly count: number;
  readonly cardId?: string;
  readonly entityId?: string;
  readonly score?: number;
  readonly scoreSource?: string;
  readonly details?: CardDetails;
  readonly quality?: ArenaScoreQuality;
  readonly rating?: ArenaCardRating;
}

export interface ArenaHero {
  readonly name: string;
  readonly cardId?: string;
  readonly className?: string;
}

export interface ArenaPick {
  readonly slot: number;
  readonly chosen: ArenaCardChoice;
  readonly offered: readonly ArenaCardChoice[];
  readonly at: string;
}

export interface ArenaState {
  readonly status: ArenaStatus;
  readonly hero?: ArenaHero;
  readonly currentChoices: readonly ArenaCardChoice[];
  readonly picks: readonly ArenaPick[];
  readonly deck: readonly DeckCard[];
  readonly draftCount: number;
  readonly scoreSource?: string;
  readonly ratingsVersion?: number;
  readonly lastUpdated?: string;
  readonly error?: string;
}

export interface PublicTrackerState {
  status: "idle" | "watching" | "paused" | "missing-log" | "error";
  gameActive?: boolean;
  logPath?: string;
  arenaLogPath?: string;
  constructedScreenMode?: "standard" | "wild";
  deckCode?: string;
  deckName?: string;
  autoMatchedDeckId?: string;
  deck: CardTrackerRow[];
  friendlyHand?: TrackerZoneCard[];
  friendlyOther?: TrackerZoneCard[];
  opponentPlayed: CardTrackerRow[];
  opponentSecrets?: OpponentSecretSlot[];
  boardAttack?: BoardAttackSummary;
  events: TrackerEvent[];
  summary: TrackerSummary;
  arena?: ArenaState;
  lastUpdated?: string;
  error?: string;
}

export interface CardLibraryQuery {
  readonly query?: string;
  readonly heroClass?: string;
  readonly cardType?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface NormalizedCardLibraryQuery {
  readonly query: string;
  readonly heroClass?: string;
  readonly cardType?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface CardLibraryResult {
  readonly status: "ok" | "error";
  readonly query: string;
  readonly heroClass?: string;
  readonly cardType?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly items: readonly CardDetails[];
  readonly heroClasses: readonly string[];
  readonly cardTypes: readonly string[];
  readonly source?: string;
  readonly version?: string;
  readonly warnings: readonly string[];
  readonly error?: string;
}

export interface CardPreviewAnchorRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface CardPreviewRequest {
  readonly details: CardDetails;
  readonly anchorRect: CardPreviewAnchorRect;
}

export interface EntitySnapshot {
  id?: string;
  name?: string;
  cardId?: string;
  zone?: Zone;
  controller?: number;
  attack?: number;
  cardType?: string;
}

export interface SecretCandidate {
  readonly cardId: string;
  readonly name: string;
  readonly status: "possible" | "excluded";
  readonly details?: CardDetails;
}

export interface OpponentSecretSlot {
  readonly entityId: string;
  readonly candidates: readonly SecretCandidate[];
  readonly revealedCardId?: string;
}

export interface BoardAttackSummary {
  readonly friendly: number;
  readonly opponent: number;
}

export interface AttackLogEvent {
  type: "attack-change";
  entityId?: string;
  attack: number;
  raw: string;
}

export interface ActionBoundaryLogEvent {
  type: "action-boundary";
  phase: "start" | "end";
  action: "play" | "other";
  entity?: EntitySnapshot;
  raw: string;
}

export interface ZoneChangeLogEvent {
  type: "zone-change";
  entityId?: string;
  cardName?: string;
  cardId?: string;
  fromZone?: Zone;
  toZone: Zone;
  controller?: number;
  raw: string;
}

export interface EntityLogEvent {
  type: "entity";
  entity: EntitySnapshot;
  raw: string;
}

export interface ControllerLogEvent {
  type: "controller";
  entityId?: string;
  controller: number;
  raw: string;
}

export interface GameStartLogEvent {
  type: "game-start";
  raw: string;
}

export interface GameEndLogEvent {
  type: "game-end";
  raw: string;
}

export type ParsedLogEvent = ZoneChangeLogEvent | EntityLogEvent | ControllerLogEvent | AttackLogEvent | ActionBoundaryLogEvent | GameStartLogEvent | GameEndLogEvent;

export interface LogCandidate {
  path: string;
  label: string;
  exists: boolean;
  modifiedAt?: string;
}

export interface PublicLogConfigStatus {
  path: string;
  exists: boolean;
  hasPowerLog: boolean;
  hasZoneLog: boolean;
  hasDecksLog: boolean;
  hasArenaLog: boolean;
  backupPath?: string;
}

export type HearthstoneZone = Zone | "INVALID";

export type LogSource = "Power.log" | "Player.log";

export interface DeckImportResult {
  readonly name?: string;
  readonly heroClass?: string;
  readonly format?: string;
  readonly rawDeckString?: string;
  readonly cards: readonly DeckCard[];
  readonly warnings: readonly string[];
  readonly sourceText: string;
}

export interface CollectionDeck {
  readonly id: string;
  readonly deckId?: string;
  readonly name?: string;
  readonly heroClass?: string;
  readonly format?: string;
  readonly mode?: string;
  readonly cards: readonly DeckCard[];
  readonly rawDeckString?: string;
  readonly rawText: string;
  readonly sourcePath: string;
  readonly updatedAt: string;
  readonly warnings: readonly string[];
}

export interface CollectionDeckSummary {
  readonly id: string;
  readonly deckId?: string;
  readonly name?: string;
  readonly heroClass?: string;
  readonly format?: string;
  readonly mode?: string;
  readonly cardCount?: number;
  readonly cards?: readonly DeckCard[];
  readonly rawDeckString?: string;
  readonly sourcePath?: string;
  readonly updatedAt?: string;
  readonly warnings?: readonly string[];
}

export interface CollectionDeckScanResult {
  readonly status: "ok" | "missing-log" | "error" | "stale";
  readonly decks: readonly CollectionDeckSummary[];
  readonly activeDeck?: CollectionDeck;
  readonly updatedAt?: string;
  readonly sourcePath?: string;
  readonly databasePath?: string;
  readonly message?: string;
  readonly warning?: string;
}

export interface HearthstoneEntity {
  readonly entityId?: number;
  readonly name?: string;
  readonly cardId?: string;
  readonly playerId?: number;
  readonly zone?: HearthstoneZone | string;
  readonly zonePos?: number;
  readonly raw: string;
}

export interface BaseLogEvent {
  readonly source: LogSource;
  readonly timestamp?: string;
  readonly raw: string;
}

export interface GameStartedEvent extends BaseLogEvent {
  readonly type: "game-started";
}

export interface PlayerInfoEvent extends BaseLogEvent {
  readonly type: "player-info";
  readonly playerId: number;
  readonly name?: string;
  readonly isLocal?: boolean;
}

export interface ZoneChangeEvent extends BaseLogEvent {
  readonly type: "zone-change";
  readonly entity: HearthstoneEntity;
  readonly tag: string;
  readonly value: string;
}

export interface EntityRevealedEvent extends BaseLogEvent {
  readonly type: "entity-revealed";
  readonly entity: HearthstoneEntity;
  readonly cardId?: string;
}

export interface CardPlayedEvent extends BaseLogEvent {
  readonly type: "card-played";
  readonly entity: HearthstoneEntity;
  readonly blockType: string;
}

export type GameLogEvent =
  | GameStartedEvent
  | PlayerInfoEvent
  | ZoneChangeEvent
  | EntityRevealedEvent
  | CardPlayedEvent;

export interface SeenCard {
  readonly name?: string;
  readonly cardId?: string;
  readonly entityId?: number;
  readonly playerId?: number;
  readonly timestamp?: string;
  readonly raw: string;
}

export type MatchEvent =
  | {
      readonly type: "deck-loaded";
      readonly cards: readonly DeckCard[];
      readonly timestamp?: string;
    }
  | {
      readonly type: "card-drawn";
      readonly card: SeenCard;
    }
  | {
      readonly type: "opponent-card-played";
      readonly card: SeenCard;
    }
  | {
      readonly type: "log-event";
      readonly event: GameLogEvent;
    };

export interface MatchPlayer {
  readonly playerId: number;
  readonly name?: string;
  readonly isLocal?: boolean;
}

export interface MatchState {
  readonly friendlyPlayerId?: number;
  readonly opponentPlayerId?: number;
  readonly friendlyDeck: readonly DeckCard[];
  readonly drawnCards: readonly SeenCard[];
  readonly opponentPlayedCards: readonly SeenCard[];
  readonly players: readonly MatchPlayer[];
  readonly events: readonly MatchEvent[];
}

export interface CreateMatchStateOptions {
  readonly deck?: DeckImportResult;
  readonly friendlyPlayerId?: number;
  readonly opponentPlayerId?: number;
}
