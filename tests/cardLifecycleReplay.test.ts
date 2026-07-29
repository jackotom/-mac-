import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCardDatabase } from "../src/shared/cardDatabase";
import { TrackerEngine } from "../src/shared/trackerEngine";

const fixtureDirectory = join(process.cwd(), "fixtures", "card-tracking");

export function createReplayEngine(): TrackerEngine {
  const cardDatabase = createCardDatabase([
    { id: 1, cardId: "BURNED_CARD", name: "烧毁测试牌", type: "SPELL" },
    { id: 2, cardId: "FRIEND_USE", name: "普通使用牌", type: "SPELL" },
    { id: 3, cardId: "LATE_USE", name: "晚揭示使用牌", type: "SPELL" },
    {
      id: 4,
      cardId: "TOY_372",
      name: "匣中古神",
      collectible: 1,
      type: "SPELL",
      text: "随机施放5个法术。"
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: 100 + index,
      cardId: `RANDOM_SPELL_${index + 1}`,
      name: `随机法术${index + 1}`,
      collectible: 1,
      type: "SPELL"
    }))
  ]);
  const engine = new TrackerEngine({
    cardDatabase,
    deckText: "2x 烧毁测试牌\n2x 普通使用牌\n2x 匣中古神"
  });
  engine.setFriendlyController(1);
  return engine;
}

function fixture(name: string): string[] {
  return readFileSync(join(fixtureDirectory, name), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

describe("sanitized card lifecycle log replay", () => {
  it("tracks a full-hand burn, rejects a nine-card false burn, and enriches identity in place", () => {
    const lines = fixture("full-hand-burn.log");
    const engine = createReplayEngine();
    engine.applyText(lines.slice(0, -1).join("\n"));

    const beforeReveal = engine.getState().cardTracking!.friendly;
    expect(beforeReveal.current.hand.totalCount).toBe(9);
    expect(beforeReveal.current.graveyard.totalCount).toBe(2);
    expect(beforeReveal.burned.totalCount).toBe(1);
    expect(beforeReveal.burned.items).toHaveLength(1);
    expect(beforeReveal.burned.items[0]?.entityId).toBe("43");
    expect(beforeReveal.burned.items[0]?.card).toBeUndefined();
    expect(beforeReveal.used.totalCount).toBe(0);

    engine.applyLine(lines.at(-1)!);

    const afterReveal = engine.getState().cardTracking!.friendly;
    expect(afterReveal.current.deck.totalCount).toBe(4);
    expect(afterReveal.current.hand.totalCount).toBe(9);
    expect(afterReveal.current.graveyard.totalCount).toBe(2);
    expect(afterReveal.burned.totalCount).toBe(1);
    expect(afterReveal.burned.items).toHaveLength(1);
    expect(afterReveal.burned.items[0]).toMatchObject({
      entityId: "43",
      card: expect.objectContaining({ cardId: "BURNED_CARD", name: "烧毁测试牌" })
    });
  });

  it("deduplicates ordinary use, records a returned reuse, and enriches an unknown use in place", () => {
    const lines = fixture("card-use-return.log");
    const engine = createReplayEngine();
    engine.applyText(lines.slice(0, -1).join("\n"));

    const beforeReveal = engine.getState().cardTracking!.friendly.used;
    expect(beforeReveal.totalCount).toBe(3);
    expect(beforeReveal.items).toHaveLength(3);
    expect(new Set(beforeReveal.items.map((item) => item.id)).size).toBe(3);
    expect(beforeReveal.items.filter((item) => item.entityId === "51")).toHaveLength(2);
    expect(beforeReveal.items.find((item) => item.entityId === "71")?.card).toBeUndefined();

    engine.applyLine(lines.at(-1)!);

    const afterReveal = engine.getState().cardTracking!.friendly.used;
    expect(afterReveal.totalCount).toBe(3);
    expect(afterReveal.items).toHaveLength(3);
    expect(afterReveal.items.find((item) => item.entityId === "71")?.card).toMatchObject({
      cardId: "LATE_USE",
      name: "晚揭示使用牌"
    });
  });

  it("keeps both Yogg uses, exact result order, doubled results, duplicate spells, and nested Yogg children", () => {
    const engine = createReplayEngine();
    engine.applyText(fixture("yogg-uses.log").join("\n"));

    const used = engine.getState().cardTracking!.friendly.used;
    const yoggUses = used.items
      .filter((item) => item.card?.cardId === "TOY_372")
      .slice()
      .reverse();

    expect(used.totalCount).toBe(2);
    expect(yoggUses).toHaveLength(2);
    expect(new Set(yoggUses.map((item) => item.id)).size).toBe(2);
    expect(yoggUses.map((item) => item.entityId)).toEqual(["60", "60"]);

    const first = yoggUses[0]?.outcomeSections?.[0]?.cards ?? [];
    expect(first.map((node) => node.card.cardId)).toEqual([
      "RANDOM_SPELL_1",
      "RANDOM_SPELL_2",
      "RANDOM_SPELL_3",
      "RANDOM_SPELL_4",
      "RANDOM_SPELL_5"
    ]);

    const second = yoggUses[1]?.outcomeSections?.[0]?.cards ?? [];
    expect(second).toHaveLength(10);
    expect(second.map((node) => node.card.cardId)).toEqual([
      "RANDOM_SPELL_1",
      "RANDOM_SPELL_1",
      "RANDOM_SPELL_2",
      "RANDOM_SPELL_3",
      "RANDOM_SPELL_4",
      "RANDOM_SPELL_5",
      "RANDOM_SPELL_6",
      "RANDOM_SPELL_7",
      "RANDOM_SPELL_8",
      "TOY_372"
    ]);
    expect(second.filter((node) => node.card.cardId === "RANDOM_SPELL_1")).toHaveLength(2);
    expect(second[9]?.children?.map((node) => node.card.cardId)).toEqual([
      "RANDOM_SPELL_9",
      "RANDOM_SPELL_10"
    ]);
  });
});
