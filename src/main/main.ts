import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, screen, shell, systemPreferences } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureLogConfig, inspectLogConfig } from "./logConfig.js";
import { discoverLogCandidates } from "./logDiscovery.js";
import { TrackerService } from "./trackerService.js";
import { ArenaScreenRecognizer, ScreenCaptureError } from "./arenaScreenRecognition.js";
import { CollectionDeckService } from "./collectionDeckService.js";
import { CardDataService } from "./cardDataService.js";
import { shouldShowArenaChoiceOverlay } from "./arenaChoiceOverlayVisibility.js";
import { AutomaticOverlayController } from "./automaticOverlayController.js";
import { getFrontmostAppName } from "./frontmostApp.js";
import { CardPreviewVisibilityGate } from "./cardPreviewVisibility.js";
import { shouldHandleAppActivate, shouldShowMainWindowOnLaunch } from "./mainWindowVisibility.js";
import { normalizeOverlayWindowBounds } from "./overlayWindowBounds.js";
import { OpponentSecretOverlayVisibility } from "./opponentSecretOverlayVisibility.js";
import {
  configureBoardAttackOverlayWindow,
  getBoardAttackOverlayQuery,
  getBoardAttackOverlayWindowOptions,
  shouldShowBoardAttackOverlay
} from "./boardAttackOverlay.js";
import { registerOpponentOverlayIpc } from "./opponentOverlayIpc.js";
import { OpponentOverlayWindowState } from "./opponentOverlayWindowState.js";
import { OpponentOverlayWindowController } from "./opponentOverlayWindowController.js";
import { selectHearthstoneCaptureSource } from "./screenCaptureSource.js";
import { LadderDeckRecommendationService } from "./ladderDeckRecommendationService.js";
import { LadderDeckOverlayController, resolveLadderDeckMode } from "./ladderDeckOverlayController.js";
import { getLadderDeckOverlayBounds } from "./ladderDeckOverlayBounds.js";
import { assertTrustedIpcEvent, configureSecureNavigation, createSecureWebPreferences } from "./electronSecurity.js";
import { createCardLibraryErrorResult, listCardLibrary } from "../shared/cardDatabase.js";
import type { CardLibraryResult, CardPreviewRequest, CollectionDeck, CollectionDeckScanResult } from "../shared/types.js";
import type { LadderMode } from "../shared/ladderDeckRecommendation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionDecks = new CollectionDeckService();
const tracker = new TrackerService(collectionDecks, new ArenaScreenRecognizer(undefined, captureHearthstoneDisplay));
const cardLibraryData = new CardDataService();
let cardLibraryMetadata: { source?: string; version?: string } = {};
let mainWindow: BrowserWindow | undefined;
let overlayWindow: BrowserWindow | undefined;
let opponentOverlayWindow: BrowserWindow | undefined;
let boardAttackOverlayWindow: BrowserWindow | undefined;
let ladderDeckOverlayWindow: BrowserWindow | undefined;
let arenaChoiceOverlayWindow: BrowserWindow | undefined;
let cardPreviewWindow: BrowserWindow | undefined;
let cardPreviewSourceWindow: BrowserWindow | undefined;
let cardPreviewPinned = false;
let arenaChoiceOverlayMonitor: NodeJS.Timeout | undefined;
let arenaChoiceOverlayRefreshInFlight = false;
let cardPreviewAutoHideTimer: NodeJS.Timeout | undefined;
let cardPreviewVisibilityMonitor: NodeJS.Timeout | undefined;
let cardPreviewVisibilityRefreshInFlight = false;
let lastCardPreviewRequestKey: string | undefined;
let cardPreviewRequestSerial = 0;
let overlayBoundsSaveTimer: NodeJS.Timeout | undefined;
let overlayInteractionActiveUntil = 0;
let ladderDeckOverlayInteractionActiveUntil = 0;
let initialBackgroundWindowReady = false;
let initialLaunchActivateObserved = false;
let mainWindowUserActivationAllowedAfterMs = Number.POSITIVE_INFINITY;
let screenRecordingSettingsOpened = false;
let opponentSecretOverlayMonitor: NodeJS.Timeout | undefined;
let boardAttackOverlayMonitor: NodeJS.Timeout | undefined;
let boardAttackOverlayRefreshInFlight = false;
let opponentOverlayBoundsSaveTimer: NodeJS.Timeout | undefined;
let opponentOverlayWindowState: OpponentOverlayWindowState | undefined;
const opponentOverlayWindowController = new OpponentOverlayWindowController({
  getWindow: () => opponentOverlayWindow,
  getState: () => opponentOverlayWindowState,
  saveExpandedBounds: saveOpponentOverlayBounds
});
const ladderDeckRecommendations = new LadderDeckRecommendationService();
let currentLadderDeckCode: string | undefined;

const cardPreviewWidth = 280;
const cardPreviewHeight = 520;
const cardPreviewMinHeight = 160;
const cardPreviewGap = 10;
const cardPreviewAutoHideMs = 10000;
const mainWindowActivateGraceMs = 1_500;
const cardPreviewVisibilityIntervalMs = 150;
const cardPreviewVisibilityGate = new CardPreviewVisibilityGate();
const cardPreviewPinAccelerator = "Alt+Q";
const opponentSecretOverlayVisibility = new OpponentSecretOverlayVisibility();

const ladderDeckOverlayController = new LadderDeckOverlayController({
  getState: () => tracker.getState(),
  getFrontmostAppName,
  hasWindow: () => Boolean(ladderDeckOverlayWindow && !ladderDeckOverlayWindow.isDestroyed()),
  isVisible: () => Boolean(ladderDeckOverlayWindow && !ladderDeckOverlayWindow.isDestroyed() && ladderDeckOverlayWindow.isVisible()),
  isAnyOverlayFocused: () => isAnyInteractiveOverlayFocused(),
  isAnyOverlayInteractionActive: () => isAnyOverlayInteractionActive(),
  createWindow: async () => { await createLadderDeckOverlayWindow({ showWhenReady: false }); },
  updateMode: updateLadderDeckOverlayMode,
  showInactive: () => {
    if (!ladderDeckOverlayWindow || ladderDeckOverlayWindow.isDestroyed()) return;
    const bounds = getLadderDeckOverlayBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea);
    if (!bounds) return;
    ladderDeckOverlayWindow.setBounds(bounds);
    ladderDeckOverlayWindow.showInactive();
  },
  hide: () => ladderDeckOverlayWindow?.hide()
});

async function captureHearthstoneDisplay() {
  try {
    const displays = screen.getAllDisplays();
    const targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const thumbnailSize = displays.reduce(
      (size, display) => ({
        width: Math.max(size.width, Math.round(display.bounds.width * display.scaleFactor)),
        height: Math.max(size.height, Math.round(display.bounds.height * display.scaleFactor))
      }),
      { width: 1, height: 1 }
    );
    const sources = await desktopCapturer.getSources({ types: ["window", "screen"], thumbnailSize });
    const source = selectHearthstoneCaptureSource(sources, targetDisplay.id);
    if (!source || source.thumbnail.isEmpty()) {
      throw new Error("无法读取炉石所在屏幕。");
    }
    return source.thumbnail.toPNG();
  } catch (error) {
    const accessStatus = systemPreferences.getMediaAccessStatus("screen");
    if (accessStatus !== "granted" && !screenRecordingSettingsOpened) {
      screenRecordingSettingsOpened = true;
      void shell.openExternal(
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture"
      );
    }
    if (accessStatus !== "granted") {
      throw new ScreenCaptureError(
        "permission-denied",
        "需要允许炉石记牌器录制屏幕，才能自动识别当前模式和套牌。"
      );
    }
    throw new ScreenCaptureError(
      "capture-failed",
      `暂时无法读取炉石画面，正在自动重试：${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const automaticOverlayController = new AutomaticOverlayController({
  getState: () => tracker.getState(),
  getFrontmostAppName,
  hasOverlayWindow: () => Boolean(overlayWindow && !overlayWindow.isDestroyed()),
  isOverlayVisible: () => Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()),
  isOverlayFocused: () => isAnyInteractiveOverlayFocused(),
  isOverlayInteractionActive: () => isAnyOverlayInteractionActive(),
  createOverlayWindow: async () => {
    await createOverlayWindow({ showWhenReady: false });
  },
  showOverlayWindow: () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.showInactive();
    }
  },
  hideOverlayWindow: () => {
    hideCardPreviewWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
  }
});

function isAnyInteractiveOverlayFocused() {
  return [overlayWindow, opponentOverlayWindow, ladderDeckOverlayWindow].some(
    (window) => Boolean(window && !window.isDestroyed() && window.isFocused())
  );
}

function isAnyOverlayInteractionActive() {
  const now = Date.now();
  return now < overlayInteractionActiveUntil || now < ladderDeckOverlayInteractionActiveUntil;
}

if (process.env.QA_USER_DATA_DIR) {
  app.setPath("userData", process.env.QA_USER_DATA_DIR);
}

const hasSingleInstanceLock = process.env.QA_ALLOW_MULTIPLE_INSTANCES === "1" || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

async function createWindow(options: { showWhenReady?: boolean } = {}) {
  const showWhenReady = options.showWhenReady ?? shouldShowMainWindowOnLaunch(process.env);
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: "炉石 Mac 记牌器",
    backgroundColor: "#101419",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: createSecureWebPreferences(path.join(__dirname, "preload.cjs"))
  });
  configureSecureNavigation(window);

  mainWindow = window;
  tracker.attachWindow(window);
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await window.loadURL(devUrl);
  } else {
    await window.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  if (showWhenReady) {
    window.show();
  }

  await startTrackingAutomatically(process.env.QA_LOG_PATH ? { logPath: process.env.QA_LOG_PATH } : undefined);

  if (
    process.env.QA_OPEN_OVERLAY !== "1" &&
    process.env.QA_OPEN_OPPONENT_OVERLAY !== "1" &&
    process.env.QA_OPEN_ARENA_CHOICE_OVERLAY !== "1"
    && process.env.QA_OPEN_LADDER_DECK_OVERLAY !== "1"
    && process.env.QA_OPEN_BOARD_ATTACK_OVERLAY !== "1"
  ) {
    await captureQaScreenshotIfRequested(window);
  }
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    registerIpc();
    registerAppActivateHandler();
    await createWindow();
    initialBackgroundWindowReady = true;
    mainWindowUserActivationAllowedAfterMs = Date.now() + mainWindowActivateGraceMs;
    if (process.env.QA_OPEN_OPPONENT_OVERLAY === "1") {
      const window = await createOpponentOverlayWindow({ showWhenReady: true, qaDemo: true });
      await captureQaScreenshotIfRequested(window);
    } else if (process.env.QA_OPEN_OVERLAY === "1") {
      const window = await createOverlayWindow();
      await captureQaScreenshotIfRequested(window);
    } else if (process.env.QA_OPEN_ARENA_CHOICE_OVERLAY === "1") {
      const window = await createArenaChoiceOverlayWindow({ qaDemo: true });
      await captureQaScreenshotIfRequested(window);
    } else if (process.env.QA_OPEN_LADDER_DECK_OVERLAY === "1") {
      const mode = process.env.QA_LADDER_MODE === "wild" ? "wild" : "standard";
      const window = await createLadderDeckOverlayWindow({ showWhenReady: true, qaDemo: true, mode });
      await captureQaScreenshotIfRequested(window);
    } else if (process.env.QA_OPEN_BOARD_ATTACK_OVERLAY === "1") {
      const window = await createBoardAttackOverlayWindow(screen.getPrimaryDisplay().bounds, { qaDemo: true });
      if (!window) {
        throw new Error("场攻悬浮层渲染验证失败");
      }
      window.showInactive();
      await captureQaScreenshotIfRequested(window);
    } else if (process.env.QA_EXIT_AFTER_SCREENSHOT !== "1") {
      await createArenaChoiceOverlayWindow();
      automaticOverlayController.start();
      startOpponentSecretOverlayMonitor();
      startBoardAttackOverlayMonitor();
      startCardPreviewVisibilityMonitor();
      ladderDeckOverlayController.start();
    }
  });
}

function registerAppActivateHandler() {
  app.on("activate", () => {
    if (
      !shouldHandleAppActivate(
        initialBackgroundWindowReady,
        initialLaunchActivateObserved,
        Date.now(),
        mainWindowUserActivationAllowedAfterMs
      )
    ) {
      initialLaunchActivateObserved = true;
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      return;
    }

    void createWindow({ showWhenReady: true });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  automaticOverlayController.stop();
  stopOpponentSecretOverlayMonitor();
  stopBoardAttackOverlayMonitor();
  clearOpponentOverlayBoundsSaveTimer();
  clearOverlayBoundsSaveTimer();
  stopArenaChoiceOverlayMonitor();
  stopCardPreviewVisibilityMonitor();
  ladderDeckOverlayController.stop();
  hideCardPreviewWindow();
  void tracker.dispose();
});

function registerIpc() {
  const trustedIpcMain = {
    handle(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) {
      ipcMain.handle(channel, (event, ...args) => {
        assertTrustedIpcEvent(event, getTrustedWebContents());
        return handler(event, ...args);
      });
    }
  };
  registerOpponentOverlayIpc(trustedIpcMain, opponentOverlayWindowController);
  const secureHandle = trustedIpcMain.handle.bind(trustedIpcMain);
  secureHandle("tracker:discover-logs", () => discoverLogCandidates());
  secureHandle("tracker:get-state", () => tracker.getState());
  secureHandle("tracker:get-ladder-deck-recommendation", async (event, mode: unknown) => {
    if (mode !== "standard" && mode !== "wild") throw new Error("天梯模式无效");
    const result = await ladderDeckRecommendations.get(mode);
    if (event.sender === ladderDeckOverlayWindow?.webContents && resolveLadderDeckMode(tracker.getState()) === mode) {
      currentLadderDeckCode = result.status === "ready" ? result.recommendation.deckCode : undefined;
    }
    return result;
  });
  secureHandle("tracker:copy-ladder-deck-code", (event, deckCode: unknown) => {
    const isQaDeckCode = process.env.QA_OPEN_LADDER_DECK_OVERLAY === "1" && typeof deckCode === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(deckCode);
    if (event.sender !== ladderDeckOverlayWindow?.webContents || typeof deckCode !== "string" || (!isQaDeckCode && deckCode !== currentLadderDeckCode)) {
      throw new Error("只能复制当前已加载的推荐卡组代码");
    }
    clipboard.writeText(deckCode);
  });
  secureHandle("tracker:close-ladder-deck-overlay", (event) => {
    if (event.sender !== ladderDeckOverlayWindow?.webContents) return;
    ladderDeckOverlayController.suppressCurrentMode();
    currentLadderDeckCode = undefined;
    ladderDeckOverlayWindow?.close();
  });
  secureHandle("tracker:list-card-library", async (_event, query: unknown): Promise<CardLibraryResult> => {
    try {
      const loaded = await cardLibraryData.loadCardDatabase();
      cardLibraryMetadata = {
        source: loaded.source ?? cardLibraryMetadata.source,
        version: loaded.version ?? cardLibraryMetadata.version
      };
      if (!loaded.database) {
        return {
          ...createCardLibraryErrorResult(query, "本地卡牌数据库不可用，请检查网络或稍后重试。", loaded.warnings),
          ...cardLibraryMetadata
        };
      }

      return {
        ...listCardLibrary(loaded.database, query),
        ...cardLibraryMetadata,
        warnings: loaded.warnings
      };
    } catch (error) {
      return createCardLibraryErrorResult(query, `读取本地卡牌数据库失败：${formatLibraryError(error)}`);
    }
  });
  secureHandle("tracker:import-deck", (_event, deckText: string) => tracker.importDeck(deckText));
  secureHandle("tracker:scan-import-collection-decks", (_event, options?: { logPath?: string }) =>
    syncCollectionDecksForTracker(options)
  );
  secureHandle("tracker:import-collection-deck", async (_event, deckId: string) => {
    const deck = await collectionDecks.getDeck(deckId);
    if (!deck) {
      throw new Error("未找到本地收藏套牌，请先扫描收藏套牌。");
    }

    return tracker.importDeck(deck.rawDeckString ?? deck.rawText);
  });
  secureHandle("tracker:ensure-log-config", () => ensureLogConfig());
  secureHandle("tracker:inspect-log-config", () => inspectLogConfig());
  secureHandle("tracker:toggle-overlay", async () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (!overlayWindow.isVisible()) {
        automaticOverlayController.clearSuppression();
        overlayWindow.showInactive();
        return true;
      }
      automaticOverlayController.suppressCurrentContext();
      overlayWindow.close();
      overlayWindow = undefined;
      return false;
    }

    automaticOverlayController.clearSuppression();
    await createOverlayWindow();
    return true;
  });
  secureHandle("tracker:toggle-opponent-overlay", async () => {
    if (opponentOverlayWindow && !opponentOverlayWindow.isDestroyed()) {
      if (opponentOverlayWindowState?.isCollapsed()) {
        await expandOpponentOverlayWindow(true);
        return true;
      }
      await collapseOpponentOverlayWindow();
      return false;
    }

    await createOpponentOverlayWindow({ showWhenReady: true });
    return true;
  });
  secureHandle("tracker:show-card-preview", (event, request: CardPreviewRequest) =>
    showCardPreviewWindow(BrowserWindow.fromWebContents(event.sender), request)
  );
  secureHandle("tracker:hide-card-preview", () => {
    hideCardPreviewWindow();
  });
  secureHandle("tracker:minimize-main", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return false;
    }

    mainWindow.minimize();
    return true;
  });
  secureHandle("tracker:start", (_event, options?: { logPath?: string; deckText?: string }) => startTrackingAutomatically(options));
  secureHandle("tracker:pause", () => tracker.pause());
  secureHandle("tracker:select-log-path", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择炉石日志文件或 Logs 目录",
      properties: ["openFile", "openDirectory"],
      filters: [{ name: "Log", extensions: ["log"] }]
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
}

function getTrustedWebContents(): ReadonlySet<Electron.WebContents> {
  return new Set(
    [mainWindow, overlayWindow, opponentOverlayWindow, boardAttackOverlayWindow, ladderDeckOverlayWindow, arenaChoiceOverlayWindow, cardPreviewWindow]
      .filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed()))
      .map((window) => window.webContents)
  );
}

function formatLibraryError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function syncCollectionDecksForTracker(options?: { logPath?: string }): Promise<CollectionDeckScanResult> {
  const result = await collectionDecks.scanAndImportDecks(options);
  if (result.status === "ok") {
    tracker.setCollectionDecks(result.decks as readonly CollectionDeck[]);
  }
  return result;
}

async function startTrackingAutomatically(options?: { logPath?: string; deckText?: string }) {
  return tracker.start(options);
}

async function createOverlayWindow(options: { showWhenReady?: boolean } = {}) {
  const savedBounds = await loadOverlayWindowBounds();
  overlayWindow = new BrowserWindow({
    ...savedBounds,
    minWidth: 300,
    minHeight: 400,
    title: "炉石记牌小窗",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: createSecureWebPreferences(path.join(__dirname, "preload.cjs"))
  });
  configureSecureNavigation(overlayWindow);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  tracker.attachWindow(overlayWindow);
  const createdWindow = overlayWindow;

  createdWindow.on("move", () => {
    overlayInteractionActiveUntil = Date.now() + 1_200;
    scheduleOverlayWindowBoundsSave(createdWindow);
  });
  createdWindow.on("resize", () => {
    overlayInteractionActiveUntil = Date.now() + 1_200;
    scheduleOverlayWindowBoundsSave(createdWindow);
  });
  createdWindow.on("close", () => {
    clearOverlayBoundsSaveTimer();
    void saveOverlayWindowBounds(createdWindow.getBounds());
  });

  overlayWindow.on("closed", () => {
    hideCardPreviewWindow();
    overlayWindow = undefined;
    if (mainWindow && !mainWindow.isDestroyed()) {
      tracker.attachWindow(mainWindow);
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await overlayWindow.loadURL(`${devUrl}?overlay=1`);
  } else {
    await overlayWindow.loadFile(path.join(__dirname, "../../dist/index.html"), { query: { overlay: "1" } });
  }

  if (options.showWhenReady !== false) {
    overlayWindow.showInactive();
  }

  return overlayWindow;
}

async function loadOverlayWindowBounds() {
  const filePath = getOverlayWindowBoundsPath();
  const raw = await fs.readFile(filePath, "utf8").catch(() => undefined);
  let saved: unknown;
  if (raw) {
    try {
      saved = JSON.parse(raw);
    } catch {
      saved = undefined;
    }
  }
  return normalizeOverlayWindowBounds(saved, screen.getAllDisplays().map((display) => display.workArea));
}

function scheduleOverlayWindowBoundsSave(window: BrowserWindow) {
  clearOverlayBoundsSaveTimer();
  overlayBoundsSaveTimer = setTimeout(() => {
    overlayBoundsSaveTimer = undefined;
    if (!window.isDestroyed()) {
      void saveOverlayWindowBounds(window.getBounds());
    }
  }, 250);
  overlayBoundsSaveTimer.unref();
}

function clearOverlayBoundsSaveTimer() {
  if (overlayBoundsSaveTimer) {
    clearTimeout(overlayBoundsSaveTimer);
    overlayBoundsSaveTimer = undefined;
  }
}

async function saveOverlayWindowBounds(bounds: { x: number; y: number; width: number; height: number }) {
  const filePath = getOverlayWindowBoundsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(bounds)}\n`, "utf8");
}

function getOverlayWindowBoundsPath() {
  return path.join(app.getPath("userData"), "overlay-window-bounds.json");
}

async function createLadderDeckOverlayWindow(options: { showWhenReady?: boolean; qaDemo?: boolean; mode?: LadderMode } = {}) {
  if (ladderDeckOverlayWindow && !ladderDeckOverlayWindow.isDestroyed()) return ladderDeckOverlayWindow;
  const bounds = getLadderDeckOverlayBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea);
  if (!bounds) throw new Error("当前屏幕空间不足，无法显示天梯推荐");

  ladderDeckOverlayWindow = new BrowserWindow({
    ...bounds,
    minWidth: 190,
    minHeight: 400,
    title: "炉石天梯推荐",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: createSecureWebPreferences(path.join(__dirname, "preload.cjs"))
  });
  configureSecureNavigation(ladderDeckOverlayWindow);
  ladderDeckOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ladderDeckOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  ladderDeckOverlayWindow.on("move", () => {
    ladderDeckOverlayInteractionActiveUntil = Date.now() + 1_200;
  });
  ladderDeckOverlayWindow.on("resize", () => {
    ladderDeckOverlayInteractionActiveUntil = Date.now() + 1_200;
  });
  ladderDeckOverlayWindow.on("closed", () => {
    currentLadderDeckCode = undefined;
    ladderDeckOverlayWindow = undefined;
  });

  const mode = options.mode ?? resolveLadderDeckMode(tracker.getState()) ?? "standard";
  const params = new URLSearchParams({ "ladder-deck-overlay": "1", mode });
  if (options.qaDemo) params.set("qa-ladder-demo", "1");
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    params.forEach((value, key) => url.searchParams.set(key, value));
    await ladderDeckOverlayWindow.loadURL(url.toString());
  } else {
    await ladderDeckOverlayWindow.loadFile(path.join(__dirname, "../../dist/index.html"), { query: Object.fromEntries(params) });
  }
  if (options.showWhenReady !== false) ladderDeckOverlayWindow.showInactive();
  return ladderDeckOverlayWindow;
}

async function updateLadderDeckOverlayMode(mode: LadderMode) {
  const result = await ladderDeckRecommendations.get(mode);
  if (resolveLadderDeckMode(tracker.getState()) !== mode || !ladderDeckOverlayWindow || ladderDeckOverlayWindow.isDestroyed()) return;
  currentLadderDeckCode = result.status === "ready" ? result.recommendation.deckCode : undefined;
  ladderDeckOverlayWindow.webContents.send("tracker:ladder-deck-recommendation:update", mode, result);
}

async function createOpponentOverlayWindow(options: { showWhenReady?: boolean; qaDemo?: boolean } = {}) {
  const showWhenReady = options.showWhenReady ?? true;
  if (opponentOverlayWindow && !opponentOverlayWindow.isDestroyed()) {
    if (showWhenReady) {
      if (opponentOverlayWindowState?.isCollapsed()) {
        await expandOpponentOverlayWindow(true);
      } else {
        opponentOverlayWindow.show();
        opponentOverlayWindow.focus();
      }
    }
    return opponentOverlayWindow;
  }

  const expandedBounds = await loadOpponentOverlayBounds();
  opponentOverlayWindowState = new OpponentOverlayWindowState(expandedBounds);

  opponentOverlayWindow = new BrowserWindow({
    ...expandedBounds,
    minWidth: 52,
    minHeight: 38,
    show: false,
    title: "炉石对手出牌",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    backgroundColor: "#00000000",
    webPreferences: createSecureWebPreferences(path.join(__dirname, "preload.cjs"))
  });
  configureSecureNavigation(opponentOverlayWindow);
  opponentOverlayWindow.setMinimumSize(220, 150);
  opponentOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  opponentOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  tracker.attachWindow(opponentOverlayWindow);

  opponentOverlayWindow.on("closed", () => {
    hideCardPreviewWindow();
    opponentOverlayWindow = undefined;
    opponentOverlayWindowState = undefined;
  });
  opponentOverlayWindow.on("move", scheduleOpponentOverlayBoundsSave);
  opponentOverlayWindow.on("resize", scheduleOpponentOverlayBoundsSave);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    url.searchParams.set("opponent-overlay", "1");
    if (options.qaDemo) {
      url.searchParams.set("qa-opponent-demo", "1");
    }
    await opponentOverlayWindow.loadURL(url.toString());
  } else {
    await opponentOverlayWindow.loadFile(path.join(__dirname, "../../dist/index.html"), {
      query: {
        "opponent-overlay": "1",
        ...(options.qaDemo ? { "qa-opponent-demo": "1" } : {})
      }
    });
  }

  if (showWhenReady) {
    opponentOverlayWindow.show();
    opponentOverlayWindow.focus();
  }

  return opponentOverlayWindow;
}

async function collapseOpponentOverlayWindow() {
  return opponentOverlayWindowController.collapse();
}

async function expandOpponentOverlayWindow(focus: boolean) {
  return opponentOverlayWindowController.expand(focus);
}

function scheduleOpponentOverlayBoundsSave() {
  if (!opponentOverlayWindow || opponentOverlayWindow.isDestroyed() || opponentOverlayWindowState?.isCollapsed()) {
    return;
  }
  clearOpponentOverlayBoundsSaveTimer();
  opponentOverlayBoundsSaveTimer = setTimeout(() => {
    opponentOverlayBoundsSaveTimer = undefined;
    if (!opponentOverlayWindow || opponentOverlayWindow.isDestroyed() || opponentOverlayWindowState?.isCollapsed()) {
      return;
    }
    const bounds = opponentOverlayWindow.getBounds();
    opponentOverlayWindowState?.updateExpandedBounds(bounds);
    void saveOpponentOverlayBounds(bounds);
  }, 180);
  opponentOverlayBoundsSaveTimer.unref();
}

function clearOpponentOverlayBoundsSaveTimer() {
  if (opponentOverlayBoundsSaveTimer) {
    clearTimeout(opponentOverlayBoundsSaveTimer);
    opponentOverlayBoundsSaveTimer = undefined;
  }
}

async function loadOpponentOverlayBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const fallback = {
    x: display.x + Math.max(0, display.width - 250 - 24),
    y: display.y + Math.max(0, Math.round((display.height - 170) / 2)),
    width: 250,
    height: 170
  };
  try {
    const value = JSON.parse(await fs.readFile(getOpponentOverlayBoundsPath(), "utf8")) as Partial<typeof fallback>;
    if ([value.x, value.y, value.width, value.height].every((part) => typeof part === "number" && Number.isFinite(part))) {
      const width = Math.min(display.width, Math.max(220, value.width!));
      const height = Math.min(display.height, Math.max(150, value.height!));
      return {
        x: Math.min(Math.max(display.x, value.x!), display.x + display.width - width),
        y: Math.min(Math.max(display.y, value.y!), display.y + display.height - height),
        width,
        height
      };
    }
  } catch {
    // The default bounds are used until the user moves or resizes the window.
  }
  return fallback;
}

async function saveOpponentOverlayBounds(bounds: { x: number; y: number; width: number; height: number }) {
  await fs.mkdir(path.dirname(getOpponentOverlayBoundsPath()), { recursive: true });
  await fs.writeFile(getOpponentOverlayBoundsPath(), `${JSON.stringify(bounds)}\n`, "utf8");
}

function getOpponentOverlayBoundsPath() {
  return path.join(app.getPath("userData"), "opponent-overlay-window-bounds.json");
}

function startOpponentSecretOverlayMonitor() {
  if (opponentSecretOverlayMonitor) {
    return;
  }
  opponentSecretOverlayMonitor = setInterval(() => {
    const count = tracker.getState().opponentSecrets?.length ?? 0;
    if (opponentSecretOverlayVisibility.update(count)) {
      void showOpponentOverlayInactive();
    }
  }, 250);
  opponentSecretOverlayMonitor.unref();
}

function stopOpponentSecretOverlayMonitor() {
  if (!opponentSecretOverlayMonitor) {
    return;
  }
  clearInterval(opponentSecretOverlayMonitor);
  opponentSecretOverlayMonitor = undefined;
}

async function showOpponentOverlayInactive() {
  const window = await createOpponentOverlayWindow({ showWhenReady: false });
  if (!window.isDestroyed()) {
    window.showInactive();
  }
}

function startBoardAttackOverlayMonitor() {
  if (boardAttackOverlayMonitor) {
    return;
  }
  boardAttackOverlayMonitor = setInterval(() => {
    void refreshBoardAttackOverlayWindow();
  }, 250);
  boardAttackOverlayMonitor.unref();
  void refreshBoardAttackOverlayWindow();
}

function stopBoardAttackOverlayMonitor() {
  if (boardAttackOverlayMonitor) {
    clearInterval(boardAttackOverlayMonitor);
    boardAttackOverlayMonitor = undefined;
  }
  boardAttackOverlayWindow?.close();
  boardAttackOverlayWindow = undefined;
}

async function refreshBoardAttackOverlayWindow() {
  if (boardAttackOverlayRefreshInFlight) {
    return;
  }
  boardAttackOverlayRefreshInFlight = true;
  try {
    const frontmostAppName = await getFrontmostAppName();
    if (!shouldShowBoardAttackOverlay(Boolean(tracker.getState().gameActive), frontmostAppName)) {
      boardAttackOverlayWindow?.hide();
      return;
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const window = await createBoardAttackOverlayWindow(display.bounds);
    if (window && !window.isDestroyed()) {
      window.setBounds(display.bounds, false);
      window.showInactive();
    }
  } finally {
    boardAttackOverlayRefreshInFlight = false;
  }
}

async function createBoardAttackOverlayWindow(
  bounds: { x: number; y: number; width: number; height: number },
  options: { qaDemo?: boolean } = {}
) {
  if (boardAttackOverlayWindow && !boardAttackOverlayWindow.isDestroyed()) {
    return boardAttackOverlayWindow;
  }
  boardAttackOverlayWindow = new BrowserWindow(
    getBoardAttackOverlayWindowOptions(bounds, path.join(__dirname, "preload.cjs"))
  );
  configureSecureNavigation(boardAttackOverlayWindow);
  configureBoardAttackOverlayWindow(boardAttackOverlayWindow);
  tracker.attachWindow(boardAttackOverlayWindow);
  boardAttackOverlayWindow.on("closed", () => {
    boardAttackOverlayWindow = undefined;
  });

  try {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
      const url = new URL(devUrl);
      for (const [key, value] of Object.entries(getBoardAttackOverlayQuery(Boolean(options.qaDemo)))) {
        url.searchParams.set(key, value);
      }
      await boardAttackOverlayWindow.loadURL(url.toString());
    } else {
      await boardAttackOverlayWindow.loadFile(path.join(__dirname, "../../dist/index.html"), {
        query: getBoardAttackOverlayQuery(Boolean(options.qaDemo))
      });
    }
    const rendererStatus = await boardAttackOverlayWindow.webContents.executeJavaScript(`
      (() => {
        const canvas = document.querySelector(".board-attack-overlay-canvas");
        const icons = document.querySelectorAll(".board-attack-icon");
        const ready = document.documentElement.dataset.rendererReady === "true";
        const htmlBackground = getComputedStyle(document.documentElement).backgroundColor;
        const bodyBackground = getComputedStyle(document.body).backgroundColor;
        return { ready, hasCanvas: Boolean(canvas), iconCount: icons.length, htmlBackground, bodyBackground };
      })()
    `);
    const rendererReady = rendererStatus.ready
      && rendererStatus.hasCanvas
      && rendererStatus.iconCount === 2
      && rendererStatus.htmlBackground === "rgba(0, 0, 0, 0)"
      && rendererStatus.bodyBackground === "rgba(0, 0, 0, 0)";
    if (rendererReady) {
      return boardAttackOverlayWindow;
    }
    console.error("场攻悬浮层拒绝显示", rendererStatus);
  } catch {
    // A broken overlay must remain invisible and be recreated on the next check.
  }
  if (boardAttackOverlayWindow && !boardAttackOverlayWindow.isDestroyed()) {
    boardAttackOverlayWindow.destroy();
  }
  boardAttackOverlayWindow = undefined;
  return undefined;
}

async function createArenaChoiceOverlayWindow(options: { qaDemo?: boolean } = {}) {
  if (arenaChoiceOverlayWindow && !arenaChoiceOverlayWindow.isDestroyed()) {
    return arenaChoiceOverlayWindow;
  }

  const bounds = getArenaChoiceOverlayBounds();
  arenaChoiceOverlayWindow = new BrowserWindow({
    ...bounds,
    title: "炉石竞技场数据条",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    show: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: createSecureWebPreferences(path.join(__dirname, "preload.cjs"))
  });
  configureSecureNavigation(arenaChoiceOverlayWindow);
  arenaChoiceOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  arenaChoiceOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  arenaChoiceOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
  tracker.attachWindow(arenaChoiceOverlayWindow);

  arenaChoiceOverlayWindow.on("closed", () => {
    arenaChoiceOverlayWindow = undefined;
    stopArenaChoiceOverlayMonitor();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    url.searchParams.set("arena-choice-overlay", "1");
    if (options.qaDemo) {
      url.searchParams.set("qa-arena-demo", "1");
    }
    await arenaChoiceOverlayWindow.loadURL(url.toString());
  } else {
    await arenaChoiceOverlayWindow.loadFile(path.join(__dirname, "../../dist/index.html"), {
      query: {
        "arena-choice-overlay": "1",
        ...(options.qaDemo ? { "qa-arena-demo": "1" } : {})
      }
    });
  }

  if (options.qaDemo) {
    arenaChoiceOverlayWindow.showInactive();
  } else {
    startArenaChoiceOverlayMonitor();
    void refreshArenaChoiceOverlayWindow();
  }

  return arenaChoiceOverlayWindow;
}

async function createCardPreviewWindow() {
  if (cardPreviewWindow && !cardPreviewWindow.isDestroyed()) {
    return cardPreviewWindow;
  }

  cardPreviewWindow = new BrowserWindow({
    width: cardPreviewWidth,
    height: cardPreviewHeight,
    title: "炉石卡牌说明",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    show: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: createSecureWebPreferences(path.join(__dirname, "preload.cjs"))
  });
  configureSecureNavigation(cardPreviewWindow);
  cardPreviewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  cardPreviewWindow.setAlwaysOnTop(true, "screen-saver");
  cardPreviewWindow.setIgnoreMouseEvents(false);

  cardPreviewWindow.on("closed", () => {
    unregisterCardPreviewPinShortcut();
    clearCardPreviewAutoHideTimer();
    cardPreviewSourceWindow = undefined;
    cardPreviewPinned = false;
    lastCardPreviewRequestKey = undefined;
    cardPreviewRequestSerial += 1;
    cardPreviewWindow = undefined;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    url.searchParams.set("card-preview", "1");
    await cardPreviewWindow.loadURL(url.toString());
  } else {
    await cardPreviewWindow.loadFile(path.join(__dirname, "../../dist/index.html"), {
      query: { "card-preview": "1" }
    });
  }

  return cardPreviewWindow;
}

async function showCardPreviewWindow(sourceWindow: BrowserWindow | null, request: CardPreviewRequest) {
  if (!sourceWindow || sourceWindow.isDestroyed() || !isCardPreviewRequest(request)) {
    return;
  }

  const hover = cardPreviewVisibilityGate.beginHover();
  const frontmostAppName = await getFrontmostAppName();
  if (!cardPreviewVisibilityGate.canShow(hover, frontmostAppName)) {
    hideCardPreviewWindow();
    return;
  }

  const previewWindow = await createCardPreviewWindow();
  if (previewWindow.isDestroyed()) {
    return;
  }
  cardPreviewSourceWindow = sourceWindow;
  registerCardPreviewPinShortcut();

  const requestKey = getCardPreviewRequestKey(sourceWindow, request);
  if (previewWindow.isVisible() && lastCardPreviewRequestKey === requestKey) {
    scheduleCardPreviewAutoHide();
    return;
  }

  const requestSerial = ++cardPreviewRequestSerial;
  previewWindow.webContents.send("tracker:card-preview:update", request.details);
  const contentHeight = await getCardPreviewContentHeight(previewWindow);
  const latestFrontmostAppName = await getFrontmostAppName();
  if (
    requestSerial !== cardPreviewRequestSerial ||
    previewWindow.isDestroyed() ||
    !cardPreviewVisibilityGate.canShow(hover, latestFrontmostAppName)
  ) {
    return;
  }

  previewWindow.setBounds(getCardPreviewBounds(sourceWindow, request, contentHeight));
  cardPreviewSourceWindow = sourceWindow;
  registerCardPreviewPinShortcut();
  previewWindow.showInactive();
  lastCardPreviewRequestKey = requestKey;
  scheduleCardPreviewAutoHide();
}

function hideCardPreviewWindow() {
  unregisterCardPreviewPinShortcut();
  cardPreviewVisibilityGate.invalidate();
  clearCardPreviewAutoHideTimer();
  setCardPreviewPinned(false);
  cardPreviewSourceWindow = undefined;
  lastCardPreviewRequestKey = undefined;
  cardPreviewRequestSerial += 1;
  if (!cardPreviewWindow || cardPreviewWindow.isDestroyed()) {
    return;
  }

  cardPreviewWindow.hide();
}

function startCardPreviewVisibilityMonitor() {
  stopCardPreviewVisibilityMonitor();
  cardPreviewVisibilityMonitor = setInterval(() => {
    void refreshCardPreviewVisibility();
  }, cardPreviewVisibilityIntervalMs);
  cardPreviewVisibilityMonitor.unref();
}

function stopCardPreviewVisibilityMonitor() {
  if (!cardPreviewVisibilityMonitor) {
    return;
  }
  clearInterval(cardPreviewVisibilityMonitor);
  cardPreviewVisibilityMonitor = undefined;
}

async function refreshCardPreviewVisibility() {
  if (cardPreviewVisibilityRefreshInFlight || !cardPreviewWindow || cardPreviewWindow.isDestroyed()) {
    return;
  }

  cardPreviewVisibilityRefreshInFlight = true;
  let frontmostAppName: string | undefined;
  try {
    frontmostAppName = await getFrontmostAppName();
  } finally {
    cardPreviewVisibilityRefreshInFlight = false;
  }

  if (!cardPreviewPinned && cardPreviewVisibilityGate.refresh(frontmostAppName)) {
    hideCardPreviewWindow();
  }
}

function scheduleCardPreviewAutoHide() {
  clearCardPreviewAutoHideTimer();
  if (cardPreviewPinned) {
    return;
  }
  cardPreviewAutoHideTimer = setTimeout(hideCardPreviewWindow, cardPreviewAutoHideMs);
  cardPreviewAutoHideTimer.unref();
}

function registerCardPreviewPinShortcut() {
  if (globalShortcut.isRegistered(cardPreviewPinAccelerator)) {
    return;
  }

  globalShortcut.register(cardPreviewPinAccelerator, () => {
    if (!cardPreviewWindow || cardPreviewWindow.isDestroyed() || !cardPreviewWindow.isVisible()) {
      return;
    }
    setCardPreviewPinned(!cardPreviewPinned);
  });
}

function unregisterCardPreviewPinShortcut() {
  if (globalShortcut.isRegistered(cardPreviewPinAccelerator)) {
    globalShortcut.unregister(cardPreviewPinAccelerator);
  }
}

function setCardPreviewPinned(pinned: boolean) {
  cardPreviewPinned = pinned;
  if (pinned) {
    clearCardPreviewAutoHideTimer();
  }

  if (cardPreviewSourceWindow && !cardPreviewSourceWindow.isDestroyed()) {
    cardPreviewSourceWindow.webContents.send("tracker:card-preview:pinned", pinned);
  }
  if (cardPreviewWindow && !cardPreviewWindow.isDestroyed()) {
    cardPreviewWindow.webContents.send("tracker:card-preview:pinned", pinned);
  }
}

function clearCardPreviewAutoHideTimer() {
  if (!cardPreviewAutoHideTimer) {
    return;
  }

  clearTimeout(cardPreviewAutoHideTimer);
  cardPreviewAutoHideTimer = undefined;
}

function isCardPreviewRequest(value: unknown): value is CardPreviewRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as CardPreviewRequest;
  const rect = request.anchorRect;
  return (
    Boolean(request.details) &&
    typeof request.details.name === "string" &&
    rect !== undefined &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  );
}

function getCardPreviewBounds(sourceWindow: BrowserWindow, request: CardPreviewRequest, desiredHeight = cardPreviewHeight) {
  const sourceBounds = sourceWindow.getBounds();
  const display = screen.getDisplayMatching(sourceBounds);
  const area = display.workArea;
  const width = Math.min(cardPreviewWidth, Math.max(220, area.width - 12));
  const height = Math.min(Math.max(cardPreviewMinHeight, desiredHeight), cardPreviewHeight, Math.max(cardPreviewMinHeight, area.height - 12));
  const rightX = sourceBounds.x + sourceBounds.width + cardPreviewGap;
  const leftX = sourceBounds.x - width - cardPreviewGap;
  const maxX = area.x + area.width - width - 6;
  const x = rightX <= maxX
    ? rightX
    : leftX >= area.x + 6
      ? leftX
      : clamp(sourceBounds.x + request.anchorRect.right + cardPreviewGap, area.x + 6, maxX);
  const preferredY = sourceBounds.y + request.anchorRect.top - 8;
  const maxY = area.y + area.height - height - 6;

  return {
    x,
    y: clamp(preferredY, area.y + 6, maxY),
    width,
    height
  };
}

function getCardPreviewRequestKey(sourceWindow: BrowserWindow, request: CardPreviewRequest): string {
  const sourceBounds = sourceWindow.getBounds();
  return JSON.stringify({
    sourceBounds: roundBounds(sourceBounds),
    anchorRect: roundCardPreviewAnchorRect(request.anchorRect),
    details: request.details
  });
}

function roundBounds(bounds: { x: number; y: number; width: number; height: number }) {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
}

function roundCardPreviewAnchorRect(rect: CardPreviewRequest["anchorRect"]): CardPreviewRequest["anchorRect"] {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

async function getCardPreviewContentHeight(previewWindow: BrowserWindow): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 40));

  try {
    const contentHeight = (await previewWindow.webContents.executeJavaScript(`
      (() => {
        const shell = document.querySelector(".card-preview-window-shell");
        if (!shell) return 0;
        const rect = shell.getBoundingClientRect();
        const styles = window.getComputedStyle(shell);
        const borderHeight = Number.parseFloat(styles.borderTopWidth || "0") + Number.parseFloat(styles.borderBottomWidth || "0");
        return Math.ceil(Math.max(shell.scrollHeight + borderHeight, rect.height));
      })()
    `)) as number;
    return Number.isFinite(contentHeight) && contentHeight > 0 ? contentHeight : cardPreviewHeight;
  } catch {
    return cardPreviewHeight;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function startArenaChoiceOverlayMonitor() {
  stopArenaChoiceOverlayMonitor();
  arenaChoiceOverlayMonitor = setInterval(() => {
    void refreshArenaChoiceOverlayWindow();
  }, 350);
  arenaChoiceOverlayMonitor.unref();
}

function stopArenaChoiceOverlayMonitor() {
  if (arenaChoiceOverlayMonitor) {
    clearInterval(arenaChoiceOverlayMonitor);
    arenaChoiceOverlayMonitor = undefined;
  }
}

async function refreshArenaChoiceOverlayWindow() {
  if (!arenaChoiceOverlayWindow || arenaChoiceOverlayWindow.isDestroyed()) {
    return;
  }

  if (arenaChoiceOverlayRefreshInFlight) {
    return;
  }

  arenaChoiceOverlayRefreshInFlight = true;
  let frontmostAppName: string | undefined;
  try {
    frontmostAppName = await getFrontmostAppName();
  } finally {
    arenaChoiceOverlayRefreshInFlight = false;
  }
  if (!arenaChoiceOverlayWindow || arenaChoiceOverlayWindow.isDestroyed()) {
    return;
  }

  const arena = tracker.getState().arena;
  const shouldShow = shouldShowArenaChoiceOverlay(arena, frontmostAppName);
  if (!shouldShow) {
    arenaChoiceOverlayWindow.hide();
    return;
  }

  arenaChoiceOverlayWindow.setBounds(getArenaChoiceOverlayBounds());
  arenaChoiceOverlayWindow.showInactive();
}

function getArenaChoiceOverlayBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.bounds;
  const overlayWidth = Math.max(660, Math.round(width * 0.51));

  return {
    x: x + Math.round(width * 0.15),
    y: y + Math.round(height * 0.58),
    width: overlayWidth,
    height: 62
  };
}

async function captureQaScreenshotIfRequested(window: BrowserWindow) {
  const screenshotPath = process.env.QA_SCREENSHOT_PATH;
  const inspectPath = process.env.QA_INSPECT_PATH;
  if (!screenshotPath && !inspectPath) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (process.env.QA_START_TRACKING === "1") {
    await window.webContents.executeJavaScript(`window.hearthstoneTracker?.start?.().then(() => undefined)`);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  if (process.env.QA_SCAN_COLLECTION === "1") {
    await window.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("手动导入") || button.textContent?.includes("导入卡组"))
        ?.click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await window.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("从收藏读取"))
        ?.click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  if (process.env.QA_OPEN_CARD_LIBRARY === "1") {
    await window.webContents.executeJavaScript(`
      document.querySelector('[aria-label="打开卡牌数据库"]')?.click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 1400));
  }

  const cardLibrarySearch = process.env.QA_CARD_LIBRARY_SEARCH;
  if (cardLibrarySearch) {
    await window.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[aria-label="搜索卡牌"]');
        if (!(input instanceof HTMLInputElement)) return;
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setValue?.call(input, ${JSON.stringify(cardLibrarySearch)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })();
    `);
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  if (process.env.QA_SHOW_CARD_PREVIEW === "1") {
    const anchorRect = { left: 16, top: 72, right: 196, bottom: 112, width: 180, height: 40 };
    if (process.env.QA_CARD_PREVIEW_SEQUENCE === "1") {
      await window.webContents.executeJavaScript(`
        window.hearthstoneTracker?.showCardPreview?.(${JSON.stringify({
          details: {
            dbfId: 1,
            name: "测试短卡",
            manaCost: 1,
            cardType: "法术",
            cardTypeId: 5,
            text: "短文本。",
            isSpell: true,
            relatedCards: []
          },
          anchorRect
        })});
      `);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    await window.webContents.executeJavaScript(`
      window.hearthstoneTracker?.showCardPreview?.(${JSON.stringify({
        details: {
          dbfId: 315,
          name: "火球术",
          manaCost: 4,
          cardType: "法术",
          cardTypeId: 5,
          heroClass: "法师",
          text: "造成 6 点伤害。",
          isSpell: true,
          relatedCards: [
            { dbfId: 621, name: "炎爆术", manaCost: 10, cardType: "法术", text: "造成 10 点伤害。" },
            { dbfId: 1001, name: "奥术飞弹", manaCost: 1, cardType: "法术", text: "造成 3 点伤害，随机分配到所有敌人身上。" }
          ]
        },
        anchorRect
      })});
    `);
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  if (process.env.QA_HOVER_CARD === "1") {
    await window.webContents.executeJavaScript(`
      (() => {
        const targets = Array.from(document.querySelectorAll(".overlay-card-hover-target, .card-hover-target"));
        const target = targets.find((element) => element.textContent?.includes("银樽海韵"))
          ?? targets.find((element) => element.textContent?.includes("抱团"));
        if (target) {
          target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, view: window }));
        }
      })();
    `);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (process.env.QA_COPY_LADDER_DECK === "1") {
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="复制卡组代码"]')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const waitAfterCardPreview = Number(process.env.QA_WAIT_AFTER_CARD_PREVIEW_MS);
  if (Number.isFinite(waitAfterCardPreview) && waitAfterCardPreview > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitAfterCardPreview));
  }

  if (inspectPath) {
    const inspectJson = (await window.webContents.executeJavaScript(`(async () => JSON.stringify({
      hasApi: Boolean(window.hearthstoneTracker),
      location: window.location.href,
      bodyText: document.body.innerText.slice(0, 500),
      trackerState: await window.hearthstoneTracker?.getState?.(),
      clipboardText: ${JSON.stringify(process.env.QA_COPY_LADDER_DECK === "1" ? clipboard.readText() : "")}
    }))()`)) as string;
    await fs.mkdir(path.dirname(inspectPath), { recursive: true });
    await fs.writeFile(inspectPath, `${inspectJson}\n`, "utf8");
  }

  if (screenshotPath) {
    const image = await window.capturePage();
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, image.toPNG());
  }

  const cardPreviewScreenshotPath = process.env.QA_CARD_PREVIEW_SCREENSHOT_PATH;
  if (cardPreviewScreenshotPath && cardPreviewWindow && !cardPreviewWindow.isDestroyed() && cardPreviewWindow.isVisible()) {
    const image = await cardPreviewWindow.capturePage();
    await fs.mkdir(path.dirname(cardPreviewScreenshotPath), { recursive: true });
    await fs.writeFile(cardPreviewScreenshotPath, image.toPNG());
  }

  if (process.env.QA_EXIT_AFTER_SCREENSHOT === "1") {
    app.exit(0);
  }
}
