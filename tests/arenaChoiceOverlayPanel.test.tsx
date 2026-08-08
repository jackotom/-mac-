import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArenaChoiceOverlayPanel } from "../src/renderer/components/ArenaChoiceOverlayPanel";
import type { ArenaState } from "../src/shared/types";

const draftingArena: ArenaState = {
  status: "drafting",
  hero: { name: "德鲁伊" },
  draftCount: 7,
  unresolvedCount: 30,
  currentChoices: [
    { name: "候选一", count: 1, rating: { drawnImpact: -1.85, deckImpact: -1.75, pickRate: 16.8, highWinPickRate: 10.2, highWinThreshold: 6 } },
    { name: "候选二", count: 1, rating: { drawnImpact: -1.85, deckImpact: -1.75, pickRate: 16.8, highWinPickRate: 10.2, highWinThreshold: 6 } },
    { name: "候选三", count: 1, rating: { drawnImpact: -1.85, deckImpact: -1.75, pickRate: 16.8, highWinPickRate: 10.2, highWinThreshold: 6 } }
  ],
  picks: [],
  deck: []
};

describe("ArenaChoiceOverlayPanel", () => {
  it("shows one fixed four-metric group under each of the three live choices", () => {
    render(<ArenaChoiceOverlayPanel arena={draftingArena} />);

    const overlay = screen.getByLabelText("竞技场选牌数据条");
    expect(overlay).toHaveAttribute("data-visible", "true");
    expect(within(overlay).getAllByRole("group", { name: /候选[一二三] 的竞技场指标/ })).toHaveLength(3);
    const drawnImpactGroups = within(overlay).getAllByRole("group", { name: "抽到影响" });
    const deckImpactGroups = within(overlay).getAllByRole("group", { name: "对套牌影响" });
    expect(drawnImpactGroups).toHaveLength(3);
    expect(deckImpactGroups).toHaveLength(3);
    drawnImpactGroups.forEach((group) => expect(group).toHaveClass("is-negative"));
    deckImpactGroups.forEach((group) => expect(group).toHaveClass("is-negative"));
    expect(within(overlay).getAllByRole("group", { name: "选取率" })).toHaveLength(3);
    expect(within(overlay).getAllByRole("group", { name: "6+胜选取率" })).toHaveLength(3);
    ["-1.85", "-1.75", "16.8%", "10.2%"].forEach((value) => {
      expect(within(overlay).getAllByText(value)).toHaveLength(3);
    });
  });

  it("always uses the high-win pick-rate label and never renders a 12-win metric", () => {
    render(
      <ArenaChoiceOverlayPanel
        arena={{
          ...draftingArena,
          currentChoices: [
            { name: "候选一", count: 1, rating: { drawnImpact: 1.25, deckImpact: 0, pickRate: 42, highWinPickRate: 18, highWinThreshold: 6, twelveWinRate: 18 } },
            { name: "候选二", count: 1, rating: { drawnImpact: 1.25, deckImpact: 0, pickRate: 40, highWinPickRate: 22, highWinThreshold: 6, twelveWinRate: 22 } },
            { name: "候选三", count: 1, rating: { drawnImpact: 1.25, deckImpact: 0, pickRate: 38, highWinPickRate: 20, highWinThreshold: 6, twelveWinRate: 20 } }
          ]
        }}
      />
    );

    const overlay = screen.getByLabelText("竞技场选牌数据条");
    expect(within(overlay).getAllByRole("group", { name: "6+胜选取率" })).toHaveLength(3);
    expect(within(overlay).queryByRole("group", { name: "12胜率" })).not.toBeInTheDocument();
  });

  it("removes the scoreless Firestone special case", () => {
    render(
      <ArenaChoiceOverlayPanel
        arena={{
          ...draftingArena,
          currentChoices: [
            {
              name: "JAIL_851",
              cardId: "JAIL_851",
              count: 1,
              rating: { pickRate: 32.1, firestone: { includedWinrate: 58.4 } }
            },
            {
              name: "TIME_064",
              cardId: "TIME_064",
              count: 1,
              rating: { pickRate: 29.7, firestone: { includedWinrate: 55.2 } }
            },
            {
              name: "TIME_EVENT_998",
              cardId: "TIME_EVENT_998",
              count: 1,
              rating: { pickRate: 18.6, firestone: { includedWinrate: 52.9 } }
            }
          ]
        }}
      />
    );

    const overlay = screen.getByLabelText("竞技场选牌数据条");
    expect(within(overlay).getAllByRole("group", { name: /的竞技场指标/ })).toHaveLength(3);
    expect(within(overlay).getAllByRole("group", { name: "抽到影响" })).toHaveLength(3);
    expect(within(overlay).getAllByRole("group", { name: "对套牌影响" })).toHaveLength(3);
    expect(within(overlay).getAllByRole("group", { name: "选取率" })).toHaveLength(3);
    expect(within(overlay).getAllByRole("group", { name: "高胜选取率" })).toHaveLength(3);
    expect(within(overlay).queryByRole("group", { name: "评分" })).not.toBeInTheDocument();
    expect(within(overlay).queryByRole("group", { name: "入选胜率" })).not.toBeInTheDocument();
  });

  it("stays hidden outside the draft selection screen", () => {
    render(<ArenaChoiceOverlayPanel arena={{ ...draftingArena, status: "playing" }} />);

    expect(screen.getByLabelText("竞技场选牌数据条")).toHaveAttribute("data-visible", "false");
  });

  it("keeps recognized cards in their lanes and marks the missing lane as recognizing", () => {
    render(
      <ArenaChoiceOverlayPanel
        arena={{
          ...draftingArena,
          currentChoices: [
            { name: "候选一", count: 1, screenSlot: 0, score: 94 },
            { name: "候选三", count: 1, screenSlot: 2, score: 108 }
          ]
        }}
      />
    );

    const overlay = screen.getByLabelText("竞技场选牌数据条");
    expect(overlay).toHaveAttribute("data-visible", "true");
    expect(within(overlay).getByText("识别中")).toBeInTheDocument();
    expect(within(overlay).getAllByRole("article")).toHaveLength(3);
  });
});
