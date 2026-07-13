import { describe, expect, it } from "vitest";
import { createCardDatabase } from "../src/shared/cardDatabase";
import { SecretTracker } from "../src/shared/secretTracker";

const database = createCardDatabase([
  { id: 1, cardId: "EX1_287", name: "法术反制", collectible: true, type: "SPELL", playerClass: "MAGE", mechanics: ["SECRET"] },
  { id: 2, cardId: "UNKNOWN_SECRET", name: "未知规则奥秘", collectible: true, type: "SPELL", playerClass: "MAGE", mechanics: ["SECRET"] },
  { id: 3, cardId: "PAL_SECRET", name: "圣骑士奥秘", collectible: true, type: "SPELL", playerClass: "PALADIN", mechanics: ["SECRET"] }
  ,{ id: 4, cardId: "DMF_236", name: "古神在上", collectible: true, type: "SPELL", playerClass: "PALADIN", mechanics: ["SECRET"] }
  ,{ id: 5, cardId: "EX1_294", name: "镜像实体", collectible: true, type: "SPELL", playerClass: "MAGE", mechanics: ["SECRET"] }
  ,{ id: 6, cardId: "LOOT_101", name: "爆炸符文", collectible: true, type: "SPELL", playerClass: "MAGE", mechanics: ["SECRET"] }
  ,{ id: 7, cardId: "REV_828", name: "异议", collectible: true, type: "SPELL", playerClass: "MAGE", mechanics: ["SECRET"] }
]);

describe("SecretTracker", () => {
  it("keeps independent slots and conservatively filters candidates by class", () => {
    const tracker = new SecretTracker(database);
    tracker.setOpponentClass("法师");
    tracker.enterSecret("10");
    tracker.enterSecret("11");

    expect(tracker.getSlots()).toHaveLength(2);
    expect(tracker.getSlots()[0].candidates.map((candidate) => candidate.cardId)).toEqual(expect.arrayContaining(["EX1_287", "UNKNOWN_SECRET"]));
  });

  it("only excludes a supported secret after a matching action completes without a trigger", () => {
    const tracker = new SecretTracker(database);
    tracker.setOpponentClass("法师");
    tracker.enterSecret("10");
    tracker.beginAction("friendly-spell");
    tracker.endAction();

    expect(tracker.getSlots()[0].candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: "EX1_287", status: "excluded" }),
      expect.objectContaining({ cardId: "UNKNOWN_SECRET", status: "possible" })
    ]));
  });

  it("reveals and removes the matching entity and resets all slots", () => {
    const tracker = new SecretTracker(database);
    tracker.enterSecret("10");
    tracker.revealSecret("10", "EX1_287");
    expect(tracker.getSlots()[0]).toMatchObject({ revealedCardId: "EX1_287" });
    tracker.leaveSecret("10");
    expect(tracker.getSlots()).toEqual([]);
    tracker.enterSecret("11");
    tracker.reset();
    expect(tracker.getSlots()).toEqual([]);
  });

  it("rebuilds existing slot candidates when the opponent class becomes known", () => {
    const tracker = new SecretTracker(database);
    tracker.enterSecret("10");
    expect(tracker.getSlots()[0].candidates.some((candidate) => candidate.cardId === "PAL_SECRET")).toBe(true);
    tracker.setOpponentClass("法师");
    expect(tracker.getSlots()[0].candidates.some((candidate) => candidate.cardId === "PAL_SECRET")).toBe(false);
  });

  it("excludes only supported spell-trigger secrets after a friendly spell", () => {
    const tracker = new SecretTracker(database);
    tracker.enterSecret("10");
    tracker.beginAction("friendly-spell");
    tracker.endAction();
    const excluded = tracker.getSlots()[0].candidates.filter((candidate) => candidate.status === "excluded").map((candidate) => candidate.cardId);
    expect(excluded).toEqual(expect.arrayContaining(["EX1_287", "DMF_236"]));
    expect(excluded).not.toContain("UNKNOWN_SECRET");
  });

  it("excludes only supported minion-trigger secrets after a friendly minion", () => {
    const tracker = new SecretTracker(database);
    tracker.enterSecret("10");
    tracker.beginAction("friendly-minion");
    tracker.endAction();
    const excluded = tracker.getSlots()[0].candidates.filter((candidate) => candidate.status === "excluded").map((candidate) => candidate.cardId);
    expect(excluded).toEqual(expect.arrayContaining(["EX1_294", "LOOT_101", "REV_828"]));
    expect(excluded).not.toContain("UNKNOWN_SECRET");
  });
});
