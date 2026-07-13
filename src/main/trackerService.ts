import { BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { ArenaDraftEngine } from "../shared/arenaDraftEngine.js";
import { TrackerEngine } from "../shared/trackerEngine.js";
import type { CollectionDeck, CollectionDeckScanResult, PublicTrackerState } from "../shared/types.js";
import { CardDataService } from "./cardDataService.js";
import { ArenaRatingService } from "./arenaRatingService.js";
import { parsePlayerLog } from "./logParsers.js";
import { resolveBestLogTarget } from "./logDiscovery.js";
import { ArenaScreenRecognizer, selectArenaChoiceTexts, type ArenaScreenRecognitionOptions, type ArenaScreenRecognitionResult } from "./arenaScreenRecognition.js";
import { inspectConstructedDeckScreen } from "./constructedScreenRecognition.js";
import { shouldRecognizeConstructedDeckScreen } from "./constructedRecognitionPolicy.js";
import {
  detectPowerGameType,
  inspectFriendlyDeckSnapshot,
  isConstructedGameStartLine,
  isGameEndLine,
  selectCurrentPowerGameText
} from "../shared/powerLogParser.js";
import { selectCurrentArenaLogText } from "../shared/arenaLogParser.js";

interface CollectionDeckScanner {
  scanAndImportDecks(options?: { logPath?: string }): Promise<CollectionDeckScanResult>;
}

interface ArenaScreenRecognizerLike {
  recognize(options?: ArenaScreenRecognitionOptions): Promise<ArenaScreenRecognitionResult>;
}

export class TrackerService {
  private engine = new TrackerEngine();
  private arena = new ArenaDraftEngine();
  private cardData = new CardDataService();
  private arenaRatings = new ArenaRatingService();
  private watcher: FSWatcher | undefined;
  private offsets = new Map<string, number>();
  private pendingLogBytes = new Map<string, Buffer>();
  private logReadQueues = new Map<string, Promise<void>>();
  private arenaLogPath: string | undefined;
  private decksLogPath: string | undefined;
  private playerLogPath: string | undefined;
  private arenaRatingsLoaded = false;
  private arenaRatingsPromise: Promise<void> | undefined;
  private lastArenaDeckSignature: string | undefined;
  private activeLogPath: string | undefined;
  private activeSessionModifiedAtMs = 0;
  private sessionRefreshTimer: NodeJS.Timeout | undefined;
  private sessionRefreshGeneration: number | undefined;
  private arenaScreenRecognitionTimer: NodeJS.Timeout | undefined;
  private arenaScreenRecognitionInFlight = false;
  private arenaScreenRecognitionError: string | undefined;
  private knownCollectionDecks: CollectionDeck[] = [];
  private constructedScreenMode: "standard" | "wild" | undefined;
  private pendingPowerGameText = "";
  private activeArenaGame = false;
  private pendingArenaExitDeckKey: string | undefined;
  private pendingArenaExitConfirmations = 0;
  private lastPublishedStateSignature: string | undefined;
  private monitoringGeneration = 0;
  private windows = new Set<BrowserWindow>();

  constructor(
    private readonly collectionDecks?: CollectionDeckScanner,
    private readonly arenaScreenRecognizer: ArenaScreenRecognizerLike = new ArenaScreenRecognizer()
  ) {}

  attachWindow(window: BrowserWindow) {
    this.windows.add(window);
    window.on("closed", () => {
      this.windows.delete(window);
    });
  }

  getState(): PublicTrackerState {
    const state = this.engine.getState();
    return {
      ...state,
      arenaLogPath: this.arenaLogPath,
      constructedScreenMode: this.constructedScreenMode,
      arena: this.arena.getState()
    };
  }

  async importDeck(deckText: string) {
    await this.importDeckIntoEngine(deckText);
    this.pushState();
    return this.getState();
  }

  setCollectionDecks(decks: readonly CollectionDeck[]) {
    this.knownCollectionDecks = decks.map((deck) => ({ ...deck, cards: deck.cards.map((card) => ({ ...card })) }));
    this.engine.setCollectionDecks(decks);
    this.pushState();
  }

  activateCollectionDeck(deckId: string) {
    this.engine.activateCollectionDeck(deckId);
    this.pushState();
    return this.getState();
  }

  async start(options: { logPath?: string; deckText?: string } = {}) {
    const monitoringGeneration = this.beginMonitoring();
    if (options.deckText) {
      await this.importDeckIntoEngine(options.deckText);
      if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
        return this.getState();
      }
    }

    const session = await resolveBestLogTarget(options.logPath);
    if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
      return this.getState();
    }
    const logPath = session?.powerLogPath ?? session?.playerLogPath ?? session?.arenaLogPath ?? session?.decksLogPath ?? session?.loadingScreenLogPath;
    if (!logPath) {
      await this.stopWatcherOnly();
      this.engine.resetAfterGame();
      this.arena.reset();
      this.engine.setStatus("missing-log", undefined, "没有找到炉石日志。请启动炉石，或手动选择 Logs 目录。");
      this.pushState();
      return this.getState();
    }

    if (!session?.powerLogPath && !session?.playerLogPath && !(await hasUsableArenaLog(session?.arenaLogPath))) {
      await this.stopWatcherOnly();
      this.engine.resetAfterGame();
      this.arena.reset();
      this.engine.setStatus("missing-log", logPath, buildMissingPowerLogMessage(logPath));
      this.activeLogPath = logPath;
      this.activeSessionModifiedAtMs = session?.modifiedAtMs ?? 0;
      this.decksLogPath = session?.decksLogPath;
      this.arenaLogPath = session?.arenaLogPath;
      await this.refreshCollectionDecks(session?.decksLogPath ?? logPath, monitoringGeneration);
      if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
        return this.getState();
      }
      this.startSessionRefresh(monitoringGeneration);
      this.startArenaScreenRecognition(monitoringGeneration);
      await this.refreshArenaScreenChoices(monitoringGeneration);
      this.pushState();
      return this.getState();
    }

    if (path.basename(logPath).toLowerCase() === "player.log") {
      await this.stopWatcherOnly();
      this.engine.resetAfterGame();
      this.arena.reset();
      this.engine.setStatus("error", logPath, buildPowerLogRequiredMessage(logPath));
      this.pushState();
      return this.getState();
    }

    const collectionDeckSourcePath = session?.powerLogPath ?? session?.decksLogPath ?? session?.arenaLogPath ?? logPath;
    const selectedCollectionDeck = collectionDeckSourcePath
      ? await this.refreshCollectionDecks(collectionDeckSourcePath, monitoringGeneration)
      : undefined;
    if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
      return this.getState();
    }

    await this.loadCardDatabaseIntoEngine();
    if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
      return this.getState();
    }
    const playerContent = session?.playerLogPath ? await fs.readFile(session.playerLogPath, "utf8").catch(() => "") : "";
    if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
      return this.getState();
    }
    this.playerLogPath = session?.playerLogPath;
    const arenaLogPath = session?.arenaLogPath ?? (session?.powerLogPath ? path.join(path.dirname(session.powerLogPath), "Arena.log") : undefined);
    this.arenaLogPath = arenaLogPath;
    this.arenaRatingsLoaded = false;
    this.arenaRatingsPromise = undefined;
    this.lastArenaDeckSignature = undefined;
    this.arena.reset();
    this.arena.setPreferArenaLogPicks(Boolean(session?.arenaLogPath));
    this.decksLogPath = session?.decksLogPath;
    if (session?.arenaLogPath) {
      await this.ensureArenaRatings();
      if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
        return this.getState();
      }
    }
    await this.stopWatcherOnly();
    if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
      return this.getState();
    }
    this.engine.setStatus("watching", logPath);
    const arenaContent = arenaLogPath ? await fs.readFile(arenaLogPath, "utf8").catch(() => "") : "";
    if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
      return this.getState();
    }
    this.arena.applyArenaText(selectCurrentArenaLogText(arenaContent));
    if (arenaLogPath) {
      this.offsets.set(arenaLogPath, Buffer.byteLength(arenaContent));
    }

    if (session?.powerLogPath) {
      const contentBuffer = await fs.readFile(session.powerLogPath).catch(() => Buffer.alloc(0));
      if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
        return this.getState();
      }
      const content = contentBuffer.toString("utf8");
      this.engine.setFriendlyController(findFriendlyPlayerId(playerContent) ?? findFriendlyPlayerIdFromPowerLog(content));
      this.applyPowerText(content, selectedCollectionDeck);
      this.offsets.set(session.powerLogPath, contentBuffer.length);
      if (this.playerLogPath && parsePlayerLog(playerContent).some((event) => event.type === "game-started")) {
        const [powerStat, playerStat] = await Promise.all([
          fs.stat(session.powerLogPath).catch(() => undefined),
          fs.stat(this.playerLogPath).catch(() => undefined)
        ]);
        if (playerStat && (!powerStat || playerStat.mtimeMs > powerStat.mtimeMs)) {
          this.markGameStartedWhilePowerLogStalled();
        }
      }
    }
    if (this.playerLogPath) {
      this.offsets.set(this.playerLogPath, Buffer.byteLength(playerContent));
    }
    if (this.decksLogPath) {
      const decksStat = await fs.stat(this.decksLogPath).catch(() => undefined);
      if (decksStat) {
        this.offsets.set(this.decksLogPath, decksStat.size);
      }
    }
    this.activeLogPath = logPath;
    this.activeSessionModifiedAtMs = session?.modifiedAtMs ?? 0;
    this.syncArenaDeckToTracker();
    if (!session?.powerLogPath && selectedCollectionDeck && this.arena.getState().status === "inactive") {
      this.previewCollectionDeck(selectedCollectionDeck);
    }

    const watchedPaths = [logPath];
    if (arenaLogPath && !watchedPaths.includes(arenaLogPath)) {
      watchedPaths.push(arenaLogPath);
    }
    if (this.decksLogPath && !watchedPaths.includes(this.decksLogPath)) {
      watchedPaths.push(this.decksLogPath);
    }
    if (this.playerLogPath && !watchedPaths.includes(this.playerLogPath)) {
      watchedPaths.push(this.playerLogPath);
    }

    this.watcher = chokidar.watch(watchedPaths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 }
    });

    this.watcher.on("change", (changedPath) => {
      this.enqueueLogRead(changedPath, monitoringGeneration);
    });
    this.watcher.on("add", (addedPath) => {
      this.enqueueLogRead(addedPath, monitoringGeneration);
    });
    this.watcher.on("error", (error) => {
      if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
        return;
      }
      this.engine.setStatus("error", logPath, String(error));
      this.pushState();
    });

    this.startSessionRefresh(monitoringGeneration);
    this.startArenaScreenRecognition(monitoringGeneration);
    await this.refreshArenaScreenChoices(monitoringGeneration);
    this.pushState();
    return this.getState();
  }

  async pause() {
    this.beginMonitoring();
    await this.stopWatcherOnly();
    this.engine.setStatus("paused", this.getState().logPath);
    this.pushState();
    return this.getState();
  }

  async dispose() {
    this.beginMonitoring();
    await this.stopWatcherOnly();
  }

  private async readAppended(logPath: string, monitoringGeneration: number) {
    if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
      return;
    }

    try {
      const handle = await fs.open(logPath, "r");
      const stat = await handle.stat();
      if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
        await handle.close();
        return;
      }
      let offset = this.offsets.get(logPath) ?? 0;
      if (stat.size < offset) {
        offset = 0;
        this.pendingLogBytes.delete(logPath);
      }

      const length = stat.size - offset;
      if (length <= 0) {
        await handle.close();
        return;
      }

      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      await handle.close();
      if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
        return;
      }
      this.offsets.set(logPath, stat.size);
      const { text, pending } = splitCompleteLogChunk(this.pendingLogBytes.get(logPath), buffer);
      this.setPendingLogBytes(logPath, pending);
      if (!text) {
        return;
      }
      if (this.engine.getState().status === "error") {
        this.engine.setStatus("watching", this.activeLogPath ?? logPath);
      }
      if (this.isArenaLog(logPath)) {
        await this.ensureArenaRatings();
        this.arena.setPreferArenaLogPicks(true);
        this.arena.applyArenaText(text.includes("SetDraftMode") ? selectCurrentArenaLogText(text) : text);
      } else if (this.isDecksLog(logPath)) {
        const selectedCollectionDeck = await this.refreshCollectionDecks(logPath, monitoringGeneration);
        if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
          return;
        }
        if (selectedCollectionDeck && this.arena.getState().status === "inactive" && !this.activeArenaGame) {
          this.previewCollectionDeck(selectedCollectionDeck);
        }
      } else if (this.isPlayerLog(logPath)) {
        const playerEvents = parsePlayerLog(text);
        if (playerEvents.some((event) => event.type === "game-started")) {
          this.markGameStartedWhilePowerLogStalled();
        }
        const friendlyPlayerId = findFriendlyPlayerId(text);
        if (friendlyPlayerId !== undefined) {
          this.engine.setFriendlyController(friendlyPlayerId);
        }
      } else {
        const friendlyPlayerId = findFriendlyPlayerIdFromPowerLog(text);
        if (friendlyPlayerId !== undefined) {
          this.engine.setFriendlyController(friendlyPlayerId);
        }
        this.applyPowerText(text);
      }
      await this.refreshArenaScreenChoices(monitoringGeneration);
      this.syncArenaDeckToTracker();
      this.pushState();
    } catch (error) {
      if (!this.isCurrentMonitoringGeneration(monitoringGeneration)) {
        return;
      }
      this.engine.setStatus("error", logPath, String(error));
      this.pushState();
    }
  }

  private enqueueLogRead(logPath: string, monitoringGeneration: number) {
    const previous = this.logReadQueues.get(logPath) ?? Promise.resolve();
    const queued = previous.then(() => this.readAppended(logPath, monitoringGeneration));
    this.logReadQueues.set(logPath, queued);
    void queued.finally(() => {
      if (this.logReadQueues.get(logPath) === queued) {
        this.logReadQueues.delete(logPath);
      }
    });
  }

  private async stopWatcherOnly() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
  }

  private markGameStartedWhilePowerLogStalled() {
    this.engine.resetAfterGame();
    this.engine.resetForGame();
    this.constructedScreenMode = undefined;
    this.engine.setStatus(
      "watching",
      this.activeLogPath ?? this.engine.getState().logPath,
      "对局已开始，但 Power.log 暂未更新。记牌小窗已保留；若牌库不变，请重启炉石恢复日志。"
    );
  }

  private beginMonitoring() {
    this.monitoringGeneration += 1;
    this.stopSessionRefresh();
    this.stopArenaScreenRecognition();
    this.constructedScreenMode = undefined;
    this.pendingPowerGameText = "";
    this.activeArenaGame = false;
    this.pendingLogBytes.clear();
    this.logReadQueues.clear();
    this.resetPendingArenaExit();
    return this.monitoringGeneration;
  }

  private isCurrentMonitoringGeneration(generation: number) {
    return this.monitoringGeneration === generation;
  }

  private setPendingLogBytes(logPath: string, pending: Buffer) {
    if (pending.length > 0) {
      this.pendingLogBytes.set(logPath, pending);
    } else {
      this.pendingLogBytes.delete(logPath);
    }
  }

  private startSessionRefresh(generation: number) {
    if (!this.isCurrentMonitoringGeneration(generation)) {
      return;
    }

    this.stopSessionRefresh();
    this.sessionRefreshTimer = setInterval(() => {
      void this.followNewestSession(generation);
    }, 1_000);
  }

  private stopSessionRefresh() {
    if (this.sessionRefreshTimer) {
      clearInterval(this.sessionRefreshTimer);
      this.sessionRefreshTimer = undefined;
    }
    this.sessionRefreshGeneration = undefined;
  }

  private startArenaScreenRecognition(generation: number) {
    this.stopArenaScreenRecognition();
    this.arenaScreenRecognitionTimer = setInterval(() => {
      void this.refreshArenaScreenChoices(generation);
    }, 450);
    this.arenaScreenRecognitionTimer.unref();
  }

  private stopArenaScreenRecognition() {
    if (this.arenaScreenRecognitionTimer) {
      clearInterval(this.arenaScreenRecognitionTimer);
      this.arenaScreenRecognitionTimer = undefined;
    }
    this.arenaScreenRecognitionInFlight = false;
    this.arenaScreenRecognitionError = undefined;
  }

  private async refreshArenaScreenChoices(generation: number) {
    const arenaState = this.arena.getState();
    const isArenaChoosing = arenaState.status === "drafting" || arenaState.status === "redrafting";
    const shouldRecognizeArenaChoices = isArenaChoosing && arenaState.currentChoices.length < 3;
    const shouldRecognizeConstructedDeck =
      !shouldRecognizeArenaChoices &&
      !isArenaChoosing &&
      shouldRecognizeConstructedDeckScreen(arenaState.status, this.activeArenaGame);
    const arenaRecognitionContext = shouldRecognizeArenaChoices ? getArenaRecognitionContext(arenaState) : undefined;
    if (
      !this.isCurrentMonitoringGeneration(generation) ||
      this.arenaScreenRecognitionInFlight ||
      (!shouldRecognizeArenaChoices && !shouldRecognizeConstructedDeck)
    ) {
      return;
    }

    this.arenaScreenRecognitionInFlight = true;
    try {
      const result = await this.arenaScreenRecognizer.recognize({
        requireHearthstoneFrontmost: shouldRecognizeArenaChoices || this.engine.hasActiveGame(),
        profile: shouldRecognizeArenaChoices ? "arena" : "constructed"
      });
      if (!this.isCurrentMonitoringGeneration(generation)) {
        return;
      }
      const currentArenaState = this.arena.getState();
      const isCurrentlyChoosingArena =
        (currentArenaState.status === "drafting" || currentArenaState.status === "redrafting") &&
        currentArenaState.currentChoices.length < 3;
      if (
        (shouldRecognizeArenaChoices &&
          (!isCurrentlyChoosingArena || getArenaRecognitionContext(currentArenaState) !== arenaRecognitionContext)) ||
        (shouldRecognizeConstructedDeck &&
          (isCurrentlyChoosingArena || (this.activeArenaGame && currentArenaState.status !== "complete")))
      ) {
        return;
      }

      if (result.status === "ok") {
        if (shouldRecognizeArenaChoices) {
          const recognized = this.arena.applyScreenChoices(selectArenaChoiceTexts(result.texts));
          if (recognized) {
            this.engine.setStatus("watching", this.activeLogPath);
            this.resetPendingArenaExit();
            this.arenaScreenRecognitionError = undefined;
            this.arena.setError(undefined);
            this.pushState();
            return;
          }

          const inspection = inspectConstructedDeckScreen(result.texts, this.knownCollectionDecks);
          if (inspection.mode && inspection.selectedDeck) {
            const deckKey = `${inspection.mode}:${inspection.selectedDeck.id}`;
            if (deckKey === this.pendingArenaExitDeckKey) {
              this.pendingArenaExitConfirmations += 1;
            } else {
              this.pendingArenaExitDeckKey = deckKey;
              this.pendingArenaExitConfirmations = 1;
            }
            if (this.pendingArenaExitConfirmations >= 2) {
              this.constructedScreenMode = inspection.mode;
              this.arena.reset();
              this.lastArenaDeckSignature = undefined;
              this.resetPendingArenaExit();
              this.previewCollectionDeck(inspection.selectedDeck);
            }
          } else {
            this.resetPendingArenaExit();
          }
          return;
        }

        const inspection = inspectConstructedDeckScreen(result.texts, this.knownCollectionDecks);
        if (inspection.mode) {
          if (this.engine.hasActiveGame()) {
            const deckKey = `${inspection.mode}:${inspection.selectedDeck?.id ?? "unresolved"}`;
            if (deckKey === this.pendingArenaExitDeckKey) {
              this.pendingArenaExitConfirmations += 1;
            } else {
              this.pendingArenaExitDeckKey = deckKey;
              this.pendingArenaExitConfirmations = 1;
            }
            if (this.pendingArenaExitConfirmations < 2) {
              return;
            }
            this.engine.resetAfterGame();
          }

          this.resetPendingArenaExit();
          this.engine.setStatus("watching", this.activeLogPath);
          this.constructedScreenMode = inspection.mode;
          this.activeArenaGame = false;
          this.arena.reset();
          this.lastArenaDeckSignature = undefined;

          if (inspection.selectedDeck) {
            this.previewCollectionDeck(inspection.selectedDeck);
            return;
          }

          this.engine.clearCollectionDeckPreview();
          this.engine.clearArenaDeck();
          this.pushState();
          return;
        }

        this.resetPendingArenaExit();
        const leftConstructedScreen = this.constructedScreenMode !== undefined;
        this.constructedScreenMode = undefined;

        if (leftConstructedScreen) {
          this.pushState();
        }
        return;
      }

      if (!shouldRecognizeArenaChoices) {
        const message = result.message ?? constructedScreenRecognitionFailureMessage(result.status);
        this.engine.clearCollectionDeckPreview();
        if (result.status === "permission-denied" && arenaState.status === "complete") {
          this.arena.reset();
          this.lastArenaDeckSignature = undefined;
          this.engine.clearArenaDeck();
        }
        if (this.getState().status !== "missing-log") {
          this.engine.setStatus("watching", this.activeLogPath, message);
        }
        this.pushState();
        return;
      }

      const message = result.message ?? "竞技场候选牌尚未可识别。";
      if (message !== this.arenaScreenRecognitionError) {
        this.arenaScreenRecognitionError = message;
        this.arena.setError(message);
        this.pushState();
      }
    } finally {
      if (this.isCurrentMonitoringGeneration(generation)) {
        this.arenaScreenRecognitionInFlight = false;
      }
    }
  }

  private async followNewestSession(generation: number) {
    if (process.env.QA_LOCK_LOG_PATH === "1") {
      return;
    }
    if (
      !this.isCurrentMonitoringGeneration(generation) ||
      this.sessionRefreshGeneration !== undefined
    ) {
      return;
    }

    this.sessionRefreshGeneration = generation;
    try {
      const session = await resolveBestLogTarget();
      if (!this.isCurrentMonitoringGeneration(generation)) {
        return;
      }

      const nextLogPath = session?.powerLogPath ?? session?.playerLogPath ?? session?.arenaLogPath ?? session?.decksLogPath ?? session?.loadingScreenLogPath;
      if (
        !session ||
        !nextLogPath ||
        !this.activeLogPath ||
        path.resolve(nextLogPath) === path.resolve(this.activeLogPath) ||
        session.modifiedAtMs <= this.activeSessionModifiedAtMs
      ) {
        return;
      }

      await this.start({ logPath: nextLogPath });
    } catch {
      // Keep the active watcher running if a periodic discovery pass fails.
    } finally {
      if (this.sessionRefreshGeneration === generation) {
        this.sessionRefreshGeneration = undefined;
      }
    }
  }

  private async importDeckIntoEngine(deckText: string) {
    const cardDatabase = await this.cardData.loadCardDatabase({ preferCache: true });
    this.engine.importDeck(deckText, cardDatabase.database, cardDatabase.warnings);
  }

  private async refreshCollectionDecks(logPath: string, monitoringGeneration: number): Promise<CollectionDeck | undefined> {
    if (!this.collectionDecks) {
      return undefined;
    }

    const result = await this.collectionDecks.scanAndImportDecks({ logPath });
    if (!this.isCurrentMonitoringGeneration(monitoringGeneration) || result.status !== "ok") {
      return undefined;
    }

    const decks = toTrackerCollectionDecks(result.decks, logPath);
    this.engine.setCollectionDecks(decks);
    this.knownCollectionDecks = decks;
    return result.activeDeck ? findTrackerCollectionDeck(decks, result.activeDeck) : undefined;
  }

  private async loadCardDatabaseIntoEngine() {
    const cardDatabase = await this.cardData.loadCardDatabase({ preferCache: true });
    if (cardDatabase.database) {
      this.engine.setCardDatabase(cardDatabase.database);
      this.arena.setCardDatabase(cardDatabase.database);
    }
  }

  private async ensureArenaRatings() {
    if (this.arenaRatingsLoaded) {
      return;
    }

    if (!this.arenaRatingsPromise) {
      this.arenaRatingsPromise = (async () => {
        const result = await this.arenaRatings.loadRatings();
        if (result.table) {
          this.arena.setRatings(result.table);
        }
        if (result.warnings[0]) {
          this.arena.setError(result.warnings[0]);
        }
        this.arenaRatingsLoaded = true;
      })().finally(() => {
        this.arenaRatingsPromise = undefined;
      });
    }

    await this.arenaRatingsPromise;
  }

  private applyPowerText(text: string, selectedCollectionDeck?: CollectionDeck) {
    const combinedText = this.pendingPowerGameText ? `${this.pendingPowerGameText}\n${text}` : text;
    this.pendingPowerGameText = "";
    const knownGameType = detectPowerGameType(combinedText) ?? (
      this.arena.getState().status === "playing" ? "arena" : undefined
    );
    const currentText = selectCurrentPowerGameText(combinedText);
    if (
      currentText.includes("CREATE_GAME") &&
      knownGameType === undefined &&
      this.arena.getState().status !== "inactive"
    ) {
      this.pendingPowerGameText = currentText;
      return;
    }
    const lines = currentText.split(/\r?\n/);
    const friendlyController = findFriendlyPlayerIdFromPowerLog(text);
    const deckSnapshot = inspectFriendlyDeckSnapshot(currentText, friendlyController);
    const gameStartIndex = selectedCollectionDeck
      ? lines.findIndex(isConstructedGameStartLine)
      : -1;

    if (gameStartIndex >= 0 && selectedCollectionDeck) {
      this.applyCurrentPowerText(lines.slice(0, gameStartIndex + 1).join("\n"), knownGameType);
      if (deckSnapshot) {
        this.engine.setFriendlyDeckSnapshot(deckSnapshot);
      }
      const selected =
        this.engine.activateExplicitCollectionDeck(selectedCollectionDeck.id, {
          expectedSize: deckSnapshot?.initialDeckSize ?? getConstructedExpectedDeckSize(selectedCollectionDeck)
        }) ||
        (deckSnapshot ? this.engine.activateCollectionDeck(selectedCollectionDeck.id) : false);
      if (!selected && deckSnapshot) {
        this.engine.useUnmatchedDeckSnapshot();
      }
      this.applyCurrentPowerText(lines.slice(gameStartIndex + 1).join("\n"), knownGameType);
      // The replay above consumes the whole current game. Restore the real
      // snapshot afterward so the first rendered state matches Hearthstone.
      if (deckSnapshot) {
        this.engine.setFriendlyDeckSnapshot(deckSnapshot);
      }
      return;
    }

    this.applyCurrentPowerText(currentText, knownGameType);
  }

  private applyCurrentPowerText(currentText: string, knownGameType?: "arena" | "constructed") {
    const hasGameStart = currentText.includes("CREATE_GAME");
    const gameType = detectPowerGameType(currentText) ?? knownGameType;
    const startsArenaGame = hasGameStart && gameType === "arena";
    const startsConstructedGame = hasGameStart && (
      gameType === "constructed" ||
      (gameType === undefined && this.arena.getState().status === "inactive")
    );
    if (startsArenaGame) {
      this.activeArenaGame = true;
    }
    if (currentText.split(/\r?\n/).some(isGameEndLine)) {
      this.activeArenaGame = false;
    }
    if (startsArenaGame || startsConstructedGame) {
      this.constructedScreenMode = undefined;
    }
    if (startsConstructedGame && this.arena.getState().status !== "inactive") {
      this.arena.reset();
      this.engine.clearArenaDeck();
    }

    if (!startsArenaGame) {
      this.engine.applyText(currentText);
    }
    this.arena.applyPowerText(currentText);
    if (startsArenaGame) {
      this.arena.markPlaying();
    }
  }

  private syncArenaDeckToTracker() {
    if (
      this.engine.getState().autoMatchedDeckId &&
      this.constructedScreenMode &&
      !isPowerLogPath(this.activeLogPath)
    ) {
      return;
    }

    const arenaState = this.arena.getState();
    if (arenaState.status !== "complete" && arenaState.status !== "playing") {
      return;
    }

    const signature = JSON.stringify(arenaState.deck);
    const trackerAlreadyShowsArenaDeck = this.engine.getState().deckName === "竞技场牌库";
    if (
      !signature ||
      (signature === this.lastArenaDeckSignature && trackerAlreadyShowsArenaDeck) ||
      arenaState.deck.length === 0
    ) {
      return;
    }

    this.lastArenaDeckSignature = signature;
    this.engine.loadDeckCards(arenaState.deck, "竞技场牌库");
  }

  private previewCollectionDeck(deck: CollectionDeck) {
    this.arena.reset();
    if (!this.engine.previewCollectionDeck(deck.id, { expectedSize: getConstructedExpectedDeckSize(deck) })) {
      return false;
    }

    this.constructedScreenMode = getConstructedMode(deck) ?? this.constructedScreenMode;
    this.lastArenaDeckSignature = undefined;
    this.pushState();
    return true;
  }

  private resetPendingArenaExit() {
    this.pendingArenaExitDeckKey = undefined;
    this.pendingArenaExitConfirmations = 0;
  }

  private isArenaLog(logPath: string) {
    return Boolean(this.arenaLogPath && path.resolve(logPath) === path.resolve(this.arenaLogPath));
  }

  private isDecksLog(logPath: string) {
    return Boolean(this.decksLogPath && path.resolve(logPath) === path.resolve(this.decksLogPath));
  }

  private isPlayerLog(logPath: string) {
    return Boolean(this.playerLogPath && path.resolve(logPath) === path.resolve(this.playerLogPath));
  }

  private pushState() {
    const state: PublicTrackerState = this.getState();
    const { lastUpdated: _lastUpdated, ...stableState } = state;
    const signature = JSON.stringify(stableState);
    if (signature === this.lastPublishedStateSignature) {
      return;
    }

    let published = false;
    for (const window of this.windows) {
      if (!window.isDestroyed()) {
        window.webContents.send("tracker:update", state);
        published = true;
      }
    }
    if (published) {
      this.lastPublishedStateSignature = signature;
    }
  }
}

function getArenaRecognitionContext(state: ReturnType<ArenaDraftEngine["getState"]>): string {
  return `${state.status}:${state.draftCount}:${state.picks.length}:${state.currentChoices.map((card) => card.cardId ?? card.name).join("|")}`;
}

function splitCompleteLogChunk(previous: Buffer | undefined, chunk: Buffer) {
  const combined = previous?.length ? Buffer.concat([previous, chunk]) : chunk;
  const lastNewline = combined.lastIndexOf(0x0a);
  if (lastNewline < 0) {
    return { text: "", pending: Buffer.from(combined) };
  }

  return {
    text: combined.subarray(0, lastNewline + 1).toString("utf8"),
    pending: Buffer.from(combined.subarray(lastNewline + 1))
  };
}

function buildPowerLogRequiredMessage(logPath: string) {
  return `当前只找到 ${path.basename(logPath)}，Player.log 不能显示牌名；需要修复日志并重启炉石，生成同目录 Power.log 后再开始监听。`;
}

function buildMissingPowerLogMessage(logPath: string) {
  return `当前最新炉石日志只有 ${path.basename(logPath)}，没有 Power.log；先点“修复日志”，然后重启炉石/开始一局。`;
}

function isPowerLogPath(logPath: string | undefined) {
  return Boolean(logPath?.trim().match(/(^|[\\/])Power\.log$/i));
}

async function hasUsableArenaLog(arenaLogPath?: string) {
  if (!arenaLogPath) {
    return false;
  }

  const content = await fs.readFile(arenaLogPath, "utf8").catch(() => "");
  return /SetDraftMode\s*-\s*(?:DRAFTING|ACTIVE_DRAFT_DECK|REDRAFTING|IN_REWARDS)\b/i.test(selectCurrentArenaLogText(content));
}

function findFriendlyPlayerId(content: string): number | undefined {
  const players = parsePlayerLog(content).filter((event) => event.type === "player-info");
  const explicitLocal = players.find((event) => event.isLocal);
  if (explicitLocal) {
    return explicitLocal.playerId;
  }

  const namedLocal = players.find((event) => /local|我方|自己/i.test(event.name ?? ""));
  if (namedLocal) {
    return namedLocal.playerId;
  }

  return players.length === 1 ? players[0]?.playerId : undefined;
}

function findFriendlyPlayerIdFromPowerLog(content: string): number | undefined {
  const lines = content.split(/\r?\n/);
  const currentGameStart = lines.map((line, index) => (line.includes("CREATE_GAME") ? index : -1)).filter((index) => index >= 0).at(-1);
  const currentGameLines = currentGameStart === undefined ? lines : lines.slice(currentGameStart);
  const currentGamePlayer = findFriendlyPlayerIdInLines(currentGameLines);
  if (currentGamePlayer !== undefined) {
    return currentGamePlayer;
  }

  // Some clients announce the player names before CREATE_GAME, while others
  // write them after it. Only fall back to the preceding block when the
  // current game has not announced a local player yet.
  return currentGameStart === undefined ? undefined : findFriendlyPlayerIdInLines(lines.slice(0, currentGameStart));
}

function findFriendlyPlayerIdInLines(lines: readonly string[]): number | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index]?.match(/\bPlayerID\s*=\s*(\d+)\s*,?\s*PlayerName\s*=\s*(.+?)\s*$/i);
    const playerName = match?.[2]?.trim();
    if (match?.[1] && playerName && !/^UNKNOWN HUMAN PLAYER$/i.test(playerName)) {
      return Number(match[1]);
    }
  }

  return undefined;
}

function toTrackerCollectionDecks(
  decks: readonly CollectionDeckScanResult["decks"][number][],
  logPath: string
): CollectionDeck[] {
  const fallbackSourcePath = path.join(path.dirname(logPath), "Decks.log");
  return decks.flatMap((deck) => {
    if (!deck.cards || deck.cards.length === 0) {
      return [];
    }

    return [
      {
        id: deck.id,
        deckId: deck.deckId,
        name: deck.name,
        heroClass: deck.heroClass,
        format: deck.format,
        mode: deck.mode,
        cards: deck.cards.map((card) => ({ ...card })),
        rawDeckString: deck.rawDeckString,
        rawText: deck.rawDeckString ?? deck.name ?? deck.id,
        sourcePath: deck.sourcePath ?? fallbackSourcePath,
        updatedAt: deck.updatedAt ?? new Date(0).toISOString(),
        warnings: deck.warnings ?? []
      }
    ];
  });
}

function findTrackerCollectionDeck(decks: readonly CollectionDeck[], activeDeck: CollectionDeck): CollectionDeck | undefined {
  if (activeDeck.id) {
    const byId = decks.find((deck) => deck.id === activeDeck.id);
    if (byId) {
      return byId;
    }
  }

  if (activeDeck.deckId) {
    const byDeckId = decks.find((deck) => deck.deckId === activeDeck.deckId);
    if (byDeckId) {
      return byDeckId;
    }
  }

  if (activeDeck.rawDeckString) {
    return decks.find((deck) => deck.rawDeckString === activeDeck.rawDeckString);
  }

  return undefined;
}

function getConstructedExpectedDeckSize(deck: CollectionDeck): number | undefined {
  const format = `${deck.format ?? ""} ${deck.mode ?? ""}`.toLocaleLowerCase();
  return /标准|狂野|standard|wild/.test(format) ? 30 : undefined;
}

function getConstructedMode(deck: CollectionDeck): "standard" | "wild" | undefined {
  const format = `${deck.format ?? ""} ${deck.mode ?? ""}`.toLocaleLowerCase();
  if (/标准|standard/.test(format)) {
    return "standard";
  }
  if (/狂野|wild/.test(format)) {
    return "wild";
  }
  return undefined;
}

function constructedScreenRecognitionFailureMessage(status: ArenaScreenRecognitionResult["status"]) {
  if (status === "permission-denied") {
    return "无法识别当前套牌。请在系统设置中允许炉石记牌器录制屏幕。";
  }
  if (status === "window-not-found") {
    return "没有找到炉石窗口，已清除上一次套牌。";
  }
  return "当前套牌识别失败，已清除上一次套牌，请回到炉石后重试。";
}
