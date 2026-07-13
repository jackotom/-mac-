import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import sampleCardDb from "../fixtures/cards.sample.json";
import type { CardDatabase } from "../src/shared/cardDatabase.js";

vi.mock("electron", () => ({
  app: {
    getPath: () => os.tmpdir()
  }
}));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CollectionDeckService", () => {
  it("prevents an older concurrent scan from overwriting the newest cache", async () => {
    const { CollectionDeckService } = await import("../src/main/collectionDeckService.js");
    const { CollectionDeckStore } = await import("../src/main/collectionDeckStore.js");
    const root = await mkdtemp(path.join(os.tmpdir(), "collection-decks-generation-"));
    tempDirs.push(root);
    const logPath = path.join(root, "Decks.log");
    const deckText = (name: string, id: string) =>
      `I 20:56:52.9687400 Deck Contents Received:\nI 20:56:52.9687400 ### ${name}\nI 20:56:52.9687400 # Deck ID: ${id}\nI 20:56:52.9687400 ${encodeDeckString([0, 1, 2, 1, 7, 1, 1001, 0])}\n`;
    await writeFile(logPath, deckText("Older", "1"), "utf8");
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let loads = 0;
    const store = new CollectionDeckStore(path.join(root, "db.json"));
    const service = new CollectionDeckService(store, {
      loadCardDatabase: async () => {
        loads += 1;
        if (loads === 1) await firstGate;
        return { database: sampleCardDb as CardDatabase, warnings: [] };
      }
    });
    const olderScan = service.scanAndImportDecks({ logPath });
    await vi.waitFor(() => expect(loads).toBe(1));
    await writeFile(logPath, deckText("Newest", "2"), "utf8");
    const newestScan = await service.scanAndImportDecks({ logPath });
    releaseFirst?.();
    await expect(olderScan).resolves.toMatchObject({ status: "stale", decks: [] });

    expect(newestScan.status).toBe("ok");
    await expect(store.read()).resolves.toMatchObject({ decks: [expect.objectContaining({ name: "Newest" })] });
  });

  it("returns a clear action message when Decks.log is missing", async () => {
    const { CollectionDeckService, getMissingDecksLogMessage } = await import("../src/main/collectionDeckService.js");
    const { CollectionDeckStore } = await import("../src/main/collectionDeckStore.js");
    const root = await mkdtemp(path.join(os.tmpdir(), "collection-decks-service-"));
    tempDirs.push(root);
    const sessionDir = path.join(root, "session");
    await mkdir(sessionDir);
    await writeFile(path.join(sessionDir, "Power.log"), "D 12:00:00.000 Power - CREATE_GAME\n", "utf8");

    const service = new CollectionDeckService(new CollectionDeckStore(path.join(root, "db.json")));
    const result = await service.scanAndImportDecks({ logPath: root });

    expect(result).toEqual(
      expect.objectContaining({
        status: "missing-log",
        decks: [],
        message: getMissingDecksLogMessage()
      })
    );
    expect(result.message).toContain("修复日志");
    expect(result.message).toContain("重启炉石");
    expect(result.message).toContain("我的收藏/套牌");
  });

  it("stores decks parsed from a discovered Decks.log", async () => {
    const { CollectionDeckService } = await import("../src/main/collectionDeckService.js");
    const { CollectionDeckStore } = await import("../src/main/collectionDeckStore.js");
    const root = await mkdtemp(path.join(os.tmpdir(), "collection-decks-service-"));
    tempDirs.push(root);
    const sessionDir = path.join(root, "Hearthstone_2026_07_10_20_56_41");
    await mkdir(sessionDir);
    await writeFile(
      path.join(sessionDir, "Decks.log"),
      `
I 20:56:52.9687400 Deck Contents Received:
I 20:56:52.9687400 ### 任务无限龙
I 20:56:52.9687400 # Deck ID: 9222863564
I 20:56:52.9687400 ${encodeDeckString([0, 1, 2, 1, 7, 1, 1001, 1, 1002, 0])}
I 20:57:48.8376790 Finding Game With Deck:
I 20:57:48.8376790 ### 任务无限龙
I 20:57:48.8376790 # Deck ID: 9222863564
I 20:57:48.8376790 ${encodeDeckString([0, 1, 2, 1, 7, 1, 1001, 1, 1002, 0])}
`,
      "utf8"
    );

    const store = new CollectionDeckStore(path.join(root, "db.json"));
    const service = new CollectionDeckService(store, {
      loadCardDatabase: async () => ({ database: sampleCardDb as CardDatabase, warnings: [] })
    });
    const result = await service.scanAndImportDecks({ logPath: root });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ok",
        sourcePath: path.join(sessionDir, "Decks.log")
      })
    );
    expect(result.decks).toEqual([
      expect.objectContaining({
        deckId: "9222863564",
        name: "任务无限龙",
        cards: expect.arrayContaining([
          expect.objectContaining({ name: "Sample Singleton", count: 1, cardId: "TEST_001" }),
          expect.objectContaining({ name: "Sample Pair", count: 2, cardId: "TEST_002" })
        ])
      })
    ]);
    expect(result.activeDeck).toEqual(
      expect.objectContaining({
        deckId: "9222863564",
        name: "任务无限龙",
        cards: expect.arrayContaining([expect.objectContaining({ name: "Sample Singleton", cardId: "TEST_001" })])
      })
    );
    await expect(store.read()).resolves.toEqual(
      expect.objectContaining({
        decks: [
          expect.objectContaining({
            deckId: "9222863564",
            name: "任务无限龙",
            cards: expect.arrayContaining([
              expect.objectContaining({ name: "Sample Singleton" }),
              expect.objectContaining({ name: "Sample Pair" })
            ])
          })
        ]
      })
    );
  });
});

function encodeDeckString(values: readonly number[]): string {
  return Buffer.from(values.flatMap(encodeUnsignedVarint)).toString("base64");
}

function encodeUnsignedVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;

  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);

    if (remaining > 0) {
      byte += 128;
    }

    bytes.push(byte);
  } while (remaining > 0);

  return bytes;
}
