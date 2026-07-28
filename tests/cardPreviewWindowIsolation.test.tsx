import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDetails } from "../src/shared/cardDatabase";

const details: CardDetails = {
  dbfId: 106652,
  cardId: "TOY_886",
  name: "决胜时刻",
  manaCost: 2,
  cardType: "法术",
  text: "复活上一个死亡的你的恶魔。",
  isSpell: true,
  relatedCards: []
};

afterEach(() => {
  window.history.replaceState({}, "", "/");
  delete window.hearthstoneTracker;
});

describe("card preview window isolation", () => {
  it("does not inject the full main-window stylesheet into the compact preview document", async () => {
    let updatePreview!: (details: CardDetails) => void;
    window.history.replaceState({}, "", "/?card-preview=1");
    window.hearthstoneTracker = {
      onCardPreviewUpdate: vi.fn((callback: (details: CardDetails) => void) => {
        updatePreview = callback;
        return () => undefined;
      }),
      onCardPreviewPinnedChange: vi.fn(() => () => undefined)
    } as unknown as typeof window.hearthstoneTracker;
    const { default: App } = await import("../src/renderer/App.js");

    render(<App />);
    act(() => updatePreview(details));

    expect(await screen.findByLabelText("卡牌说明：决胜时刻")).toBeInTheDocument();
    expect(Array.from(document.querySelectorAll("style")).some((style) =>
      style.textContent?.includes(".app-shell")
    )).toBe(false);
  });
});
