import { appendFile, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { promises as nodeFs } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => os.tmpdir()
  },
  BrowserWindow: class BrowserWindow {}
}));

const tempDirs: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.doUnmock("../src/main/logDiscovery.js");
  vi.resetModules();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("TrackerService log selection", () => {
  it("returns to watching after a transient appended-log read error", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({ CardDataService: class { async loadCardDatabase() { return { warnings: [] }; } } }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(powerLog, "D 10:00:00 GameState.DebugPrintPower() - CREATE_GAME GameType=GT_RANKED\n", "utf8");
    const service = new TrackerService(undefined, { recognize: vi.fn(async () => ({ status: "ok" as const, texts: [] })) });
    await service.start({ logPath: powerLog });
    const originalOpen = nodeFs.open.bind(nodeFs);
    const openSpy = vi.spyOn(nodeFs, "open").mockRejectedValueOnce(new Error("temporary read failure"));
    await appendFile(powerLog, "D 10:00:01 transient\n", "utf8");
    await vi.waitFor(() => expect(service.getState().status).toBe("error"));
    openSpy.mockImplementation(originalOpen);
    await appendFile(powerLog, "D 10:00:02 recovered\n", "utf8");
    await vi.waitFor(() => expect(service.getState().status).toBe("watching"));
    openSpy.mockRestore();
    await service.dispose();
  });

  it("serializes overlapping updates from the same log path", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService { async loadCardDatabase() { return { warnings: [] }; } }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    const decksLog = join(sessionDir, "Decks.log");
    await writeFile(powerLog, "D 10:00:00 GameState.DebugPrintPower() - CREATE_GAME GameType=GT_RANKED\n", "utf8");
    await writeFile(decksLog, "initial\n", "utf8");
    let calls = 0;
    let active = 0;
    let maxActive = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scanner = {
      scanAndImportDecks: vi.fn(async () => {
        calls += 1;
        if (calls > 1) {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await gate;
          active -= 1;
        }
        return { status: "ok" as const, decks: [] };
      })
    };
    const service = new TrackerService(scanner, { recognize: vi.fn(async () => ({ status: "ok" as const, texts: [] })) });
    await service.start({ logPath: powerLog });

    await appendFile(decksLog, "first\n", "utf8");
    await vi.waitFor(() => expect(calls).toBe(2));
    await appendFile(decksLog, "second\n", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 250));
    release?.();
    await vi.waitFor(() => expect(calls).toBe(3));
    await service.dispose();

    expect(maxActive).toBe(1);
  });

  it("keeps the active Arena deck when Decks.log refreshes a constructed deck", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { database: { "1001": { dbfId: 1001, name: "Arena Card", cardId: "ARENA_001" } }, warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService { async loadRatings() { return { warnings: [] }; } }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    const decksLog = join(sessionDir, "Decks.log");
    await writeFile(arenaLog, [
      "D 10:00:00 DraftManager.OnChoicesAndContents - Draft Deck ID: 1, Hero Card = HERO_08",
      "D 10:00:00 DraftManager.OnChoicesAndContents - Draft deck contains card ARENA_001",
      "D 10:00:01 SetDraftMode - ACTIVE_DRAFT_DECK"
    ].join("\n") + "\n", "utf8");
    await writeFile(decksLog, "initial\n", "utf8");
    const constructedDeck = {
      id: "constructed", name: "Standard Deck", format: "标准",
      cards: [{ name: "Constructed Card", count: 30, cardId: "STANDARD_001" }],
      rawText: "", sourcePath: decksLog, updatedAt: new Date().toISOString(), warnings: []
    };
    const scanner = { scanAndImportDecks: vi.fn(async () => ({ status: "ok" as const, decks: [constructedDeck], activeDeck: constructedDeck })) };
    const service = new TrackerService(scanner, { recognize: vi.fn(async () => ({ status: "ok" as const, texts: [] })) });

    await service.start({ logPath: arenaLog });
    expect(service.getState().deckName).toBe("竞技场牌库");
    await appendFile(decksLog, "changed\n", "utf8");
    await vi.waitFor(() => expect(scanner.scanAndImportDecks).toHaveBeenCalledTimes(2));

    expect(service.getState().deckName).toBe("竞技场牌库");
    expect(service.getState().arena?.status).toBe("complete");
    await service.dispose();
  });

  it("keeps the overlay context alive when Player.log starts a game but Power.log stalls", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const { resolveAutomaticOverlayContext } = await import("../src/main/automaticOverlayController.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    const playerLog = join(sessionDir, "Player.log");
    await writeFile(
      powerLog,
      [
        "D 16:28:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME GameType=GT_RANKED",
        "D 16:29:00.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Old Card id=64 zone=DECK cardId=OLD_001 player=1] tag=ZONE value=HAND"
      ].join("\n") + "\n",
      "utf8"
    );
    await writeFile(playerLog, "D 16:29:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=本地玩家#1234\n", "utf8");
    const service = new TrackerService(undefined, {
      recognize: vi.fn(async () => ({ status: "ok" as const, texts: [] }))
    });

    await service.start({ logPath: powerLog, deckText: "1x Old Card" });
    await appendFile(playerLog, "I 16:52:02.000 Network.GameHandle - SERVER_GAME_STARTED\n", "utf8");
    await vi.waitFor(() => expect(service.getState().error).toContain("对局已开始"));
    const state = service.getState();
    await service.dispose();

    expect(resolveAutomaticOverlayContext(state)).toBe("constructed-game:waiting");
    expect(state.error).toContain("对局已开始");
    expect(state.error).toContain("Power.log");
    expect(state.deck).toEqual([]);
    expect(state.friendlyHand).toEqual([]);
    expect(state.friendlyOther).toEqual([]);
  });

  it("restores the waiting overlay after restart when Player.log is newer than stalled Power.log", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    const playerLog = join(sessionDir, "Player.log");
    await writeFile(powerLog, "D 16:29:00.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=FINAL_GAMEOVER\n", "utf8");
    await writeFile(playerLog, "I 16:52:02.000 Network.GameHandle - SERVER_GAME_STARTED\n", "utf8");
    const oldTime = new Date("2026-07-12T16:29:00+08:00");
    const newTime = new Date("2026-07-12T16:52:02+08:00");
    await utimes(powerLog, oldTime, oldTime);
    await utimes(playerLog, newTime, newTime);
    const service = new TrackerService();

    const state = await service.start({ logPath: powerLog, deckText: "1x Old Card" });
    await service.dispose();

    expect(state.gameActive).toBe(true);
    expect(state.deckName).toBeUndefined();
    expect(state.deck).toEqual([]);
    expect(state.friendlyHand).toEqual([]);
    expect(state.friendlyOther).toEqual([]);
  });

  it("recovers from a missing game-end log after the constructed deck screen is confirmed twice", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    const selectedDeck = {
      id: "selected-wild",
      name: "巨像",
      format: "狂野",
      cards: [{ name: "Wild Card", count: 30 }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-12T00:00:00.000Z",
      warnings: []
    };
    await writeFile(
      powerLog,
      [
        "D 16:15:00.000 PowerTaskList.DebugPrintPower() - CREATE_GAME GameType=GT_RANKED",
        "D 16:16:00.000 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Old Card id=64 zone=DECK cardId=OLD_001 player=1] tag=ZONE value=HAND"
      ].join("\n") + "\n",
      "utf8"
    );
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({ status: "ok" as const, decks: [selectedDeck] }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [
          { text: "狂野对战", confidence: 1, x: 0.35, y: 0.89, width: 0.06, height: 0.02 },
          { text: "巨像", confidence: 1, x: 0.72, y: 0.34, width: 0.06, height: 0.02 }
        ]
      }))
    };
    const service = new TrackerService(scanner, recognizer);

    const initialState = await service.start({ logPath: powerLog });
    expect(initialState.gameActive).toBe(true);

    await vi.waitFor(() => expect(recognizer.recognize).toHaveBeenCalledTimes(2), { timeout: 2_000, interval: 50 });
    const recoveredState = service.getState();
    await service.dispose();

    expect(recoveredState).toMatchObject({
      gameActive: false,
      constructedScreenMode: "wild",
      deckName: "巨像",
      autoMatchedDeckId: "selected-wild",
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0, opponentPlayedCount: 0 }
    });
    expect(recoveredState.friendlyHand).toEqual([]);
    expect(recoveredState.friendlyOther).toEqual([]);
  });

  it("recognizes Standard on first launch even before collection decks are available", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const decksLog = join(sessionDir, "Decks.log");
    await writeFile(decksLog, "I 10:49:48.000 Deck Contents Received:\n", "utf8");
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({ status: "ok" as const, decks: [] }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [
          { text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 }
        ]
      }))
    };
    const service = new TrackerService(scanner, recognizer);

    const state = await service.start({ logPath: decksLog });
    await service.dispose();

    expect(recognizer.recognize).toHaveBeenCalledWith({
      requireHearthstoneFrontmost: false,
      profile: "constructed"
    });
    expect(state.constructedScreenMode).toBe("standard");
  });

  it("does not publish the same public state twice", async () => {
    const { TrackerService } = await import("../src/main/trackerService.js");
    const service = new TrackerService();
    const send = vi.fn();
    service.attachWindow({
      on: vi.fn(),
      isDestroyed: () => false,
      webContents: { send }
    } as unknown as Parameters<typeof service.attachWindow>[0]);

    service.setCollectionDecks([]);
    service.setCollectionDecks([]);
    await service.dispose();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("publishes a constructed mode when the already-previewed deck stays selected", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(arenaLog, "D 18:00:00.000 SetDraftMode - ACTIVE_DRAFT_DECK\n", "utf8");
    const selectedDeck = {
      id: "selected-standard",
      name: "已选标准牌组",
      format: "标准",
      cards: [{ name: "Standard Card", count: 30 }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({
        status: "ok" as const,
        decks: [selectedDeck],
        activeDeck: selectedDeck
      }))
    };
    let recognitionCount = 0;
    const recognizer = {
      recognize: vi.fn(async () => {
        recognitionCount += 1;
        return recognitionCount === 1
          ? { status: "ok" as const, texts: [] }
          : {
              status: "ok" as const,
              texts: [
                { text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 },
                { text: "已选标准牌组", confidence: 1, x: 0.72, y: 0.34, width: 0.06, height: 0.02 }
              ]
            };
      })
    };
    const service = new TrackerService(scanner, recognizer);
    const send = vi.fn();
    service.attachWindow({
      on: vi.fn(),
      isDestroyed: () => false,
      webContents: { send }
    } as unknown as Parameters<typeof service.attachWindow>[0]);

    await service.start({ logPath: arenaLog });
    await vi.waitFor(() => expect(recognizer.recognize).toHaveBeenCalledTimes(2), { timeout: 2_000, interval: 50 });
    const lastPublishedState = send.mock.calls.at(-1)?.[1];
    await service.dispose();

    expect(service.getState().constructedScreenMode).toBeUndefined();
    expect(lastPublishedState?.constructedScreenMode).toBe("standard");
  });

  it("tracks sibling Power.log when the selected path is Player.log", async () => {
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const playerLog = join(sessionDir, "Player.log");
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(playerLog, "PlayerID=1\n", "utf8");
    await writeFile(
      powerLog,
      "D 12:00:00.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND\n",
      "utf8"
    );

    const service = new TrackerService();
    const state = await service.start({ logPath: playerLog, deckText: "1x Fireball" });
    await service.dispose();

    expect(state.status).toBe("watching");
    expect(state.logPath).toBe(powerLog);
    expect(state.summary.drawnCards).toBe(1);
  });

  it("keeps all three opening cards when mulligan replacement logs split a line", async () => {
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(
      powerLog,
      [
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=本地玩家#1234",
        "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME"
      ].join("\n") + "\n",
      "utf8"
    );

    const service = new TrackerService();
    await service.start({
      logPath: powerLog,
      deckText: [
        "1x Opening A",
        "1x Opening B",
        "1x Opening C",
        "1x Replacement D",
        "1x Replacement E",
        "25x Filler"
      ].join("\n")
    });

    const mulligan =
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Opening A id=10 zone=DECK zonePos=0 cardId= player=1] tag=ZONE value=HAND\n" +
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Opening B id=11 zone=DECK zonePos=0 cardId= player=1] tag=ZONE value=HAND\n" +
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Opening C id=12 zone=DECK zonePos=0 cardId= player=1] tag=ZONE value=HAND\n" +
      "D 12:00:03.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Opening A id=10 zone=HAND zonePos=1 cardId= player=1] tag=ZONE value=DECK\n" +
      "D 12:00:03.000 PowerTaskList.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=Replacement D id=13 zone=DECK zonePos=0 cardId= player=1] CardID=TEST_D\n" +
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=1\n" +
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND\n" +
      "D 12:00:03.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Opening C id=12 zone=HAND zonePos=3 cardId= player=1] tag=ZONE value=DECK\n" +
      "D 12:00:03.000 PowerTaskList.DebugPrintPower() -     SHOW_ENTITY - Updating Entity=[entityName=Replacement E id=14 zone=DECK zonePos=0 cardId= player=1] CardID=TEST_E\n" +
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -         tag=CONTROLLER value=1\n" +
      "D 12:00:02.000 PowerTaskList.DebugPrintPower() -         tag=ZONE value=HAND\n";
    const splitAt = mulligan.indexOf("CardID=TEST_D") + 8;
    await appendFile(powerLog, mulligan.slice(0, splitAt), "utf8");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(service.getState().summary).toMatchObject({ remainingCards: 28, drawnCards: 2 });

    await appendFile(powerLog, mulligan.slice(splitAt), "utf8");
    await vi.waitFor(
      () => expect(service.getState().summary).toMatchObject({ totalCards: 30, remainingCards: 27, drawnCards: 3 }),
      { timeout: 2_000, interval: 25 }
    );
    await service.dispose();
  });

  it("reports that Power.log is required when only Player.log exists", async () => {
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const playerLog = join(sessionDir, "Player.log");
    await writeFile(playerLog, "PlayerID=1\n", "utf8");

    const service = new TrackerService();
    const state = await service.start({ logPath: playerLog });
    await service.dispose();

    expect(state.status).toBe("error");
    expect(state.logPath).toBe(playerLog);
    expect(state.error).toContain("Player.log");
    expect(state.error).toContain("Power.log");
    expect(state.error).toContain("需要修复日志并重启炉石");
  });

  it("auto matches the local deck from Power.log when Player.log is unavailable", async () => {
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(
      powerLog,
      [
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=UNKNOWN HUMAN PLAYER",
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=2, PlayerName=本地玩家#1234",
        "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME",
        "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=2] tag=ZONE value=HAND"
      ].join("\n") + "\n",
      "utf8"
    );

    const service = new TrackerService();
    service.setCollectionDecks([
      {
        id: "power-log-local-deck",
        name: "Power.log 本方套牌",
        cards: [{ name: "Fireball", count: 1, cardId: "CS2_029" }],
        rawText: "1x Fireball",
        sourcePath: "/tmp/Decks.log",
        updatedAt: "2026-07-11T00:00:00.000Z",
        warnings: []
      }
    ]);

    const state = await service.start({ logPath: powerLog });
    await service.dispose();

    expect(state.autoMatchedDeckId).toBe("power-log-local-deck");
    expect(state.deckName).toBe("Power.log 本方套牌");
    expect(state.summary).toMatchObject({ totalCards: 1, remainingCards: 0, drawnCards: 1 });
  });

  it("uses the current game's local player slot when it changes between games", async () => {
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(
      powerLog,
      [
        "D 11:59:00.000 GameState.DebugPrintPower() - CREATE_GAME",
        "D 11:59:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=本地玩家#1234",
        "D 11:59:00.000 GameState.DebugPrintGame() - PlayerID=2, PlayerName=UNKNOWN HUMAN PLAYER",
        "D 12:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=UNKNOWN HUMAN PLAYER",
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=2, PlayerName=本地玩家#1234",
        "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=2] tag=ZONE value=HAND"
      ].join("\n"),
      "utf8"
    );

    const service = new TrackerService();
    service.setCollectionDecks([
      {
        id: "current-game-player-two",
        name: "当前对局本方套牌",
        cards: [{ name: "Fireball", count: 1, cardId: "CS2_029" }],
        rawText: "1x Fireball",
        sourcePath: "/tmp/Decks.log",
        updatedAt: "2026-07-11T00:00:00.000Z",
        warnings: []
      }
    ]);

    const state = await service.start({ logPath: powerLog });
    await service.dispose();

    expect(state.autoMatchedDeckId).toBe("current-game-player-two");
    expect(state.deckName).toBe("当前对局本方套牌");
    expect(state.summary).toMatchObject({ totalCards: 1, remainingCards: 0, drawnCards: 1 });
  });

  it("loads Hearthstone's selected collection deck whenever a Power.log session starts", async () => {
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(
      powerLog,
      [
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=UNKNOWN HUMAN PLAYER",
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=2, PlayerName=本地玩家#1234",
        "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME",
        "D 12:00:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=2] tag=ZONE value=HAND"
      ].join("\n"),
      "utf8"
    );
    const selectedDeck = {
      id: "selected-deck",
      deckId: "9455681170",
      name: "偷取牌库",
      cards: [{ name: "Fireball", count: 2, cardId: "CS2_029" }],
      rawText: "2x Fireball",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanAndImportDecks = vi.fn(async () => ({
      status: "ok" as const,
      decks: [selectedDeck],
      activeDeck: selectedDeck
    }));

    const service = new TrackerService({ scanAndImportDecks });
    const state = await service.start({ logPath: powerLog });
    await service.dispose();

    expect(scanAndImportDecks).toHaveBeenCalledWith({ logPath: powerLog });
    expect(state).toMatchObject({
      autoMatchedDeckId: "selected-deck",
      deckName: "偷取牌库",
      summary: { totalCards: 2, remainingCards: 1, drawnCards: 1 }
    });
  });

  it("uses Hearthstone's selected deck even when Power.log does not expose the local player name", async () => {
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(
      powerLog,
      [
        "D 12:00:00.000 GameState.DebugPrintPower() - CREATE_GAME",
        "D 12:00:00.000 GameState.DebugPrintPower() -     Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=1]",
        "D 12:00:00.000 GameState.DebugPrintPower() -     Player EntityID=3 PlayerID=2 GameAccountId=[hi=1 lo=2]"
      ].join("\n"),
      "utf8"
    );
    const selectedDeck = {
      id: "explicit-selected-deck",
      deckId: "9302099347",
      name: "试验套牌",
      format: "标准",
      cards: [{ name: "Sample Singleton", count: 1, cardId: "TEST_001" }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanAndImportDecks = vi.fn(async () => ({
      status: "ok" as const,
      decks: [selectedDeck],
      activeDeck: selectedDeck
    }));

    const service = new TrackerService({ scanAndImportDecks });
    const state = await service.start({ logPath: powerLog });
    await service.dispose();

    expect(state).toMatchObject({
      autoMatchedDeckId: "explicit-selected-deck",
      deckName: "试验套牌",
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0 }
    });
    expect(state.deck.find((card) => card.name === "日志缺失的收藏牌")).toMatchObject({ count: 29 });
  });

  it("switches to a newer Power.log session and replays its current game", async () => {
    const root = await mkdtemp(join(os.tmpdir(), "hearthstone-tracker-service-sessions-"));
    tempDirs.push(root);
    const oldSessionDir = join(root, "old-session");
    const newSessionDir = join(root, "new-session");
    await Promise.all([mkdir(oldSessionDir), mkdir(newSessionDir)]);
    const oldPowerLog = join(oldSessionDir, "Power.log");
    const newPowerLog = join(newSessionDir, "Power.log");
    await writeFile(
      oldPowerLog,
      [
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=UNKNOWN HUMAN PLAYER",
        "D 12:00:00.000 GameState.DebugPrintGame() - PlayerID=2, PlayerName=本地玩家#1234",
        "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      newPowerLog,
      [
        "D 12:01:00.000 GameState.DebugPrintGame() - PlayerID=1, PlayerName=UNKNOWN HUMAN PLAYER",
        "D 12:01:00.000 GameState.DebugPrintGame() - PlayerID=2, PlayerName=本地玩家#1234",
        "D 12:01:01.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME",
        "D 12:01:02.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=2] tag=ZONE value=HAND"
      ].join("\n"),
      "utf8"
    );

    const oldSession = { root, sessionDir: oldSessionDir, powerLogPath: oldPowerLog, modifiedAtMs: 1 };
    const newSession = { root, sessionDir: newSessionDir, powerLogPath: newPowerLog, modifiedAtMs: 2 };
    vi.resetModules();
    vi.doMock("../src/main/logDiscovery.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/main/logDiscovery.js")>();
      return {
        ...actual,
        resolveBestLogTarget: vi.fn(async (providedPath?: string) => {
          if (providedPath === newPowerLog) {
            return newSession;
          }
          return providedPath ? oldSession : newSession;
        })
      };
    });

    const { TrackerService } = await import("../src/main/trackerService.js");
    const service = new TrackerService();
    await service.start({ logPath: oldPowerLog, deckText: "1x Fireball" });

    await vi.waitFor(
      () => {
        const state = service.getState();
        expect(state.logPath).toBe(newPowerLog);
        expect(state.summary.drawnCards).toBe(1);
      },
      { timeout: 4_000, interval: 50 }
    );
    await service.dispose();
  });

  it("clears stale card state when the newest Hearthstone session has no Power.log", async () => {
    const root = await mkdtemp(join(os.tmpdir(), "hearthstone-tracker-service-current-missing-power-"));
    tempDirs.push(root);
    const staleSessionDir = join(root, "Hearthstone_2026_07_11_12_18_34");
    const currentSessionDir = join(root, "Hearthstone_2026_07_11_15_56_57");
    await Promise.all([mkdir(staleSessionDir), mkdir(currentSessionDir)]);
    const stalePowerLog = join(staleSessionDir, "Power.log");
    const currentDecksLog = join(currentSessionDir, "Decks.log");
    await writeFile(
      stalePowerLog,
      [
        "D 12:00:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME",
        "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=[entityName=Fireball id=64 zone=DECK zonePos=1 cardId=CS2_029 player=1] tag=ZONE value=HAND"
      ].join("\n"),
      "utf8"
    );
    await writeFile(currentDecksLog, "I 17:29:00.000 Deck Contents Received:\n", "utf8");

    const staleTime = new Date("2026-07-11T12:18:34.000Z");
    const currentTime = new Date("2026-07-11T17:29:00.000Z");
    await Promise.all([
      utimes(stalePowerLog, staleTime, staleTime),
      utimes(staleSessionDir, staleTime, staleTime),
      utimes(currentDecksLog, currentTime, currentTime),
      utimes(currentSessionDir, currentTime, currentTime)
    ]);

    const { TrackerService } = await import("../src/main/trackerService.js");
    const service = new TrackerService();
    await service.start({ logPath: stalePowerLog, deckText: "1x Fireball" });
    const state = await service.start({ logPath: root });
    await service.dispose();

    expect(state.status).toBe("missing-log");
    expect(state.logPath).toBe(currentDecksLog);
    expect(state.error).toContain("Power.log");
    expect(state.deck).toEqual([]);
    expect(state.summary).toMatchObject({ totalCards: 0, remainingCards: 0, drawnCards: 0 });
  });

  it("automatically resumes when Power.log appears in the current session", async () => {
    const root = await mkdtemp(join(os.tmpdir(), "hearthstone-tracker-service-power-appears-"));
    tempDirs.push(root);
    const sessionDir = join(root, "Hearthstone_2026_07_12_10_49_37");
    await mkdir(sessionDir);
    const decksLog = join(sessionDir, "Decks.log");
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(decksLog, "I 10:49:48.000 Deck Contents Received:\n", "utf8");

    let powerAvailable = false;
    const missingSession = { root, sessionDir, decksLogPath: decksLog, modifiedAtMs: 1 };
    const readySession = { root, sessionDir, decksLogPath: decksLog, powerLogPath: powerLog, modifiedAtMs: 2 };
    vi.resetModules();
    vi.doMock("../src/main/logDiscovery.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/main/logDiscovery.js")>();
      return {
        ...actual,
        resolveBestLogTarget: vi.fn(async (providedPath?: string) => {
          if (providedPath === powerLog) {
            return readySession;
          }
          return powerAvailable ? readySession : missingSession;
        })
      };
    });

    const { TrackerService } = await import("../src/main/trackerService.js");
    const service = new TrackerService();
    const initial = await service.start({ logPath: decksLog });
    expect(initial.status).toBe("missing-log");

    await writeFile(powerLog, "D 10:55:22.000 GameState.DebugPrintPower() - CREATE_GAME\nD 10:55:22.000 GameState.DebugPrintGame() - GameType=GT_RANKED\n", "utf8");
    powerAvailable = true;

    await vi.waitFor(() => expect(service.getState().status).toBe("watching"), {
      timeout: 3_000,
      interval: 50
    });
    expect(service.getState().logPath).toBe(powerLog);
    expect(service.getState().gameActive).toBe(true);
    await service.dispose();
  });

  it("does not switch after pause when a session refresh resolves late", async () => {
    const root = await mkdtemp(join(os.tmpdir(), "hearthstone-tracker-service-pause-"));
    tempDirs.push(root);
    const oldSessionDir = join(root, "old-session");
    const newSessionDir = join(root, "new-session");
    await Promise.all([mkdir(oldSessionDir), mkdir(newSessionDir)]);
    const oldPowerLog = join(oldSessionDir, "Power.log");
    const newPowerLog = join(newSessionDir, "Power.log");
    await writeFile(oldPowerLog, "D 12:00:01.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME\n", "utf8");
    await writeFile(newPowerLog, "D 12:01:01.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME\n", "utf8");

    const oldSession = { root, sessionDir: oldSessionDir, powerLogPath: oldPowerLog, modifiedAtMs: 1 };
    const newSession = { root, sessionDir: newSessionDir, powerLogPath: newPowerLog, modifiedAtMs: 2 };
    let resolveNewSession: (value: typeof newSession) => void = () => undefined;
    const pendingNewSession = new Promise<typeof newSession>((resolve) => {
      resolveNewSession = resolve;
    });
    let periodicChecks = 0;
    vi.resetModules();
    vi.doMock("../src/main/logDiscovery.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/main/logDiscovery.js")>();
      return {
        ...actual,
        resolveBestLogTarget: vi.fn(async (providedPath?: string) => {
          if (providedPath) {
            return oldSession;
          }
          periodicChecks += 1;
          return pendingNewSession;
        })
      };
    });

    const { TrackerService } = await import("../src/main/trackerService.js");
    const service = new TrackerService();
    await service.start({ logPath: oldPowerLog, deckText: "1x Fireball" });
    await vi.waitFor(() => expect(periodicChecks).toBe(1), { timeout: 2_000, interval: 25 });

    const pause = service.pause();
    resolveNewSession(newSession);
    await pause;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const state = service.getState();
    expect(state.status).toBe("paused");
    expect(state.logPath).toBe(oldPowerLog);
    await service.dispose();
  });

  it("starts screen recognition for a current Arena draft session without Power.log", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return {
            database: {
              "1001": { dbfId: 1001, name: "Sample Singleton", cardId: "TEST_001" },
              "1002": { dbfId: 1002, name: "Sample Pair", cardId: "TEST_002" },
              "1003": { dbfId: 1003, name: "Sample Multi", cardId: "TEST_003" }
            },
            warnings: []
          };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return {
            table: {
              source: "test ratings",
              version: 1,
              fetchedAt: "2026-07-11T00:00:00.000Z",
              ratings: {
                Neutral: { TEST_001: 88, TEST_002: 61, TEST_003: 72 }
              }
            },
            warnings: []
          };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(
      arenaLog,
      [
        "D 15:58:16.7116490 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06",
        "D 15:58:16.7116490 SetDraftMode - DRAFTING"
      ].join("\n"),
      "utf8"
    );
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [
          { text: "Sample Multi", confidence: 1, x: 0.2, y: 0.6, width: 0.05, height: 0.02 },
          { text: "Sample Singleton", confidence: 1, x: 0.39, y: 0.6, width: 0.05, height: 0.02 },
          { text: "Sample Pair", confidence: 1, x: 0.58, y: 0.6, width: 0.05, height: 0.02 }
        ]
      }))
    };

    const staleConstructedDeck = {
      id: "stale-constructed",
      name: "旧托奇法",
      cards: [{ name: "Sample Singleton", count: 30, cardId: "TEST_001" }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-12T00:00:00.000Z",
      warnings: []
    };
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({
        status: "ok" as const,
        decks: [staleConstructedDeck],
        activeDeck: staleConstructedDeck
      }))
    };
    const service = new TrackerService(scanner, recognizer);
    const state = await service.start({ logPath: arenaLog });
    await service.dispose();

    expect(state.status).toBe("watching");
    expect(state.logPath).toBe(arenaLog);
    expect(recognizer.recognize).toHaveBeenCalledTimes(1);
    expect(state.arena?.status).toBe("drafting");
    expect(state.deckName).toBeUndefined();
    expect(state.autoMatchedDeckId).toBeUndefined();
    expect(state.arena?.currentChoices.map((choice) => choice.name)).toEqual([
      "Sample Multi",
      "Sample Singleton",
      "Sample Pair"
    ]);
  });

  it("keeps a completed Arena deck when Power.log declares the Arena game type after CREATE_GAME", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return {
            database: {
              "1001": { dbfId: 1001, name: "Sample Singleton", cardId: "TEST_001" },
              "1002": { dbfId: 1002, name: "Sample Pair", cardId: "TEST_002" },
              "1003": { dbfId: 1003, name: "Sample Multi", cardId: "TEST_003" }
            },
            warnings: []
          };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return {
            table: { source: "test ratings", version: 1, fetchedAt: "2026-07-11T00:00:00.000Z", ratings: {} },
            warnings: []
          };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    const powerLog = join(sessionDir, "Power.log");
    await writeFile(
      arenaLog,
      [
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06",
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_001",
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_002",
        "D 17:40:02.0000000 SetDraftMode - ACTIVE_DRAFT_DECK"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      powerLog,
      [
        "D 17:41:00.000 GameState.DebugPrintPower() - CREATE_GAME",
        "D 17:41:00.001 GameState.DebugPrintPower() -     GameEntity EntityID=1",
        "D 17:41:00.500 GameState.DebugPrintGame() - GameType=GT_UNDERGROUND_ARENA",
        "D 17:41:00.600 PowerTaskList.DebugPrintPower() -     CREATE_GAME"
      ].join("\n"),
      "utf8"
    );

    const service = new TrackerService();
    const state = await service.start({ logPath: powerLog });
    await service.dispose();

    expect(state.status).toBe("watching");
    expect(state.logPath).toBe(powerLog);
    expect(state.arena?.status).toBe("playing");
    expect(state.arena?.draftCount).toBe(30);
    expect(state.deckName).toBe("竞技场牌库");
    expect(state.summary).toMatchObject({ totalCards: 30, remainingCards: 30, drawnCards: 0 });
    expect(state.deck.map((card) => card.cardId ?? card.name).sort()).toEqual(["TEST_001", "TEST_002", "日志缺失的竞技场牌"]);
  });

  it("keeps the constructed deck preview when Arena.log updates after returning to Standard deck select", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return {
            database: {
              "1001": { dbfId: 1001, name: "Sample Arena", cardId: "TEST_ARENA" },
              "1002": { dbfId: 1002, name: "Standard Card", cardId: "TEST_STANDARD" },
              "1003": { dbfId: 1003, name: "Wild Card", cardId: "TEST_WILD" }
            },
            warnings: []
          };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return {
            table: { source: "test ratings", version: 1, fetchedAt: "2026-07-11T00:00:00.000Z", ratings: {} },
            warnings: []
          };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(
      arenaLog,
      [
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06",
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_ARENA",
        "D 17:40:02.0000000 SetDraftMode - ACTIVE_DRAFT_DECK"
      ].join("\n"),
      "utf8"
    );
    const standardDeck = {
      id: "standard-deck",
      deckId: "9455681170",
      name: "偷取牌库",
      format: "标准",
      cards: [{ name: "Standard Card", count: 30, cardId: "TEST_STANDARD" }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({
        status: "ok" as const,
        decks: [
          {
            id: "wild-deck",
            deckId: "9455227336",
            name: "偷取牌库",
            format: "狂野",
            cards: [{ name: "Wild Card", count: 30, cardId: "TEST_WILD" }],
            rawText: "",
            sourcePath: join(sessionDir, "Decks.log"),
            updatedAt: "2026-07-11T00:00:00.000Z",
            warnings: []
          },
          standardDeck
        ]
      }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [
          { text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 },
          { text: "偷取牌库", confidence: 1, x: 0.72, y: 0.34, width: 0.06, height: 0.02 }
        ]
      }))
    };

    const service = new TrackerService(scanner, recognizer);
    const state = await service.start({ logPath: arenaLog });
    expect(state.deckName).toBe("偷取牌库");
    expect(state.autoMatchedDeckId).toBe("standard-deck");
    expect(recognizer.recognize).toHaveBeenCalledWith({
      requireHearthstoneFrontmost: false,
      profile: "constructed"
    });

    await appendFile(
      arenaLog,
      [
        "",
        "D 17:56:15.0000000 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06",
        "D 17:56:15.0000000 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_ARENA",
        "D 17:56:15.0000000 SetDraftMode - ACTIVE_DRAFT_DECK"
      ].join("\n"),
      "utf8"
    );

    await vi.waitFor(
      () => {
        expect(recognizer.recognize).toHaveBeenCalledTimes(2);
        expect(service.getState().deckName).toBe("偷取牌库");
        expect(service.getState().autoMatchedDeckId).toBe("standard-deck");
      },
      { timeout: 2_000, interval: 50 }
    );

    recognizer.recognize.mockResolvedValue({ status: "ok" as const, texts: [] });
    await appendFile(
      arenaLog,
      [
        "",
        "D 17:57:15.0000000 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06",
        "D 17:57:15.0000000 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_ARENA",
        "D 17:57:15.0000000 SetDraftMode - ACTIVE_DRAFT_DECK"
      ].join("\n") + "\n",
      "utf8"
    );

    await vi.waitFor(
      () => {
        expect(service.getState().constructedScreenMode).toBeUndefined();
        expect(service.getState().deckName).toBe("竞技场牌库");
        expect(service.getState().autoMatchedDeckId).toBeUndefined();
      },
      { timeout: 2_000, interval: 50 }
    );
    await service.dispose();
  });

  it("switches from a stale Arena Power.log when the Standard deck select screen is visible", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return {
            database: {
              "1001": { dbfId: 1001, name: "Sample Arena", cardId: "TEST_ARENA" },
              "1002": { dbfId: 1002, name: "Standard Card", cardId: "TEST_STANDARD" },
              "1003": { dbfId: 1003, name: "Wild Card", cardId: "TEST_WILD" }
            },
            warnings: []
          };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return {
            table: { source: "test ratings", version: 1, fetchedAt: "2026-07-11T00:00:00.000Z", ratings: {} },
            warnings: []
          };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(
      arenaLog,
      [
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06",
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_ARENA",
        "D 17:40:02.0000000 SetDraftMode - ACTIVE_DRAFT_DECK"
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      powerLog,
      [
        "D 17:41:00.000 PowerTaskList.DebugPrintPower() -     CREATE_GAME GameType=GT_ARENA",
        "D 17:41:01.000 GameState.DebugPrintPower() - TAG_CHANGE Entity=本地玩家 tag=PLAYSTATE value=WON"
      ].join("\n"),
      "utf8"
    );
    const standardDeck = {
      id: "standard-deck-from-stale-power",
      deckId: "9455681170",
      name: "偷取牌库",
      format: "标准",
      cards: [{ name: "Standard Card", count: 30, cardId: "TEST_STANDARD" }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({
        status: "ok" as const,
        decks: [
          {
            id: "wild-deck-from-stale-power",
            deckId: "9455227336",
            name: "偷取牌库",
            format: "狂野",
            cards: [{ name: "Wild Card", count: 30, cardId: "TEST_WILD" }],
            rawText: "",
            sourcePath: join(sessionDir, "Decks.log"),
            updatedAt: "2026-07-11T00:00:00.000Z",
            warnings: []
          },
          standardDeck
        ]
      }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [
          { text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 },
          { text: "偷取牌库", confidence: 1, x: 0.72, y: 0.34, width: 0.06, height: 0.02 }
        ]
      }))
    };

    const service = new TrackerService(scanner, recognizer);
    const state = await service.start({ logPath: powerLog });
    await service.dispose();

    expect(recognizer.recognize).toHaveBeenCalledWith({
      requireHearthstoneFrontmost: false,
      profile: "constructed"
    });
    expect(state.constructedScreenMode).toBe("standard");
    expect(state.deckName).toBe("偷取牌库");
    expect(state.autoMatchedDeckId).toBe("standard-deck-from-stale-power");
    expect(state.summary.totalCards).toBe(30);
  });

  it("clears an old constructed preview while a Standard deck name is ambiguous", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(arenaLog, "D 18:00:00.000 SetDraftMode - ACTIVE_DRAFT_DECK\n", "utf8");
    const oldDeck = {
      id: "old-preview",
      name: "重复牌组",
      format: "标准",
      cards: [{ name: "Old Card", count: 30 }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({
        status: "ok" as const,
        decks: [oldDeck, { ...oldDeck, id: "duplicate-preview" }],
        activeDeck: oldDeck
      }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [
          { text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 },
          { text: "重复牌组", confidence: 1, x: 0.72, y: 0.34, width: 0.06, height: 0.02 }
        ]
      }))
    };

    const service = new TrackerService(scanner, recognizer);
    const state = await service.start({ logPath: arenaLog });
    await service.dispose();

    expect(state.constructedScreenMode).toBe("standard");
    expect(state.deckName).toBeUndefined();
    expect(state.autoMatchedDeckId).toBeUndefined();
    expect(state.deck).toEqual([]);
    expect(state.summary.totalCards).toBe(0);
  });

  it.each(["permission-denied", "capture-failed", "window-not-found", "failed"] as const)(
    "clears a stale constructed preview when screen recognition returns %s",
    async (failureStatus) => {
      vi.resetModules();
      vi.doMock("../src/main/cardDataService.js", () => ({
        CardDataService: class CardDataService {
          async loadCardDatabase() {
            return { warnings: [] };
          }
        }
      }));
      const { TrackerService } = await import("../src/main/trackerService.js");
      const sessionDir = await createSessionDir();
      const powerLog = join(sessionDir, "Power.log");
      await writeFile(powerLog, "D 18:05:00.000 GameState.DebugPrintPower() - Waiting for deck selection\n", "utf8");
      const selectedDeck = {
        id: "screen-selected-standard",
        name: "测试标准牌组",
        format: "标准",
        cards: [{ name: "Standard Card", count: 30 }],
        rawText: "",
        sourcePath: join(sessionDir, "Decks.log"),
        updatedAt: "2026-07-11T00:00:00.000Z",
        warnings: []
      };
      const scanner = {
        scanAndImportDecks: vi.fn(async () => ({ status: "ok" as const, decks: [selectedDeck] }))
      };
      let recognitionCount = 0;
      const recognizer = {
        recognize: vi.fn(async () => {
          recognitionCount += 1;
          if (recognitionCount === 1) {
            return {
              status: "ok" as const,
              texts: [
                { text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 },
                { text: "测试标准牌组", confidence: 1, x: 0.72, y: 0.34, width: 0.06, height: 0.02 }
              ]
            };
          }
          return { status: failureStatus, message: `识别失败：${failureStatus}`, texts: [] };
        })
      };

      const service = new TrackerService(scanner, recognizer);
      const initialState = await service.start({ logPath: powerLog });
      expect(initialState.autoMatchedDeckId).toBe("screen-selected-standard");

      await vi.waitFor(
        () => {
          const state = service.getState();
          expect(recognizer.recognize.mock.calls.length).toBeGreaterThanOrEqual(2);
          expect(state.constructedScreenMode).toBe("standard");
          expect(state.autoMatchedDeckId).toBeUndefined();
          expect(state.deck).toEqual([]);
          expect(state.error).toContain(failureStatus);
        },
        { timeout: 2_000, interval: 50 }
      );
      await service.dispose();
    }
  );

  it("clears a completed Arena deck when screen permission cannot verify the current mode", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { table: undefined, warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(
      arenaLog,
      [
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft Deck ID: 1, Hero Card = HERO_06",
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_ARENA",
        "D 17:40:02.0000000 SetDraftMode - ACTIVE_DRAFT_DECK"
      ].join("\n"),
      "utf8"
    );
    const constructedDeck = {
      id: "constructed-deck",
      name: "测试套牌",
      format: "标准",
      cards: [{ name: "Standard Card", count: 30 }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({ status: "ok" as const, decks: [constructedDeck] }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "permission-denied" as const,
        message: "请允许录制屏幕。",
        texts: []
      }))
    };

    const service = new TrackerService(scanner, recognizer);
    const state = await service.start({ logPath: arenaLog });
    await service.dispose();

    expect(state.arena?.status).toBe("inactive");
    expect(state.arena?.deck).toEqual([]);
    expect(state.deck).toEqual([]);
    expect(state.error).toContain("请允许录制屏幕");
  });

  it("does not let stale constructed screen text clear an active Arena draft", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(arenaLog, "D 18:08:00.000 SetDraftMode - DRAFTING\n", "utf8");
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({
        status: "ok" as const,
        decks: [{
          id: "standard-deck",
          name: "标准套牌",
          format: "标准",
          cards: [{ name: "Standard Card", count: 30 }],
          rawText: "",
          sourcePath: join(sessionDir, "Decks.log"),
          updatedAt: "2026-07-11T00:00:00.000Z",
          warnings: []
        }]
      }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [{ text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 }]
      }))
    };

    const service = new TrackerService(scanner, recognizer);
    const state = await service.start({ logPath: arenaLog });
    await service.dispose();

    expect(state.arena?.status).toBe("drafting");
    expect(state.constructedScreenMode).toBeUndefined();
  });

  it("leaves Arena redrafting after the constructed deck screen is confirmed twice", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return { warnings: [] };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(
      arenaLog,
      [
        "D 18:08:00.000 DraftManager.OnChoicesAndContents - Draft Deck ID: arena, Hero Card = HERO_06",
        "D 18:08:00.000 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_ARENA",
        "D 18:08:01.000 SetDraftMode - REDRAFTING"
      ].join("\n"),
      "utf8"
    );
    const constructedDeck = {
      id: "standard-deck",
      name: "标准套牌",
      format: "标准",
      cards: [{ name: "Standard Card", count: 30 }],
      rawText: "",
      sourcePath: join(sessionDir, "Decks.log"),
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({ status: "ok" as const, decks: [constructedDeck] }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [
          { text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 },
          { text: "标准套牌", confidence: 0.9, x: 0.72, y: 0.34, width: 0.08, height: 0.02 }
        ]
      }))
    };

    const service = new TrackerService(scanner, recognizer);
    const initial = await service.start({ logPath: arenaLog });
    expect(initial.arena?.status).toBe("redrafting");

    await vi.waitFor(() => expect(service.getState().autoMatchedDeckId).toBe("standard-deck"), {
      timeout: 2_000,
      interval: 50
    });
    expect(service.getState().arena?.status).toBe("inactive");
    expect(service.getState().constructedScreenMode).toBe("standard");
    await service.dispose();
  });

  it("clears an old Arena deck as soon as a constructed mode is confirmed", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return {
            database: {
              "1001": { dbfId: 1001, name: "Sample Arena", cardId: "TEST_ARENA" }
            },
            warnings: []
          };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return { warnings: [] };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    await writeFile(
      arenaLog,
      [
        "D 18:10:00.000 DraftManager.OnChoicesAndContents - Draft Deck ID: arena, Hero Card = HERO_06",
        "D 18:10:00.000 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_ARENA",
        "D 18:10:01.000 SetDraftMode - ACTIVE_DRAFT_DECK"
      ].join("\n"),
      "utf8"
    );
    const scanner = {
      scanAndImportDecks: vi.fn(async () => ({
        status: "ok" as const,
        decks: [
          {
            id: "standard-deck",
            name: "标准套牌",
            format: "标准",
            cards: [{ name: "Standard Card", count: 30 }],
            rawText: "",
            sourcePath: join(sessionDir, "Decks.log"),
            updatedAt: "2026-07-11T00:00:00.000Z",
            warnings: []
          }
        ]
      }))
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: [{ text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 }]
      }))
    };

    const service = new TrackerService(scanner, recognizer);
    const state = await service.start({ logPath: arenaLog });
    await service.dispose();

    expect(state.constructedScreenMode).toBe("standard");
    expect(state.arena?.status).toBe("inactive");
    expect(state.deckName).toBeUndefined();
    expect(state.deck).toEqual([]);
    expect(state.summary.totalCards).toBe(0);
  });

  it("switches between constructed decks on the Standard deck select screen", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return {
            database: {
              "1002": { dbfId: 1002, name: "Old Standard Card", cardId: "TEST_OLD_STANDARD" },
              "1003": { dbfId: 1003, name: "New Standard Card", cardId: "TEST_NEW_STANDARD" }
            },
            warnings: []
          };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const powerLog = join(sessionDir, "Power.log");
    const decksLog = join(sessionDir, "Decks.log");
    await writeFile(powerLog, "D 18:20:00.000 GameState.DebugPrintPower() - Waiting for deck selection\n", "utf8");
    await writeFile(decksLog, "I 18:20:00.000 Deck Contents Received:\n", "utf8");
    const oldDeck = {
      id: "old-standard-deck",
      deckId: "old-deck-id",
      name: "旧标准牌库",
      format: "标准",
      cards: [{ name: "Old Standard Card", count: 30, cardId: "TEST_OLD_STANDARD" }],
      rawText: "",
      sourcePath: decksLog,
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const newDeck = {
      id: "new-standard-deck",
      deckId: "new-deck-id",
      name: "偷取牌库",
      format: "标准",
      cards: [{ name: "New Standard Card", count: 30, cardId: "TEST_NEW_STANDARD" }],
      rawText: "",
      sourcePath: decksLog,
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    const scanner = {
      scanAndImportDecks: vi.fn(async (options?: { logPath?: string }) => ({
        status: "ok" as const,
        decks: [oldDeck, newDeck],
        activeDeck: options?.logPath === decksLog ? oldDeck : undefined
      }))
    };
    let recognizeCount = 0;
    const recognizer = {
      recognize: vi.fn(async () => {
        recognizeCount += 1;
        return recognizeCount === 1
          ? { status: "ok" as const, texts: [] }
          : {
              status: "ok" as const,
              texts: [
                { text: "标准对战", confidence: 0.9, x: 0.32, y: 0.91, width: 0.06, height: 0.02 },
                { text: "偷取牌库", confidence: 1, x: 0.72, y: 0.34, width: 0.06, height: 0.02 }
              ]
            };
      })
    };

    const service = new TrackerService(scanner, recognizer);
    await service.start({ logPath: powerLog });

    await appendFile(
      decksLog,
      [
        "I 18:21:00.000 Finding Game With Deck:",
        "I 18:21:00.000 ### 旧标准牌库",
        "I 18:21:00.000 # Deck ID: old-deck-id",
        "I 18:21:00.000 AAEBAfTVBwHzsgYAAAA="
      ].join("\n"),
      "utf8"
    );

    await vi.waitFor(
      () => {
        expect(recognizer.recognize).toHaveBeenCalledTimes(2);
        expect(service.getState().deckName).toBe("偷取牌库");
        expect(service.getState().autoMatchedDeckId).toBe("new-standard-deck");
        expect(service.getState().summary.totalCards).toBe(30);
      },
      { timeout: 2_000, interval: 50 }
    );
    await service.dispose();
  });

  it("does not leave a completed Arena deck from Decks.log without constructed-screen confirmation", async () => {
    vi.resetModules();
    vi.doMock("../src/main/cardDataService.js", () => ({
      CardDataService: class CardDataService {
        async loadCardDatabase() {
          return {
            database: {
              "1001": { dbfId: 1001, name: "Sample Arena", cardId: "TEST_ARENA" },
              "1002": { dbfId: 1002, name: "Constructed Card", cardId: "TEST_CONSTRUCTED" }
            },
            warnings: []
          };
        }
      }
    }));
    vi.doMock("../src/main/arenaRatingService.js", () => ({
      ArenaRatingService: class ArenaRatingService {
        async loadRatings() {
          return {
            table: { source: "test ratings", version: 1, fetchedAt: "2026-07-11T00:00:00.000Z", ratings: {} },
            warnings: []
          };
        }
      }
    }));
    const { TrackerService } = await import("../src/main/trackerService.js");
    const sessionDir = await createSessionDir();
    const arenaLog = join(sessionDir, "Arena.log");
    const decksLog = join(sessionDir, "Decks.log");
    await writeFile(
      arenaLog,
      [
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft Deck ID: 9455810772, Hero Card = HERO_06",
        "D 17:39:59.6202750 DraftManager.OnChoicesAndContents - Draft deck contains card TEST_ARENA",
        "D 17:40:02.0000000 SetDraftMode - ACTIVE_DRAFT_DECK"
      ].join("\n"),
      "utf8"
    );
    await writeFile(decksLog, "I 17:43:00.2066660 Deck Contents Received:\n", "utf8");
    const constructedDeck = {
      id: "constructed-deck",
      deckId: "9302099347",
      name: "试验套牌",
      format: "标准",
      cards: [{ name: "Constructed Card", count: 30, cardId: "TEST_CONSTRUCTED" }],
      rawText: "",
      sourcePath: decksLog,
      updatedAt: "2026-07-11T00:00:00.000Z",
      warnings: []
    };
    let scanCount = 0;
    const scanner = {
      scanAndImportDecks: vi.fn(async () => {
        scanCount += 1;
        return {
          status: "ok" as const,
          decks: [constructedDeck],
          activeDeck: scanCount >= 2 ? constructedDeck : undefined
        };
      })
    };
    const recognizer = {
      recognize: vi.fn(async () => ({
        status: "ok" as const,
        texts: []
      }))
    };

    const service = new TrackerService(scanner, recognizer);
    const initialState = await service.start({ logPath: arenaLog });
    expect(initialState.deckName).toBe("竞技场牌库");

    await appendFile(
      decksLog,
      [
        "I 18:23:24.9696500 Finding Game With Deck:",
        "I 18:23:24.9696500 ### 试验套牌",
        "I 18:23:24.9696500 # Deck ID: 9302099347",
        "I 18:23:24.9696500 AAEBAfTVBwHzsgYAAAA="
      ].join("\n"),
      "utf8"
    );

    await vi.waitFor(
      () => {
        expect(scanner.scanAndImportDecks).toHaveBeenCalledTimes(2);
      },
      { timeout: 2_000, interval: 50 }
    );
    expect(service.getState().deckName).toBe("竞技场牌库");
    expect(service.getState().autoMatchedDeckId).toBeUndefined();
    expect(service.getState().arena?.status).toBe("complete");
    await service.dispose();
  });
});

async function createSessionDir() {
  const root = await mkdtemp(join(os.tmpdir(), "hearthstone-tracker-service-"));
  tempDirs.push(root);
  const sessionDir = join(root, "session");
  await mkdir(sessionDir);
  return sessionDir;
}
