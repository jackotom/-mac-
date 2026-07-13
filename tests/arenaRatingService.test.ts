import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() }
}));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function hearthArenaHtml(cardId: string, score: number, classSlug = "hunter", dtClass = `${classSlug} commons`) {
  return `
    <section class="tab tierlist ${classSlug}" id="${classSlug}">
      <ul>
        <li>
          <dl class="card score_100">
            <dt class="${dtClass}" data-card-image="https://cdn.heartharena.com/images/renders/zhCN/${cardId}.webp">测试牌</dt>
            <dd class="score score_100">${score}↑</dd>
          </dl>
        </li>
      </ul>
    </section>
  `;
}

describe("ArenaRatingService", () => {
  it("uses a fresh local rating cache without fetching", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arena-ratings-"));
    tempDirs.push(root);
    const cachePath = path.join(root, "ratings.json");
    await writeFile(
      cachePath,
      JSON.stringify({
        source: "cached",
        version: 3,
        fetchedAt: "2026-07-10T00:00:00.000Z",
        ratings: { Hunter: { TEST_001: 88 } },
        hearthArenaWeb: {
          source: "HearthArena Web",
          version: "zh-cn:web-v1",
          locales: {
            "zh-cn": {
              locale: "zh-cn",
              url: "https://www.heartharena.com/zh-cn/tierlist",
              version: "web-v1",
              fetchedAt: "2026-07-10T00:00:00.000Z",
              ratingCount: 1,
              ratings: { Hunter: { TEST_001: 89 } }
            }
          }
        },
        firestone: {
          source: "Firestone",
          version: "firestone-v1",
          lastUpdated: "2026-07-10T00:00:00.000Z",
          ratings: { TEST_001: { includedWinrate: 54.2, sampleSize: 2000, pickRate: 42.1, highWinPickRate: 49.5, highWinThreshold: 6 } }
        }
      }),
      "utf8"
    );
    const fetcher = vi.fn();

    const { ArenaRatingService } = await import("../src/main/arenaRatingService.js");
    const result = await new ArenaRatingService(cachePath, fetcher).loadRatings();

    expect(result.table).toMatchObject({ version: 3, source: "cached" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches the full table only when the cached version changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arena-ratings-"));
    tempDirs.push(root);
    const cachePath = path.join(root, "ratings.json");
    await writeFile(
      cachePath,
      JSON.stringify({
        source: "cached",
        version: 3,
        fetchedAt: "2026-07-10T00:00:00.000Z",
        ratings: { Hunter: { TEST_001: 88 } }
      }),
      "utf8"
    );
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await utimes(cachePath, old, old);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("haVersion")) {
        return { ok: true, status: 200, json: async () => ({ haVersion: 4 }) } as Response;
      }
      if (url.includes("heartharena.com/zh-cn/tierlist")) {
        return { ok: true, status: 200, text: async () => hearthArenaHtml("TEST_002", 97) } as Response;
      }
      if (url.includes("heartharena.com/zh-tw/tierlist")) {
        return { ok: true, status: 200, text: async () => hearthArenaHtml("TEST_002", 96) } as Response;
      }
      if (url.includes("static.zerotoheroes.com") && init?.method === "HEAD") {
        expect(init.signal).toBeInstanceOf(AbortSignal);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "last-modified": url.includes("/draft/arena-underground/") ? "firestone-underground-draft-v2" : url.includes("/draft/") ? "firestone-arena-draft-v2" : "firestone-card-v2" })
        } as Response;
      }
      if (url.includes("/stats/cards/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            lastUpdated: "2026-07-10T00:00:00.000Z",
            stats: [
              {
                cardId: "TEST_002",
                stats: { decksWithCard: 1000, decksWithCardThenWin: 550, played: 600, playedThenWin: 330 }
              }
            ]
          })
        } as Response;
      }
      if (url.includes("/stats/draft/arena-underground/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            lastUpdateDate: "2026-07-10T00:00:00.000Z",
            stats: [
              {
                cardId: "TEST_002",
                statsByWins: {
                  0: { offered: 1000, picked: 400 },
                  6: { offered: 250, picked: 125 },
                  8: { offered: 80, picked: 50 },
                  12: { offered: 40, picked: 24 }
                }
              }
            ]
          })
        } as Response;
      }
      if (url.includes("/stats/draft/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            lastUpdateDate: "2026-07-10T00:00:00.000Z",
            stats: [
              {
                cardId: "TEST_003",
                statsByWins: {
                  0: { offered: 900, picked: 300 },
                  4: { offered: 200, picked: 80 }
                }
              }
            ]
          })
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ Hunter: { TEST_002: 91 } }) } as Response;
    });

    const { ArenaRatingService } = await import("../src/main/arenaRatingService.js");
    const { getArenaScore, getArenaScoreSourceLabel } = await import("../src/shared/arenaRatings.js");
    const result = await new ArenaRatingService(cachePath, fetcher).loadRatings();

    expect(result.table).toMatchObject({
      version: 4,
      ratings: { Hunter: { TEST_002: 91 } },
      hearthArenaWeb: {
        source: "HearthArena Web",
        locales: {
          "zh-cn": {
            ratingCount: 1,
            ratings: { Hunter: { TEST_002: 97 } }
          },
          "zh-tw": {
            ratingCount: 1,
            ratings: { Hunter: { TEST_002: 96 } }
          }
        }
      },
      firestone: {
        version: "cards:firestone-card-v2|draft:firestone-arena-draft-v2,firestone-underground-draft-v2",
        ratings: {
          TEST_002: {
            includedWinrate: 55,
            playedWinrate: 55,
            sampleSize: 1000,
            pickRate: 40,
            pickRateSampleSize: 1000,
            highWinPickRate: 50,
            highWinPickRateSampleSize: 250,
            highWinThreshold: 6,
            highWinPickRateImpact: 10,
            twelveWinRate: 60,
            twelveWinRateSampleSize: 40,
            draftBuckets: {
              0: { offered: 1000, picked: 400, pickRate: 40 },
              6: { offered: 250, picked: 125, pickRate: 50 },
              8: { offered: 80, picked: 50, pickRate: 62.5 },
              12: { offered: 40, picked: 24, pickRate: 60 }
            }
          }
        }
      }
    });
    expect(getArenaScore(result.table, "TEST_002", "Hunter")).toBe(97);
    expect(getArenaScoreSourceLabel(result.table)).toContain("HearthArena官网");
    expect(fetcher).toHaveBeenCalledTimes(10);
  });

  it("refreshes fresh legacy Firestone caches that do not include draft buckets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arena-ratings-"));
    tempDirs.push(root);
    const cachePath = path.join(root, "ratings.json");
    await writeFile(
      cachePath,
      JSON.stringify({
        source: "cached",
        version: 4,
        fetchedAt: "2026-07-10T00:00:00.000Z",
        ratings: { Hunter: { TEST_001: 88 } },
        firestone: {
          source: "Firestone",
          version: "legacy-firestone-v1",
          lastUpdated: "2026-07-10T00:00:00.000Z",
          ratings: { TEST_001: { includedWinrate: 54.2, sampleSize: 2000 } }
        }
      }),
      "utf8"
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("haVersion")) {
        return { ok: true, status: 200, json: async () => ({ haVersion: 4 }) } as Response;
      }
      if (url.includes("heartharena.com")) {
        return { ok: true, status: 200, text: async () => hearthArenaHtml("TEST_001", 90) } as Response;
      }
      if (url.includes("static.zerotoheroes.com") && init?.method === "HEAD") {
        return { ok: true, status: 200, headers: new Headers({ etag: url }) } as Response;
      }
      if (url.includes("/stats/cards/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            lastUpdated: "2026-07-10T00:00:00.000Z",
            stats: [{ cardId: "TEST_001", stats: { decksWithCard: 100, decksWithCardThenWin: 54 } }]
          })
        } as Response;
      }
      if (url.includes("/stats/draft/arena-underground/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            lastUpdateDate: "2026-07-10T00:00:00.000Z",
            stats: [{ cardId: "TEST_001", statsByWins: { 0: { offered: 100, picked: 40 }, 6: { offered: 20, picked: 10 } } }]
          })
        } as Response;
      }
      if (url.includes("/stats/draft/")) {
        return { ok: true, status: 200, json: async () => ({ lastUpdateDate: "2026-07-10T00:00:00.000Z", stats: [] }) } as Response;
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const { ArenaRatingService } = await import("../src/main/arenaRatingService.js");
    const result = await new ArenaRatingService(cachePath, fetcher).loadRatings();

    expect(result.table?.firestone?.ratings.TEST_001).toMatchObject({
      includedWinrate: 54,
      pickRate: 40,
      highWinPickRate: 50,
      highWinThreshold: 6
    });
  });

  it("does not synthesize 12-win rate from underground high-win buckets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arena-ratings-"));
    tempDirs.push(root);
    const cachePath = path.join(root, "ratings.json");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("haVersion")) {
        return { ok: true, status: 200, json: async () => ({ haVersion: 5 }) } as Response;
      }
      if (url.includes("heartharena.com")) {
        return { ok: true, status: 200, text: async () => hearthArenaHtml("TEST_004", 95) } as Response;
      }
      if (url.includes("static.zerotoheroes.com") && init?.method === "HEAD") {
        return { ok: true, status: 200, headers: new Headers({ etag: url }) } as Response;
      }
      if (url.includes("/stats/cards/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            lastUpdated: "2026-07-10T00:00:00.000Z",
            stats: [{ cardId: "TEST_004", stats: { decksWithCard: 100, decksWithCardThenWin: 55 } }]
          })
        } as Response;
      }
      if (url.includes("/stats/draft/arena-underground/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            lastUpdateDate: "2026-07-10T00:00:00.000Z",
            stats: [
              {
                cardId: "TEST_004",
                statsByWins: {
                  0: { offered: 1000, picked: 500 },
                  4: { offered: 600, picked: 360 },
                  6: { offered: 400, picked: 260 },
                  8: { offered: 200, picked: 150 }
                }
              }
            ]
          })
        } as Response;
      }
      if (url.includes("/stats/draft/")) {
        return { ok: true, status: 200, json: async () => ({ lastUpdateDate: "2026-07-10T00:00:00.000Z", stats: [] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ Hunter: { TEST_004: 90 } }) } as Response;
    });

    const { ArenaRatingService } = await import("../src/main/arenaRatingService.js");
    const result = await new ArenaRatingService(cachePath, fetcher).loadRatings();

    expect(result.table?.firestone?.ratings.TEST_004).toMatchObject({
      pickRate: 50,
      highWinPickRate: 65,
      highWinThreshold: 6,
      highWinPickRateImpact: 15,
      draftBuckets: {
        8: { offered: 200, picked: 150, pickRate: 75 }
      }
    });
    expect(result.table?.firestone?.ratings.TEST_004.twelveWinRate).toBeUndefined();
  });

  it("keeps cached HearthArena web locale data when one official page fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arena-ratings-"));
    tempDirs.push(root);
    const cachePath = path.join(root, "ratings.json");
    await writeFile(
      cachePath,
      JSON.stringify({
        source: "cached",
        version: 4,
        fetchedAt: "2026-07-10T00:00:00.000Z",
        ratings: { Warrior: { TEST_005: 80 } },
        hearthArenaWeb: {
          source: "HearthArena Web",
          version: "zh-tw:cached-web-v1",
          locales: {
            "zh-tw": {
              locale: "zh-tw",
              url: "https://www.heartharena.com/zh-tw/tierlist",
              version: "cached-web-v1",
              fetchedAt: "2026-07-10T00:00:00.000Z",
              ratingCount: 1,
              ratings: { Warrior: { TEST_006: 88 } }
            }
          }
        },
        firestone: {
          source: "Firestone",
          version: "cards:card-v1|draft:draft-a,draft-b",
          lastUpdated: "2026-07-10T00:00:00.000Z",
          ratings: { TEST_005: { pickRate: 42, highWinPickRate: 50, highWinThreshold: 6 } }
        }
      }),
      "utf8"
    );
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await utimes(cachePath, old, old);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("haVersion")) {
        return { ok: true, status: 200, json: async () => ({ haVersion: 4 }) } as Response;
      }
      if (url.includes("heartharena.com/zh-cn/tierlist")) {
        return { ok: true, status: 200, text: async () => hearthArenaHtml("TEST_005", 99, "warrior", "hunter commons") } as Response;
      }
      if (url.includes("heartharena.com/zh-tw/tierlist")) {
        return { ok: false, status: 503, text: async () => "" } as Response;
      }
      if (url.includes("static.zerotoheroes.com") && init?.method === "HEAD") {
        const version = url.includes("/draft/arena-underground/") ? "draft-b" : url.includes("/draft/") ? "draft-a" : "card-v1";
        return { ok: true, status: 200, headers: new Headers({ etag: version }) } as Response;
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const { ArenaRatingService } = await import("../src/main/arenaRatingService.js");
    const { getArenaScore } = await import("../src/shared/arenaRatings.js");
    const result = await new ArenaRatingService(cachePath, fetcher).loadRatings();

    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("zh-tw")]));
    expect(getArenaScore(result.table, "TEST_005", "Warrior")).toBe(99);
    expect(getArenaScore(result.table, "TEST_006", "Warrior")).toBe(88);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});
