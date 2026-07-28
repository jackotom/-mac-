import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeckPanel } from "../src/renderer/components/DeckPanel";

describe("DeckPanel data integrity", () => {
  it("shows how many remaining cards are missing from the visible rows", () => {
    render(
      <DeckPanel
        summary={{ deckName: "测试套牌", totalCards: 3, remainingCards: 3 }}
        cards={[
          {
            id: "known-card",
            name: "已识别牌",
            cardType: "卡牌",
            drawn: 0,
            copiesRemaining: 1,
            copiesTotal: 1
          }
        ]}
      />
    );

    expect(screen.getByRole("status", { name: "牌库明细不完整" })).toHaveTextContent(
      "还有 2 张未识别或未显示"
    );
  });

  it("clamps a remaining-card meter above the original deck size to 100 percent", () => {
    const { container } = render(
      <DeckPanel
        summary={{ deckName: "测试套牌", totalCards: 30, remainingCards: 31 }}
        cards={[]}
      />
    );

    expect(container.querySelector<HTMLElement>(".meter > span")).toHaveStyle({ width: "100%" });
  });
});
