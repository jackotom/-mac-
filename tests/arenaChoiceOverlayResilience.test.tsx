import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArenaChoiceOverlayPanel } from "../src/renderer/components/ArenaChoiceOverlayPanel";
import type { ArenaState } from "../src/shared/types";

const styles = readFileSync(join(process.cwd(), "src/renderer/arenaChoiceOverlayStyles.css"), "utf8");

const choicesWithoutStatistics: ArenaState = {
  status: "drafting",
  hero: { name: "法师" },
  draftCount: 0,
  unresolvedCount: 30,
  currentChoices: [
    { name: "候选一", count: 1 },
    { name: "候选二", count: 1 },
    { name: "候选三", count: 1 }
  ],
  picks: [],
  deck: []
};

const choicesWithCachedStatistics: ArenaState = {
  ...choicesWithoutStatistics,
  ratingsVersion: 123,
  currentChoices: [
    { name: "候选一", count: 1, rating: { drawnImpact: -1.85, deckImpact: -1.75, pickRate: 41.2, highWinPickRate: 49.1, highWinThreshold: 6 } },
    { name: "候选二", count: 1, rating: { drawnImpact: 0, deckImpact: 0, pickRate: 37.5, highWinPickRate: 46.7, highWinThreshold: 6 } },
    { name: "候选三", count: 1, rating: { drawnImpact: 1.2, deckImpact: 2.3, pickRate: 29.8, highWinPickRate: 40.3, highWinThreshold: 6 } }
  ]
};

describe("Arena choice overlay resilience", () => {
  it("shows explicit placeholders instead of a blank overlay when no statistics are available", () => {
    render(<ArenaChoiceOverlayPanel arena={choicesWithoutStatistics} />);

    const overlay = screen.getByLabelText("竞技场选牌数据条");
    expect(overlay).toHaveAttribute("data-visible", "true");
    expect(within(overlay).getAllByRole("group", { name: /候选[一二三] 的竞技场指标/ })).toHaveLength(3);
    expect(within(overlay).getAllByText("暂无")).toHaveLength(12);
  });

  it("keeps cached statistics visible through a temporary refresh error", () => {
    const { rerender } = render(<ArenaChoiceOverlayPanel arena={choicesWithCachedStatistics} />);

    rerender(
      <ArenaChoiceOverlayPanel
        arena={{
          ...choicesWithCachedStatistics,
          error: "网络暂时不可用，正在恢复"
        }}
      />
    );

    const overlay = screen.getByLabelText("竞技场选牌数据条");
    expect(overlay).toHaveAttribute("data-visible", "true");
    ["-1.85", "-1.75", "0.00", "2.30", "41.2%", "37.5%", "29.8%", "49.1%", "46.7%", "40.3%"].forEach((value) => {
      expect(within(overlay).getAllByText(value).length).toBeGreaterThan(0);
    });
  });

  it("makes the shell and every rendered data layer explicitly click-through", () => {
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell\s*\{[\s\S]*?pointer-events:\s*none;/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-card\s*\{[\s\S]*?pointer-events:\s*none;/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell \.arena-choice-overlay-metrics\s*\{[\s\S]*?pointer-events:\s*none;/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell \.arena-choice-overlay-metric\s*\{[\s\S]*?pointer-events:\s*none;/
    );
  });
});
