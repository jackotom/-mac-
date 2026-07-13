import type {
  CardLibraryQuery,
  CardLibraryResult,
  CardPreviewRequest,
  CollectionDeckScanResult,
  LogCandidate,
  PublicLogConfigStatus,
  PublicTrackerState
} from "../shared/types";
import type { CardDetails } from "../shared/cardDatabase";
import type { ArenaCardRating, ArenaScoreQuality } from "../shared/arenaRatings";
import type { CSSProperties } from "react";
import type { LadderDeckRecommendationResult, LadderMode } from "../shared/ladderDeckRecommendation";

export type { CardLibraryQuery, CardLibraryResult };

export interface HearthstoneTrackerApi {
  discoverLogs: () => Promise<LogCandidate[]>;
  selectLogPath: () => Promise<string | undefined>;
  start: (options?: { logPath?: string; deckText?: string }) => Promise<PublicTrackerState>;
  pause: () => Promise<PublicTrackerState>;
  importDeck: (deckText: string) => Promise<PublicTrackerState>;
  scanCollectionDecks?: () => Promise<CollectionDeckScanResult>;
  importCollectionDeck?: (deckId: string) => Promise<PublicTrackerState>;
  ensureLogConfig: () => Promise<PublicLogConfigStatus>;
  inspectLogConfig: () => Promise<PublicLogConfigStatus>;
  toggleOverlay: () => Promise<boolean>;
  toggleOpponentOverlay?: () => Promise<boolean>;
  getOpponentOverlayCollapsed?: () => Promise<boolean>;
  setOpponentOverlayCollapsed?: (collapsed: boolean) => Promise<boolean>;
  onOpponentOverlayCollapsedChange?: (callback: (collapsed: boolean) => void) => () => void;
  minimizeMain?: () => Promise<boolean>;
  listCardLibrary?: (query: CardLibraryQuery) => Promise<CardLibraryResult>;
  showCardPreview?: (request: CardPreviewRequest) => Promise<void>;
  hideCardPreview?: () => Promise<void>;
  onCardPreviewUpdate?: (callback: (details: CardDetails) => void) => () => void;
  onCardPreviewPinnedChange?: (callback: (pinned: boolean) => void) => () => void;
  getState: () => Promise<PublicTrackerState>;
  getLadderDeckRecommendation?: (mode: LadderMode) => Promise<LadderDeckRecommendationResult>;
  copyLadderDeckCode?: (deckCode: string) => Promise<void>;
  closeLadderDeckOverlay?: () => Promise<void>;
  onLadderDeckRecommendationUpdate?: (callback: (mode: LadderMode, result: LadderDeckRecommendationResult) => void) => () => void;
  onUpdate: (callback: (state: PublicTrackerState) => void) => () => void;
}

export interface TrackerStatus {
  state: "ready" | "tracking" | "paused" | "offline";
  isLoading: boolean;
  logPath: string;
  watchedFiles: number;
  parsedLines: number;
  lastSyncedAt: string;
}

export interface DeckSummary {
  deckName: string;
  totalCards: number;
  remainingCards: number;
}

export interface DeckCard {
  id: string;
  name: string;
  cost?: number;
  cardType: string;
  drawn: number;
  copiesRemaining: number;
  copiesTotal: number;
  details?: CardDetails;
}

export type GameEventKind = "draw" | "play" | "mulligan" | "secret" | "turn" | "log" | "warning";

export interface GameEvent {
  id: string;
  kind: GameEventKind;
  actor: "me" | "opponent" | "system";
  turn: number;
  timestamp: string;
  title: string;
  detail: string;
}

export interface OpponentOverview {
  heroClass: string;
  currentTurn: number;
  handSize: number;
  deckRemaining: number;
  secretsInPlay: number;
  fatigueDamage: number;
  lastAction: string;
}

export interface OpponentPlayedCard {
  id: string;
  name: string;
  cost?: number;
  turn: number;
  count: number;
  details?: CardDetails;
}

export type OverlayStatusTone = "ready" | "tracking" | "paused" | "offline" | "error";

export interface OverlayCardItem {
  id: string;
  name: string;
  cost?: number;
  count?: number;
  detail?: string;
  thumbnailUrl?: string;
  details?: CardDetails;
}

export interface OverlayStatusView {
  tone: OverlayStatusTone;
  label: string;
  detail: string;
  updatedAtLabel: string;
}

export interface OverlayDeckSummary {
  totalCards: number;
  remainingCards: number;
  drawnCards: number;
}

export type OverlayDeckIdentityStatus = "automatic" | "waiting" | "arena";

export interface OverlayDeckIdentity {
  name: string;
  status: OverlayDeckIdentityStatus;
  detail: string;
}

export interface OverlayArenaChoice {
  id: string;
  name: string;
  score?: number;
  thumbnailUrl?: string;
  details?: CardDetails;
  quality?: ArenaScoreQuality;
  rating?: ArenaCardRating;
  ratingSummary?: string;
}

export interface OverlayArenaView {
  isChoosing: boolean;
  statusLabel: string;
  progress: string;
  hero: string;
  scoreSource?: string;
  error?: string;
  choices: OverlayArenaChoice[];
  deck: OverlayCardItem[];
  deckCount: number;
  lastPick?: OverlayArenaChoice;
}

export interface OverlaySecretCandidate {
  id: string;
  name: string;
  status: "possible" | "excluded";
}

export interface OverlaySecretSlot {
  id: string;
  label: string;
  candidates: OverlaySecretCandidate[];
}

export interface OverlayBoardAttack {
  friendly: number;
  opponent: number;
}

export interface OverlayPanelViewModel {
  summary: OverlayDeckSummary;
  deckIdentity: OverlayDeckIdentity;
  remainingDeck: OverlayCardItem[];
  handCards?: OverlayCardItem[];
  otherCards?: OverlayCardItem[];
  recentDraws: OverlayCardItem[];
  opponentRecentPlays: OverlayCardItem[];
  opponentSecrets?: OverlaySecretSlot[];
  boardAttack?: OverlayBoardAttack;
  status: OverlayStatusView;
  arena?: OverlayArenaView;
}

export interface OverlayPanelProps {
  view: OverlayPanelViewModel;
  className?: string;
  style?: CSSProperties;
  onClose?: () => void;
  isLoading?: boolean;
  loadError?: string;
}

export interface OpponentOverlayPanelProps {
  view: OverlayPanelViewModel;
  className?: string;
  style?: CSSProperties;
  isCollapsed: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  isLoading?: boolean;
  loadError?: string;
}

declare global {
  interface Window {
    hearthstoneTracker?: HearthstoneTrackerApi;
  }
}
