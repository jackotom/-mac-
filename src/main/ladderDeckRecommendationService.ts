import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectHearthstoneInstallation, type HearthstoneInstallationResult } from "./hearthstoneInstallation.js";
import { parseLadderDeckRecommendations, selectTopLadderDeck, type LadderDeckRecommendation, type LadderDeckRecommendationResult, type LadderMode } from "../shared/ladderDeckRecommendation.js";

const DEFAULT_MIN_GAMES = 100;
const DEFAULT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_STALE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15_000;

interface ServiceOptions {
  readonly sourceUrl?: string; readonly cachePath?: string; readonly fetcher?: typeof fetch; readonly minGames?: number;
  readonly cacheMaxAgeMs?: number; readonly staleMaxAgeMs?: number; readonly timeoutMs?: number; readonly now?: () => number;
  readonly installationDetector?: () => Promise<HearthstoneInstallationResult>;
}
interface CachePayload {
  readonly schemaVersion: 1; readonly patch: string; readonly mode: LadderMode; readonly fetchedAt: string;
  readonly recommendations: readonly LadderDeckRecommendation[];
}
interface CacheFile { readonly schemaVersion: 1; readonly entries: readonly CachePayload[] }

export class LadderDeckRecommendationService {
  private readonly sourceUrl: string | undefined; private readonly cachePath: string; private readonly fetcher: typeof fetch;
  private readonly minGames: number; private readonly cacheMaxAgeMs: number; private readonly staleMaxAgeMs: number;
  private readonly timeoutMs: number; private readonly now: () => number; private readonly installationDetector: () => Promise<HearthstoneInstallationResult>;
  private writeChain: Promise<void> = Promise.resolve();
  constructor(options: ServiceOptions = {}) {
    this.sourceUrl = options.sourceUrl ?? process.env.HEARTHSTONE_CN_LADDER_DECK_SOURCE_URL;
    this.cachePath = options.cachePath ?? path.join(os.homedir(), "Library", "Application Support", "hearthstone-mac-tracker", "cn-ladder-decks.json");
    this.fetcher = options.fetcher ?? fetch; this.minGames = options.minGames ?? DEFAULT_MIN_GAMES;
    this.cacheMaxAgeMs = options.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS; this.staleMaxAgeMs = options.staleMaxAgeMs ?? DEFAULT_STALE_MAX_AGE_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS; this.now = options.now ?? Date.now;
    this.installationDetector = options.installationDetector ?? detectHearthstoneInstallation;
  }

  async get(mode: LadderMode): Promise<LadderDeckRecommendationResult> {
    const installation = await this.installationDetector();
    if (installation.status !== "detected") return installationFailure(installation);
    const cached = await this.readCache(installation.patch, mode);
    if (cached && this.age(cached) <= this.cacheMaxAgeMs) {
      const recommendation = this.select(cached.recommendations, installation.patch, mode);
      if (recommendation) return { status: "ready", recommendation, stale: false, gameVersion: installation.fullVersion };
    }
    if (!this.sourceUrl) {
      const stale = cached && this.age(cached) <= this.staleMaxAgeMs && this.select(cached.recommendations, installation.patch, mode);
      if (stale) return { status: "ready", recommendation: stale, stale: true, gameVersion: installation.fullVersion, message: "暂无已配置的国服实时来源，显示本地缓存" };
      return { status: "unavailable", errorCode: "source-unconfigured", gameVersion: installation.fullVersion, message: "暂无经过验证的国服公开统计接口" };
    }
    try {
      const recommendations = await this.fetchRecommendations(installation.patch);
      const recommendation = this.select(recommendations, installation.patch, mode);
      if (!recommendation) return { status: "unavailable", errorCode: "patch-unavailable", gameVersion: installation.fullVersion, message: `国服${mode === "standard" ? "标准" : "狂野"}数据中没有当前版本且达到最低场次的卡组` };
      await this.writeCache({ schemaVersion: 1, patch: installation.patch, mode, fetchedAt: new Date(this.now()).toISOString(), recommendations });
      return { status: "ready", recommendation, stale: false, gameVersion: installation.fullVersion };
    } catch (error) {
      const recommendation = cached && this.age(cached) <= this.staleMaxAgeMs && this.select(cached.recommendations, installation.patch, mode);
      if (recommendation) return { status: "ready", recommendation, stale: true, gameVersion: installation.fullVersion, message: `国服数据更新失败，显示本地缓存：${formatError(error)}` };
      return { status: "unavailable", errorCode: error instanceof FeedError ? "feed-invalid" : "network-failed", gameVersion: installation.fullVersion, message: `国服卡组统计读取失败：${formatError(error)}` };
    }
  }
  private select(items: readonly LadderDeckRecommendation[], patch: string, mode: LadderMode) { return selectTopLadderDeck(items.filter((item) => item.patch === patch), mode, this.minGames); }
  private age(cache: CachePayload) { return this.now() - Date.parse(cache.fetchedAt); }
  private async fetchRecommendations(expectedPatch: string): Promise<LadderDeckRecommendation[]> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.sourceUrl!, { signal: controller.signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!isRecord(payload) || payload.patch !== expectedPatch) throw new FeedError("数据版本与炉石当前版本不一致");
      try { return parseLadderDeckRecommendations(payload, { now: this.now }); } catch (error) { throw new FeedError(formatError(error)); }
    } finally { clearTimeout(timeout); }
  }
  private async readCache(patch: string, mode: LadderMode): Promise<CachePayload | undefined> {
    try {
      const value = JSON.parse(await fs.readFile(this.cachePath, "utf8")) as unknown;
      if (!isRecord(value) || value.schemaVersion !== 1) return undefined;
      const candidates = Array.isArray(value.entries) ? value.entries : [value];
      const entry = candidates.find((item) => isRecord(item) && item.patch === patch && item.mode === mode);
      if (!isRecord(entry) || typeof entry.fetchedAt !== "string" || !Number.isFinite(Date.parse(entry.fetchedAt)) || !Array.isArray(entry.recommendations)) return undefined;
      return { schemaVersion: 1, patch, mode, fetchedAt: entry.fetchedAt, recommendations: entry.recommendations as LadderDeckRecommendation[] };
    } catch { return undefined; }
  }
  private async writeCache(payload: CachePayload): Promise<void> {
    const operation = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
      const existing = await this.readCacheFile();
      const entries = existing.entries.filter((entry) => entry.patch !== payload.patch || entry.mode !== payload.mode);
      entries.push(payload);
      const temp = `${this.cachePath}.${process.pid}.${Date.now()}.tmp`;
      try { await fs.writeFile(temp, JSON.stringify({ schemaVersion: 1, entries } satisfies CacheFile), "utf8"); await fs.rename(temp, this.cachePath); }
      finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
    });
    this.writeChain = operation.catch(() => undefined);
    await operation;
  }
  private async readCacheFile(): Promise<CacheFile> {
    try {
      const value = JSON.parse(await fs.readFile(this.cachePath, "utf8")) as unknown;
      if (!isRecord(value) || value.schemaVersion !== 1) return { schemaVersion: 1, entries: [] };
      if (Array.isArray(value.entries)) return { schemaVersion: 1, entries: value.entries.filter(isCachePayload) };
      return isCachePayload(value) ? { schemaVersion: 1, entries: [value] } : { schemaVersion: 1, entries: [] };
    } catch { return { schemaVersion: 1, entries: [] }; }
  }
}
class FeedError extends Error {}
function installationFailure(value: Exclude<HearthstoneInstallationResult, { status: "detected" }>): LadderDeckRecommendationResult {
  const code = value.status === "not-found" ? "installation-not-found" : value.status;
  const message = value.status === "version-unreadable" ? `暂时无法确认炉石当前版本：${value.message}` : value.message;
  return { status: "unavailable", errorCode: code, message };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isCachePayload(value: unknown): value is CachePayload {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.patch === "string" && (value.mode === "standard" || value.mode === "wild") &&
    typeof value.fetchedAt === "string" && Number.isFinite(Date.parse(value.fetchedAt)) && Array.isArray(value.recommendations);
}
function formatError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
