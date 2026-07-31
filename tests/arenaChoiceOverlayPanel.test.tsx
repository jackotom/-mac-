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
    { name: "候选一", count: 1, score: 94, rating: { hearthArena: 94, pickRate: 42, highWinPickRate: 51, highWinThreshold: 6 } },
    { name: "候选二", count: 1, score: 121, rating: { hearthArena: 121, pickRate: 40, highWinPickRate: 49, highWinThreshold: 6 } },
    { name: "候选三", count: 1, score: 108, rating: { hearthArena: 108, pickRate: 38, highWinPickRate: 45, highWinThreshold: 6 } }
  ],
  picks: [],
  deck: []
};

describe("ArenaChoiceOverlayPanel", () => {
  it("shows one three-metric group under each of the three live choices", () => {
    render(<ArenaChoiceOverlayPanel arena={draftingArena} />);

    const overlay = screen.getByLabelText("竞技场选牌数据条");
    expect(overlay).toHaveAttribute("data-visible", "true");
    expect(within(overlay).getAllByRole("group", { name: /候选[一二三] 的竞技场指标/ })).toHaveLength(3);
    expect(within(overlay).getAllByRole("group", { name: "评分" })).toHaveLength(3);
    expect(within(overlay).getAllByRole("group", { name: "选取率" })).toHaveLength(3);
    expect(within(overlay).getAllByRole("group", { name: "6+胜选取" })).toHaveLength(3);
  });

  it("uses the 12-win label only when a real 12-win bucket exists", () => {
    render(
      <ArenaChoiceOverlayPanel
        arena={{
          ...draftingArena,
          currentChoices: [
            { name: "候选一", count: 1, score: 94, rating: { hearthArena: 94, pickRate: 42, twelveWinRate: 18 } },
            { name: "候选二", count: 1, score: 121, rating: { hearthArena: 121, pickRate: 40, twelveWinRate: 22 } },
            { name: "候选三", count: 1, score: 108, rating: { hearthArena: 108, pickRate: 38, twelveWinRate: 20 } }
          ]
        }}
      />
    );

    const overlay = screen.getByLabelText("竞技场选牌数据条");
    expect(within(overlay).getAllByRole("group", { name: "12胜率" })).toHaveLength(3);
  });

  it("shows Firestone rates for all three scoreless legendary-team choices", () => {
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
    const scoreGroups = within(overlay).getAllByRole("group", { name: "评分" });
    expect(scoreGroups).toHaveLength(3);
    scoreGroups.forEach((group) => expect(within(group).getByText("暂无")).toBeInTheDocument());
    expect(within(overlay).getAllByRole("group", { name: "选取率" })).toHaveLength(3);
    const includedWinrateGroups = within(overlay).getAllByRole("group", { name: "入选胜率" });
    expect(includedWinrateGroups).toHaveLength(3);
    expect(within(includedWinrateGroups[0]).getByText("58.4%")).toBeInTheDocument();
    expect(within(includedWinrateGroups[1]).getByText("55.2%")).toBeInTheDocument();
    expect(within(includedWinrateGroups[2]).getByText("52.9%")).toBeInTheDocument();
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
