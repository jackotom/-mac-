import type { CardLibraryResult, NormalizedCardLibraryQuery } from "./types.js";

export type CardRarity = "FREE" | "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "UNKNOWN";

export interface CardInfo {
  readonly dbfId: number;
  readonly name: string;
  readonly cardId?: string;
  readonly id?: string;
  readonly collectible?: boolean;
  readonly manaCost?: number;
  readonly attack?: number;
  readonly health?: number;
  readonly text?: string;
  readonly cardTypeId?: number;
  readonly cardType?: string;
  readonly rarity?: CardRarity;
  readonly spellSchoolId?: number;
  readonly spellSchool?: string;
  readonly heroClass?: string;
  readonly heroClasses?: readonly string[];
  readonly imageUrl?: string;
  readonly cropImageUrl?: string;
  readonly relatedCardIds?: readonly number[];
  readonly mechanics?: readonly string[];
}

export interface RelatedCardInfo {
  readonly dbfId: number;
  readonly name: string;
  readonly cardId?: string;
  readonly manaCost?: number;
  readonly cardType?: string;
  readonly rarity?: CardRarity;
  readonly text?: string;
  readonly imageUrl?: string;
  readonly cropImageUrl?: string;
}

export interface CardDetails extends CardInfo {
  readonly isSpell: boolean;
  readonly relatedCards: readonly RelatedCardInfo[];
}

export type CardDatabase = Readonly<Record<string, unknown>>;

export function createCardDatabase(cards: readonly unknown[]): CardDatabase {
  const database: Record<string, CardInfo> = {};

  for (const card of cards) {
    const cardInfo = parseCardInfo(card);
    if (!cardInfo) {
      continue;
    }

    database[String(cardInfo.dbfId)] = cardInfo;
  }

  return database;
}

export function getCardInfo(cardDb: CardDatabase, dbfId: number): CardInfo | undefined {
  return parseCardInfo(cardDb[String(dbfId)]);
}

export function listCardInfos(cardDb: CardDatabase): readonly CardInfo[] {
  return Object.values(cardDb)
    .map(parseCardInfo)
    .filter((card): card is CardInfo => card !== undefined);
}

const DEFAULT_CARD_LIBRARY_PAGE_SIZE = 48;
const MAX_CARD_LIBRARY_PAGE_SIZE = 100;
const MAX_CARD_LIBRARY_PAGE = 100_000;
const CARD_LIBRARY_COLLATOR = new Intl.Collator("zh-Hans", { numeric: true, sensitivity: "base" });
const BROWSABLE_CARD_TYPES = new Set(["英雄", "随从", "法术", "武器", "地标"]);
const INVALID_CROP_IMAGE_FILENAMES = new Set(["8a60b28b4a9bb70748ce68815582bbde7a0c2ebfdf70988adb51da88c5d655fc.png"]);

export function normalizeCardLibraryQuery(input: unknown): NormalizedCardLibraryQuery {
  const value = isRecord(input) ? input : {};
  const heroClass = normalizeHeroClass(value.heroClass);
  const cardType = normalizeCardType(stringValue(value.cardType), numberValue(value.cardTypeId));

  return {
    query: (stringValue(value.query) ?? "").slice(0, 120),
    heroClass,
    cardType,
    page: clampInteger(numberValue(value.page), 1, MAX_CARD_LIBRARY_PAGE, 1),
    pageSize: clampInteger(numberValue(value.pageSize), 1, MAX_CARD_LIBRARY_PAGE_SIZE, DEFAULT_CARD_LIBRARY_PAGE_SIZE)
  };
}

export function listCardLibrary(cardDb: CardDatabase, input?: unknown): CardLibraryResult {
  const query = normalizeCardLibraryQuery(input);
  const cards = listCardInfos(cardDb).filter(isBrowsableCard);
  const heroClasses = sortText(uniqueStrings(cards.flatMap((card) => card.heroClasses ?? [])));
  const cardTypes = sortText(uniqueStrings(cards.map((card) => card.cardType).filter((type): type is string => Boolean(type))));
  const normalizedSearch = normalizeSearchText(query.query);
  const items = cards
    .filter((card) => matchesCardLibraryQuery(card, query, normalizedSearch))
    .sort(compareCardInfo)
    .map((card) => toCardDetails(cardDb, card));
  const start = (query.page - 1) * query.pageSize;

  return {
    status: "ok",
    ...query,
    total: items.length,
    items: items.slice(start, start + query.pageSize),
    heroClasses,
    cardTypes,
    warnings: []
  };
}

export function createCardLibraryErrorResult(input: unknown, error: string, warnings: readonly string[] = []): CardLibraryResult {
  const query = normalizeCardLibraryQuery(input);
  return {
    status: "error",
    ...query,
    total: 0,
    items: [],
    heroClasses: [],
    cardTypes: [],
    warnings,
    error
  };
}

export function toCardDetails(cardDb: CardDatabase, card: CardInfo): CardDetails {
  const relatedCards = (card.relatedCardIds ?? [])
    .map((dbfId) => getCardInfo(cardDb, dbfId))
    .filter((related): related is CardInfo => related !== undefined)
    .map(({ dbfId, name, cardId, manaCost, cardType, rarity, text, imageUrl, cropImageUrl }) => ({
      dbfId,
      name,
      cardId,
      manaCost,
      cardType,
      rarity,
      text,
      imageUrl,
      cropImageUrl
    }));

  return {
    ...card,
    isSpell: card.cardTypeId === 5 || card.cardType === "法术" || card.cardType?.toUpperCase() === "SPELL",
    relatedCards
  };
}

export function createCardIdNameLookup(cardDb: CardDatabase): ReadonlyMap<string, string> {
  const lookup = new Map<string, string>();

  for (const value of Object.values(cardDb)) {
    const cardInfo = parseCardInfo(value);
    const cardId = cardInfo?.cardId ?? cardInfo?.id;
    if (cardInfo && cardId) {
      lookup.set(normalizeCardId(cardId), cardInfo.name);
    }
  }

  return lookup;
}

export function normalizeCardId(cardId: string): string {
  return cardId.trim().toLocaleLowerCase();
}

function parseCardInfo(value: unknown): CardInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const dbfId = numberValue(value.dbfId) ?? numberValue(value.id);
  const name = value.name;
  if (
    typeof dbfId !== "number" ||
    !Number.isSafeInteger(dbfId) ||
    dbfId <= 0 ||
    typeof name !== "string" ||
    name.trim().length === 0
  ) {
    return undefined;
  }

  const cardId = stringValue(value.cardId) ?? stringValue(value.id);
  const id = stringValue(value.id);
  const cardTypeId = numberValue(value.cardTypeId) ?? numberValue(value.card_type_id) ?? numberValue(value.type);
  const rawCardType = stringValue(value.cardType) ?? stringValue(value.type);
  const cardType = normalizeCardType(rawCardType, cardTypeId);
  const rarity = normalizeCardRarity(
    stringValue(value.rarity) ?? stringValue(value.rarityName) ?? stringValue(value.rarity_name),
    numberValue(value.rarityId) ?? numberValue(value.rarity_id)
  );
  const spellSchoolId = numberValue(value.spellSchoolId) ?? numberValue(value.spell_school_id);
  const spellSchool = stringValue(value.spellSchool) ?? stringValue(value.spell_school);
  const heroClasses = parseHeroClasses(value);
  const relatedCardIds = uniqueNumbers([
    ...numberArray(value.relatedCardIds),
    ...numberArray(value.child_ids),
    ...numberArray(value.childIds),
    ...numberArray(value.bundledCardIds),
    ...numberArray(value.bundled_card_ids),
    ...(numberValue(value.parent_id) ?? numberValue(value.parentId)
      ? [numberValue(value.parent_id) ?? numberValue(value.parentId)!]
      : [])
  ]);

  return {
    dbfId,
    name,
    cardId,
    id,
    collectible: booleanValue(value.collectible),
    manaCost: numberValue(value.mana_cost) ?? numberValue(value.manaCost) ?? numberValue(value.cost),
    attack: numberValue(value.attack),
    health: numberValue(value.health),
    text: cleanCardText(stringValue(value.text) ?? stringValue(value.description)),
    cardTypeId,
    cardType,
    rarity,
    spellSchoolId,
    spellSchool,
    heroClass: heroClasses.length > 0 ? heroClasses.join(" / ") : undefined,
    heroClasses: heroClasses.length > 0 ? heroClasses : undefined,
    imageUrl: stringValue(value.image) ?? stringValue(value.imageUrl) ?? stringValue(value.img),
    cropImageUrl: validCropImageUrl(value.crop_image) ?? validCropImageUrl(value.cropImage) ?? validCropImageUrl(value.cropImageUrl),
    relatedCardIds: relatedCardIds.length > 0 ? relatedCardIds : undefined,
    mechanics: textArray(value.mechanics).map((mechanic) => mechanic.toUpperCase())
  };
}

function normalizeCardRarity(rawRarity: string | undefined, rarityId: number | undefined): CardRarity | undefined {
  if (rawRarity) {
    const normalized = rawRarity.trim().toLocaleUpperCase("zh-CN");
    if (normalized === "FREE" || normalized === "基本" || normalized === "免费") {
      return "FREE";
    }
    if (normalized === "COMMON" || normalized === "普通") {
      return "COMMON";
    }
    if (normalized === "RARE" || normalized === "稀有") {
      return "RARE";
    }
    if (normalized === "EPIC" || normalized === "史诗") {
      return "EPIC";
    }
    if (normalized === "LEGENDARY" || normalized === "传说") {
      return "LEGENDARY";
    }
  }

  const officialRarityById: Readonly<Record<number, CardRarity>> = {
    1: "COMMON",
    2: "FREE",
    3: "RARE",
    4: "EPIC",
    5: "LEGENDARY"
  };

  if (rarityId !== undefined) {
    return officialRarityById[rarityId] ?? "UNKNOWN";
  }

  return rawRarity ? "UNKNOWN" : undefined;
}

function matchesCardLibraryQuery(card: CardInfo, query: NormalizedCardLibraryQuery, normalizedSearch: string): boolean {
  if (query.heroClass && !(card.heroClasses ?? []).includes(query.heroClass)) {
    return false;
  }

  if (query.cardType && card.cardType !== query.cardType) {
    return false;
  }

  if (!normalizedSearch) {
    return true;
  }

  return [card.name, card.cardId, card.id, card.text, card.heroClass, card.cardType]
    .filter((value): value is string => typeof value === "string")
    .some((value) => normalizeSearchText(value).includes(normalizedSearch));
}

function isBrowsableCard(card: CardInfo): boolean {
  const name = card.name.trim();
  return (
    name.length > 0 &&
    card.collectible === true &&
    !/[?？]/.test(name) &&
    !/^unknown(?:\s+card)?$/i.test(name) &&
    BROWSABLE_CARD_TYPES.has(card.cardType ?? "")
  );
}

function compareCardInfo(left: CardInfo, right: CardInfo): number {
  const manaDifference = (left.manaCost ?? Number.MAX_SAFE_INTEGER) - (right.manaCost ?? Number.MAX_SAFE_INTEGER);
  if (manaDifference !== 0) {
    return manaDifference;
  }

  const nameDifference = CARD_LIBRARY_COLLATOR.compare(left.name, right.name);
  return nameDifference !== 0 ? nameDifference : left.dbfId - right.dbfId;
}

function parseHeroClasses(value: Record<string, unknown>): string[] {
  const sourceValues = [
    value.heroClasses,
    value.classes,
    value.class,
    value.cardClass,
    value.card_class,
    value.playerClass,
    value.player_class,
    value.className,
    value.class_name,
    value.heroClass
  ];

  return uniqueStrings(sourceValues.flatMap(extractHeroClassValues));
}

function extractHeroClassValues(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[|,/]/)
      .map((entry) => normalizeHeroClass(entry))
      .filter((entry): entry is string => entry !== undefined);
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractHeroClassValues);
  }

  return [];
}

export function normalizeHeroClass(value: unknown): string | undefined {
  const source = stringValue(value);
  if (!source) {
    return undefined;
  }

  const normalized = source.replace(/[\s_-]+/g, "").toUpperCase();
  const knownClasses: Record<string, string> = {
    WARRIOR: "战士",
    战士: "战士",
    SHAMAN: "萨满祭司",
    萨满: "萨满祭司",
    萨满祭司: "萨满祭司",
    ROGUE: "盗贼",
    盗贼: "盗贼",
    PALADIN: "圣骑士",
    圣骑士: "圣骑士",
    HUNTER: "猎人",
    猎人: "猎人",
    DRUID: "德鲁伊",
    德鲁伊: "德鲁伊",
    WARLOCK: "术士",
    术士: "术士",
    MAGE: "法师",
    法师: "法师",
    PRIEST: "牧师",
    牧师: "牧师",
    DEMONHUNTER: "恶魔猎手",
    恶魔猎手: "恶魔猎手",
    DEATHKNIGHT: "死亡骑士",
    死亡骑士: "死亡骑士",
    NEUTRAL: "中立",
    中立: "中立"
  };

  return knownClasses[normalized] ?? source;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === 0 || value === "0" || value === "false") {
    return false;
  }

  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function validCropImageUrl(value: unknown): string | undefined {
  const url = stringValue(value);
  if (!url) {
    return undefined;
  }

  try {
    const filename = new URL(url).pathname.split("/").at(-1)?.toLocaleLowerCase();
    return filename && INVALID_CROP_IMAGE_FILENAMES.has(filename) ? undefined : url;
  } catch {
    return url;
  }
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(numberValue).filter((entry): entry is number => entry !== undefined && Number.isSafeInteger(entry) && entry > 0);
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (isRecord(entry)) return [stringValue(entry.name) ?? stringValue(entry.id)].filter((item): item is string => Boolean(item));
    return [];
  });
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function cleanCardText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();

  return text.length > 0 ? text : undefined;
}

export function normalizeCardType(value: string | undefined, cardTypeId: number | undefined): string | undefined {
  if (cardTypeId !== undefined) {
    const byId: Record<number, string> = {
      3: "英雄",
      4: "随从",
      5: "法术",
      7: "武器",
      39: "地标"
    };
    if (byId[cardTypeId]) {
      return byId[cardTypeId];
    }
  }

  const byName: Record<string, string> = {
    HERO: "英雄",
    MINION: "随从",
    SPELL: "法术",
    WEAPON: "武器",
    LOCATION: "地标"
  };
  return value ? byName[value.toUpperCase()] ?? value : undefined;
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sortText(values: readonly string[]): string[] {
  return [...values].sort((left, right) => CARD_LIBRARY_COLLATOR.compare(left, right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
