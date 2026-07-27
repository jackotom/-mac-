import { decode } from "deckstrings";
import type { LadderDeckCard, LadderDeckRecommendation, LadderMode } from "../shared/ladderDeckRecommendation.js";

interface ParseOptions {
  readonly mode: LadderMode;
  readonly expectedPatch: string;
  readonly updatedAt: string;
  readonly sourceUrl: string;
}

const classNames: Readonly<Record<string, string>> = {
  deathknight: "死亡骑士",
  "death-knight": "死亡骑士",
  demonhunter: "恶魔猎手",
  "demon-hunter": "恶魔猎手",
  druid: "德鲁伊",
  hunter: "猎人",
  mage: "法师",
  paladin: "圣骑士",
  priest: "牧师",
  rogue: "潜行者",
  shaman: "萨满祭司",
  warlock: "术士",
  warrior: "战士"
};

export function parseHsguruDecks(html: string, options: ParseOptions): LadderDeckRecommendation[] {
  const sourcePatch = html.match(/period=patch_([0-9]+(?:\.[0-9]+)+)/)?.[1];
  if (!sourcePatch || !sameMajorPatch(sourcePatch, options.expectedPatch)) {
    throw new Error("国际服排行数据与当前炉石版本不一致");
  }

  const starts = [...html.matchAll(/<div id="deck_stats-(\d+)"/g)];
  const recommendations: LadderDeckRecommendation[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const start = match.index;
    const end = starts[index + 1]?.index ?? html.length;
    if (start === undefined) continue;
    const parsed = parseDeckBlock(html.slice(start, end), match[1], options);
    if (parsed) recommendations.push(parsed);
  }
  if (recommendations.length === 0) throw new Error("国际服排行页中没有可用的卡组数据");
  return recommendations;
}

function parseDeckBlock(block: string, id: string, options: ParseOptions): LadderDeckRecommendation | undefined {
  const classKey = block.match(/class="decklist-info\s+([a-z-]+)\b/)?.[1];
  const name = block.match(new RegExp(`href="(?:https://www\\.hsguru\\.com)?/deck/${id}"[^>]*>([^<]+)</a>`))?.[1];
  const deckCode = block.match(/\bAA[A-Za-z0-9+/=]{20,}/)?.[0];
  const winRateText = block.match(/<span[^>]*class="tag column"[^>]*>[\s\S]*?<span>(\d+(?:\.\d+)?)<\/span>/)?.[1];
  const gamesText = block.match(/Games:\s*([0-9]+)/)?.[1];
  if (!classKey || !name || !deckCode || !winRateText || !gamesText) return undefined;

  try {
    const decoded = decode(deckCode);
    if (decoded.cards.reduce((sum, [, count]) => sum + count, 0) < 1) return undefined;
  } catch {
    return undefined;
  }

  return {
    id: `hsguru-${id}`,
    mode: options.mode,
    region: "GLOBAL",
    patch: options.expectedPatch,
    name: decodeHtml(name.trim()),
    className: classNames[classKey] ?? classKey,
    winRate: Number(winRateText),
    games: Number(gamesText),
    deckCode,
    cards: parseCards(block),
    source: { name: "国际服 HSGuru（钻石-传说）", url: options.sourceUrl },
    updatedAt: options.updatedAt
  };
}

function parseCards(block: string): LadderDeckCard[] {
  const cards: LadderDeckCard[] = [];
  const pattern = /<div class="card-name[^"]*"[^>]*>\s*<span[^>]*>#\s*(\d+)x\s*\((\d+)\)\s*<\/span>\s*([^<]+?)\s*<\/div>/g;
  for (const match of block.matchAll(pattern)) {
    cards.push({ name: decodeHtml(match[3].trim()), count: Number(match[1]), cost: Number(match[2]) });
  }
  return cards;
}

function sameMajorPatch(sourcePatch: string, expectedPatch: string): boolean {
  return sourcePatch.split(".").slice(0, 2).join(".") === expectedPatch.split(".").slice(0, 2).join(".");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
