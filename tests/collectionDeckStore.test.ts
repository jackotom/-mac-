import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => os.tmpdir()
  }
}));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CollectionDeckStore", () => {
  it("serializes concurrent writes so the latest request wins", async () => {
    const { CollectionDeckStore } = await import("../src/main/collectionDeckStore.js");
    const root = await mkdtemp(path.join(os.tmpdir(), "collection-decks-store-"));
    tempDirs.push(root);
    const store = new CollectionDeckStore(path.join(root, "collection-decks.json"));
    const older = { updatedAt: "2026-07-10T00:00:00.000Z", sourcePath: "x".repeat(8_000_000), decks: [] };
    const latest = { updatedAt: "2026-07-11T00:00:00.000Z", sourcePath: "/tmp/latest.log", decks: [] };

    await Promise.all([store.write(older), store.write(latest)]);

    await expect(store.read()).resolves.toMatchObject(latest);
  });

  it("writes and reads collection deck JSON", async () => {
    const { CollectionDeckStore } = await import("../src/main/collectionDeckStore.js");
    const root = await mkdtemp(path.join(os.tmpdir(), "collection-decks-store-"));
    tempDirs.push(root);
    const store = new CollectionDeckStore(path.join(root, "collection-decks.json"));

    await store.write({
      updatedAt: "2026-07-10T00:00:00.000Z",
      sourcePath: "/tmp/Decks.log",
      decks: [
        {
          id: "deck-1",
          deckId: "9222863564",
          name: "Tempo Mage",
          heroClass: "Mage",
          format: "Standard",
          mode: "Ranked",
          cards: [{ name: "Fireball", count: 2, rawLine: "2x Fireball" }],
          rawDeckString: "AAECAf0EAabcdefghijklmno1234567890==",
          rawText: "raw block",
          sourcePath: "/tmp/Decks.log",
          updatedAt: "2026-07-10T00:00:00.000Z",
          warnings: []
        }
      ]
    });

    await expect(store.read()).resolves.toEqual({
      updatedAt: "2026-07-10T00:00:00.000Z",
      sourcePath: "/tmp/Decks.log",
      decks: [
        expect.objectContaining({
          id: "deck-1",
          deckId: "9222863564",
          name: "Tempo Mage",
          cards: [expect.objectContaining({ name: "Fireball", count: 2 })]
        })
      ]
    });
  });
});
