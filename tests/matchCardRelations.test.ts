import { describe, expect, it } from "vitest";
import { resolveMatchCardRelations, type MatchCardHistory } from "../src/shared/matchCardRelations";
import type { CardInfo } from "../src/shared/cardDatabase";

const emptyHistory: MatchCardHistory = {
  friendlyUsed: [],
  opponentUsed: [],
  friendlyDeadMinions: [],
  opponentDeadMinions: []
};

function card(
  dbfId: number,
  cardId: string,
  name: string,
  cardType: string,
  overrides: Partial<CardInfo> = {}
): CardInfo {
  return { dbfId, cardId, name, cardType, ...overrides };
}

describe("match card relations", () => {
  it("shows every friendly Deathrattle card used for Return Policy, including weapons", () => {
    const returnPolicy = card(1, "MIS_102", "退货政策", "法术", {
      text: "发现一张你在本局对战中使用过的友方亡语牌。触发其亡语。"
    });
    const weapon = card(2, "TIME_444", "迷时战刃", "武器", { mechanics: ["DEATHRATTLE"] });
    const minion = card(3, "MINION_DR", "亡语随从", "随从", { mechanics: ["DEATHRATTLE"] });
    const normal = card(4, "NORMAL", "普通随从", "随从");

    const sections = resolveMatchCardRelations(returnPolicy, {
      ...emptyHistory,
      friendlyUsed: [weapon, minion, normal]
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].cards.map((candidate) => candidate.cardId)).toEqual(["TIME_444", "MINION_DR"]);
  });

  it("does not mistake the spell that caused a death for the dead-card type", () => {
    const coldMemories = card(1, "PVPDR_Sai_T3", "冰冷回忆", "法术", {
      text: "复活在本局对战中你的冰霜法术消灭的随从。"
    });
    const deadMinion = card(2, "DEAD_MINION", "死亡随从", "随从");

    const sections = resolveMatchCardRelations(coldMemories, {
      ...emptyHistory,
      friendlyDeadMinions: [deadMinion]
    });

    expect(sections[0].cards.map((candidate) => candidate.cardId)).toEqual(["DEAD_MINION"]);
  });

  it("keeps only the highest-cost matching dead Undead", () => {
    const spell = card(1, "TIME_616", "悼念成真", "法术", {
      text: "召唤在本局对战中死亡的法力值消耗最高的友方亡灵。"
    });
    const lowUndead = card(2, "UNDEAD_3", "低费亡灵", "随从", { manaCost: 3, races: ["UNDEAD"] });
    const highUndead = card(3, "UNDEAD_5", "高费亡灵", "随从", { manaCost: 5, races: ["UNDEAD"] });
    const highBeast = card(4, "BEAST_8", "高费野兽", "随从", { manaCost: 8, races: ["BEAST"] });

    const sections = resolveMatchCardRelations(spell, {
      ...emptyHistory,
      friendlyDeadMinions: [lowUndead, highUndead, highBeast]
    });

    expect(sections[0].cards.map((candidate) => candidate.cardId)).toEqual(["UNDEAD_5"]);
  });

  it("uses only known opponent cards for opponent-history effects", () => {
    const mixtape = card(1, "ETC_074", "串烧磁带", "法术", {
      text: "发现一张你的对手在本局对战中使用过的牌的复制。"
    });
    const friendly = card(2, "FRIENDLY", "我方卡牌", "随从");
    const opponent = card(3, "OPPONENT", "对手卡牌", "法术");

    const sections = resolveMatchCardRelations(mixtape, {
      ...emptyHistory,
      friendlyUsed: [friendly],
      opponentUsed: [opponent]
    });

    expect(sections[0].cards.map((candidate) => candidate.cardId)).toEqual(["OPPONENT"]);
  });
});
