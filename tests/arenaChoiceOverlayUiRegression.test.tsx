import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArenaChoiceOverlayPanel } from "../src/renderer/components/ArenaChoiceOverlayPanel";
import type { ArenaState } from "../src/shared/types";

const styles = readFileSync(join(process.cwd(), "src/renderer/arenaChoiceOverlayStyles.css"), "utf8");

const scorelessArena: ArenaState = {
  status: "drafting",
  hero: { name: "法师" },
  draftCount: 0,
  unresolvedCount: 30,
  currentChoices: [
    { name: "候选一", count: 1, rating: { pickRate: 41.2, firestone: { includedWinrate: 56.8 } } },
    { name: "候选二", count: 1, rating: { pickRate: 37.5, firestone: { includedWinrate: 54.1 } } },
    { name: "候选三", count: 1, rating: { pickRate: 29.8, firestone: { includedWinrate: 51.6 } } }
  ],
  picks: [],
  deck: []
};

describe("Arena choice overlay UI regression", () => {
  it("replaces all score placeholders when live ratings arrive", () => {
    const { rerender } = render(<ArenaChoiceOverlayPanel arena={scorelessArena} />);

    screen.getAllByRole("group", { name: "评分" }).forEach((group) => {
      expect(within(group).getByText("暂无")).toBeInTheDocument();
    });

    rerender(
      <ArenaChoiceOverlayPanel
        arena={{
          ...scorelessArena,
          currentChoices: scorelessArena.currentChoices.map((choice, index) => ({
            ...choice,
            score: [88, 91, 77][index],
            rating: {
              ...choice.rating,
              hearthArena: [88, 91, 77][index]
            }
          }))
        }}
      />
    );

    const scoreGroups = screen.getAllByRole("group", { name: "评分" });
    expect(scoreGroups).toHaveLength(3);
    expect(scoreGroups.map((group) => group.textContent)).toEqual(["评分88", "评分91", "评分77"]);
    scoreGroups.forEach((group) => expect(within(group).queryByText("暂无")).not.toBeInTheDocument());
  });

  it("keeps three metric bars readable, non-blocking, and width constrained", () => {
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*?gap:\s*6\.5%;[\s\S]*?pointer-events:\s*none;[\s\S]*?background:\s*transparent;/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-card\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?justify-content:\s*center;/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell \.arena-choice-overlay-metrics\s*\{[\s\S]*?width:\s*min\(100%,\s*236px\);[\s\S]*?min-width:\s*0;[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell \.arena-choice-metric > strong\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    );

    const metricColors = Array.from(
      styles.matchAll(
        /\.arena-choice-overlay-shell \.arena-choice-metric:nth-child\([123]\)\s*\{[^}]*?color:\s*(#[0-9a-f]{6});/gi
      ),
      (match) => match[1]
    );
    expect(metricColors).toHaveLength(3);
    expect(new Set(metricColors).size).toBe(3);
  });
});
