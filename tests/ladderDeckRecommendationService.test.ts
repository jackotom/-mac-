import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LadderDeckRecommendationService } from "../src/main/ladderDeckRecommendationService.js";

const dirs: string[] = [];
const testNow = () => Date.parse("2026-07-12T12:00:00.000Z");
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));
const deck = (mode = "standard") => ({
  id: `${mode}-1`, mode, region: "CN", patch: "36.0", name: "测试卡组", className: "Mage", winRate: 56,
  games: 800, deckCode: "AAECAQcCi6AE0LIHDuPmBqr8Bqv8BuiHB9KXB7etB4+xB+yyB4S9B7XAB5XCB5vCB5zCB/nDBwAA", cards: [], source: { name: "测试源", url: "https://example.com" },
  updatedAt: "2026-07-12T00:00:00.000Z"
});
const feed = (decks: unknown[], patch = "36.0") => ({
  schemaVersion: 1, region: "CN", patch, generatedAt: "2026-07-12T00:00:00.000Z",
  source: { name: "测试源", url: "https://example.com" }, decks
});
const detected = vi.fn(async () => ({
  status: "detected" as const, fullVersion: "36.0.246003", patch: "36.0", region: "CN" as const,
  appPath: "/Applications/Hearthstone/Hearthstone.app", source: "default-path" as const
}));
const hsguruHtml = `
  <a href="/decks?format=2&amp;period=patch_36.0.3&amp;rank=diamond_to_legend">36.0.3</a>
  <div id="deck_stats-40721799" class="column is-narrow">
    <div class="decklist-info warrior">
      <a href="https://www.hsguru.com/deck/40721799">龙战</a>
      <span>${deck().deckCode}</span>
    </div>
    <div class="card-name"><span># 2x (1) </span>Carrier Whelp</div>
    <span class="tag column"><span><span>60.0</span></span></span>
    <div class="column tag">Games: 3245</div>
  </div>
`;

describe("LadderDeckRecommendationService", () => {
  it("fetches validated data and writes a reusable cache", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ladder-decks-")); dirs.push(root);
    const cachePath = path.join(root, "cache.json");
    const fetcher = vi.fn(async () => new Response(JSON.stringify(feed([deck()])), { status: 200 }));
    const result = await new LadderDeckRecommendationService({ sourceUrl: "https://example.com/cn.json", cachePath, fetcher, installationDetector: detected, now: testNow }).get("standard");
    expect(result).toMatchObject({ status: "ready", stale: false, gameVersion: "36.0.246003", recommendation: { id: "standard-1" } });
    expect(JSON.parse(await readFile(cachePath, "utf8"))).toMatchObject({ entries: [{ recommendations: [{ id: "standard-1" }] }] });
  });

  it("uses the public HSGuru international ranking when no Chinese-server feed is configured", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ladder-decks-")); dirs.push(root);
    const fetcher = vi.fn(async () => new Response(hsguruHtml, { status: 200 }));
    const result = await new LadderDeckRecommendationService({
      cachePath: path.join(root, "cache.json"), fetcher, installationDetector: detected, now: testNow
    }).get("standard");
    expect(result).toMatchObject({
      status: "ready",
      stale: false,
      recommendation: { id: "hsguru-40721799", region: "GLOBAL", source: { name: expect.stringContaining("国际服") } }
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("format=2"), expect.anything());
  });

  it("uses an expired cache with an explicit stale marker when refresh fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ladder-decks-")); dirs.push(root);
    const cachePath = path.join(root, "cache.json");
    await writeFile(cachePath, JSON.stringify({ schemaVersion: 1, patch: "36.0", mode: "wild", fetchedAt: "2026-07-11T12:00:00.000Z", recommendations: [deck("wild")] }));
    const result = await new LadderDeckRecommendationService({ sourceUrl: "https://example.com/cn.json", cachePath, fetcher: vi.fn(async () => { throw new Error("offline"); }), installationDetector: detected, now: () => Date.parse("2026-07-12T00:00:00Z") }).get("wild");
    expect(result).toMatchObject({ status: "ready", stale: true, recommendation: { mode: "wild" } });
    expect(result.message).toContain("缓存");
  });

  it("states the capability boundary when every ranking source is disabled", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ladder-decks-")); dirs.push(root);
    const result = await new LadderDeckRecommendationService({ cachePath: path.join(root, "cache.json"), hsguruBaseUrl: null, installationDetector: detected }).get("standard");
    expect(result).toMatchObject({ status: "unavailable" });
    expect(result.message).toContain("来源");
  });

  it("rejects otherwise valid records from a different game patch", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ladder-decks-")); dirs.push(root);
    const fetcher = vi.fn(async () => new Response(JSON.stringify(feed([{ ...deck(), patch: "35.6" }], "35.6")), { status: 200 }));
    const result = await new LadderDeckRecommendationService({
      sourceUrl: "https://example.com/cn.json",
      cachePath: path.join(root, "cache.json"),
      fetcher,
      installationDetector: detected,
      now: testNow
    }).get("standard");
    expect(result).toMatchObject({ status: "unavailable" });
    expect(result.message).toContain("当前版本");
  });

  it("refuses to recommend when the current game patch is not verified", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ladder-decks-")); dirs.push(root);
    const fetcher = vi.fn(async () => new Response(JSON.stringify(feed([deck()])), { status: 200 }));
    const result = await new LadderDeckRecommendationService({
      sourceUrl: "https://example.com/cn.json",
      cachePath: path.join(root, "cache.json"),
      fetcher,
      installationDetector: vi.fn(async () => ({ status: "version-unreadable" as const, message: "无法读取版本" }))
    }).get("standard");
    expect(result).toMatchObject({ status: "unavailable" });
    expect(result.message).toContain("当前版本");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a cache belonging to another patch", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ladder-decks-")); dirs.push(root);
    const cachePath = path.join(root, "cache.json");
    await writeFile(cachePath, JSON.stringify({ schemaVersion: 1, patch: "35.6", mode: "standard", fetchedAt: "2026-07-12T00:00:00.000Z", recommendations: [{ ...deck(), patch: "35.6" }] }));
    const result = await new LadderDeckRecommendationService({ cachePath, hsguruBaseUrl: null, installationDetector: detected }).get("standard");
    expect(result).toMatchObject({ status: "unavailable", errorCode: "source-unconfigured", gameVersion: "36.0.246003" });
  });

  it("keeps standard and wild caches side by side", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ladder-decks-")); dirs.push(root);
    const cachePath = path.join(root, "cache.json");
    const online = new LadderDeckRecommendationService({
      sourceUrl: "https://example.com/cn.json", cachePath, installationDetector: detected,
      fetcher: vi.fn(async () => new Response(JSON.stringify(feed([deck("standard"), deck("wild")])), { status: 200 })),
      now: testNow
    });
    await online.get("standard");
    await online.get("wild");
    const offline = new LadderDeckRecommendationService({ cachePath, hsguruBaseUrl: null, installationDetector: detected, now: testNow });
    await expect(offline.get("standard")).resolves.toMatchObject({ status: "ready", recommendation: { mode: "standard" } });
    await expect(offline.get("wild")).resolves.toMatchObject({ status: "ready", recommendation: { mode: "wild" } });
  });
});
