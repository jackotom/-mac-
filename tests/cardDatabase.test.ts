import { describe, expect, it } from "vitest";
import { createCardDatabase, getCardInfo, listCardLibrary, toCardDetails } from "../src/shared/cardDatabase";

describe("card database details", () => {
  it("normalizes official metadata and resolves related cards", () => {
    const database = createCardDatabase([
      {
        id: 2001,
        name: "测试战吼随从",
        cardId: "TEST_MINION",
        mana_cost: 4,
        attack: 3,
        health: 5,
        type: 4,
        rarity_id: 4,
        text: "<b>战吼：</b><br>抽一张牌。",
        image: "https://example.test/minion.png",
        crop_image: "https://example.test/minion-crop.png",
        child_ids: [2002]
      },
      {
        id: 2002,
        name: "测试法术",
        cardId: "TEST_SPELL",
        mana_cost: 2,
        card_type_id: 5,
        rarity: "RARE",
        text: "造成 3 点伤害。"
      }
    ]);

    const card = getCardInfo(database, 2001);
    expect(card).toMatchObject({
      dbfId: 2001,
      manaCost: 4,
      attack: 3,
      health: 5,
      cardType: "随从",
      rarity: "EPIC",
      text: "战吼：\n抽一张牌。",
      imageUrl: "https://example.test/minion.png",
      cropImageUrl: "https://example.test/minion-crop.png",
      relatedCardIds: [2002]
    });

    expect(toCardDetails(database, card!)).toMatchObject({
      isSpell: false,
      relatedCards: [{ dbfId: 2002, name: "测试法术", cardId: "TEST_SPELL", rarity: "RARE" }]
    });
  });

  it("recognizes legacy spell type names", () => {
    const database = createCardDatabase([{ dbfId: 2003, id: "TEST_LEGACY_SPELL", name: "旧法术", type: "SPELL" }]);
    const card = getCardInfo(database, 2003);

    expect(toCardDetails(database, card!)).toMatchObject({ cardType: "法术", isSpell: true });
  });

  it("drops the known official crop placeholder so callers fall back to the full card image", () => {
    const database = createCardDatabase([
      {
        id: 2826,
        name: "奥蕾莉亚·风行者",
        image: "https://cards.example.test/alleria.png",
        crop_image: "https://hs.res.netease.com/pc/zt/20250225182549/static/img/8a60b28b4a9bb70748ce68815582bbde7a0c2ebfdf70988adb51da88c5d655fc.png"
      }
    ]);

    expect(getCardInfo(database, 2826)).toMatchObject({ imageUrl: "https://cards.example.test/alleria.png", cropImageUrl: undefined });
  });

  it("normalizes card classes from official and legacy metadata", () => {
    const database = createCardDatabase([
      { dbfId: 3001, cardId: "MAGE_CARD", name: "法师卡", playerClass: "mage", type: "SPELL" },
      { dbfId: 3002, cardId: "MULTI_CARD", name: "多职业卡", classes: ["ROGUE", "Shaman"], type: "MINION" },
      { dbfId: 3003, cardId: "NEUTRAL_CARD", name: "中立卡", card_class: "NEUTRAL", type: "MINION" }
    ]);

    expect(getCardInfo(database, 3001)).toMatchObject({ heroClass: "法师", heroClasses: ["法师"] });
    expect(getCardInfo(database, 3002)).toMatchObject({ heroClass: "盗贼 / 萨满祭司", heroClasses: ["盗贼", "萨满祭司"] });
    expect(getCardInfo(database, 3003)).toMatchObject({ heroClass: "中立", heroClasses: ["中立"] });
  });

  it("filters, sorts, and paginates full card details with bounded input", () => {
    const database = createCardDatabase([
      { dbfId: 4003, collectible: true, cardId: "MAGE_MINION", name: "寒冰学徒", playerClass: "MAGE", cost: 3, attack: 2, health: 4, type: "MINION", text: "战吼：冻结一个敌人。", image: "https://example.test/a.png" },
      { dbfId: 4001, collectible: 1, cardId: "MAGE_SPELL", name: "奥术飞弹", playerClass: "MAGE", cost: 1, type: "SPELL", text: "造成 3 点伤害。", image: "https://example.test/b.png" },
      { dbfId: 4002, collectible: true, cardId: "ROGUE_SPELL", name: "暗影步", playerClass: "ROGUE", cost: 0, type: "SPELL", text: "将一个友方随从移回手牌。" }
    ]);

    const firstPage = listCardLibrary(database, { heroClass: "mage", cardType: "spell", page: 0, pageSize: 1 });
    expect(firstPage).toMatchObject({ page: 1, pageSize: 1, total: 1, heroClasses: ["盗贼", "法师"], cardTypes: ["法术", "随从"] });
    expect(firstPage.items).toEqual([
      expect.objectContaining({ dbfId: 4001, name: "奥术飞弹", heroClass: "法师", cardType: "法术", isSpell: true, imageUrl: "https://example.test/b.png" })
    ]);

    const searched = listCardLibrary(database, { query: "敌人", page: 1, pageSize: 9999 });
    expect(searched).toMatchObject({ page: 1, pageSize: 100, total: 1 });
    expect(searched.items).toEqual([expect.objectContaining({ dbfId: 4003, attack: 2, health: 4, text: "战吼：冻结一个敌人。" })]);
  });

  it("omits internal placeholder cards from the browseable database", () => {
    const database = createCardDatabase([
      { dbfId: 5001, collectible: true, cardId: "REAL_CARD", name: "真实卡牌", type: "SPELL" },
      { dbfId: 5002, collectible: true, cardId: "PLACEHOLDER", name: "？ ？ ？", type: "SPELL" },
      { dbfId: 5003, collectible: true, cardId: "HERO_POWER", name: "英雄技能占位", type: "HERO_POWER" },
      { dbfId: 5004, collectible: false, cardId: "NON_COLLECTIBLE", name: "衍生卡", type: "SPELL" }
    ]);

    expect(listCardLibrary(database)).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ name: "真实卡牌" })]
    });
  });
});
