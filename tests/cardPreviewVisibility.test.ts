import { describe, expect, it } from "vitest";
import { CardPreviewVisibilityGate } from "../src/main/cardPreviewVisibility";

describe("card preview visibility gate", () => {
  it("allows a fresh hover only while Hearthstone is frontmost", () => {
    const gate = new CardPreviewVisibilityGate();

    const hearthstoneHover = gate.beginHover();
    const finderHover = gate.beginHover();

    expect(gate.canShow(hearthstoneHover, "Hearthstone")).toBe(false);
    expect(gate.canShow(finderHover, "Finder")).toBe(false);
    const freshHover = gate.beginHover();
    expect(gate.canShow(freshHover, "Hearthstone")).toBe(true);
  });

  it("invalidates the current hover when another app becomes frontmost", () => {
    const gate = new CardPreviewVisibilityGate();
    const hover = gate.beginHover();

    expect(gate.refresh("Finder")).toBe(true);
    expect(gate.canShow(hover, "Hearthstone")).toBe(false);
    expect(gate.refresh("Hearthstone")).toBe(false);
  });

  it("allows the same card to show again after a new hover", () => {
    const gate = new CardPreviewVisibilityGate();
    const firstHover = gate.beginHover();
    gate.refresh("ChatGPT");

    const secondHover = gate.beginHover();

    expect(gate.canShow(firstHover, "Hearthstone")).toBe(false);
    expect(gate.canShow(secondHover, "Hearthstone")).toBe(true);
  });

  it("keeps a fresh hover valid when the tracker overlay itself is frontmost", () => {
    const gate = new CardPreviewVisibilityGate();
    const hover = gate.beginHover();

    expect(gate.canShow(hover, "炉石记牌器")).toBe(true);
    expect(gate.refresh("炉石记牌器")).toBe(false);
    expect(gate.canShow(hover, "炉石记牌器")).toBe(true);
  });

  it("does not let a stale rejected hover invalidate the newer hover", () => {
    const gate = new CardPreviewVisibilityGate();
    const staleHover = gate.beginHover();
    const freshHover = gate.beginHover();

    expect(gate.invalidateIfCurrent(staleHover)).toBe(false);
    expect(gate.canShow(freshHover, "Hearthstone")).toBe(true);
  });
});
