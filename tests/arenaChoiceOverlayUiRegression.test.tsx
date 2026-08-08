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
  it("replaces all four metric placeholders when live ratings arrive", () => {
    const { rerender } = render(<ArenaChoiceOverlayPanel arena={scorelessArena} />);

    screen.getAllByRole("group", { name: "抽到影响" }).forEach((group) => {
      expect(within(group).getByText("暂无")).toBeInTheDocument();
    });

    rerender(
      <ArenaChoiceOverlayPanel
        arena={{
          ...scorelessArena,
          currentChoices: scorelessArena.currentChoices.map((choice, index) => ({
            ...choice,
            rating: {
              ...choice.rating,
              drawnImpact: [-1.85, 0, 2.4][index],
              deckImpact: [-1.75, 0, 2.1][index],
              highWinPickRate: [10.2, 11.8, 13.4][index],
              highWinThreshold: 6
            }
          }))
        }}
      />
    );

    const drawnImpactGroups = screen.getAllByRole("group", { name: "抽到影响" });
    expect(drawnImpactGroups).toHaveLength(3);
    expect(drawnImpactGroups.map((group) => group.textContent)).toEqual(["抽到影响-1.85", "抽到影响0.00", "抽到影响2.40"]);
    expect(screen.getAllByRole("group", { name: "对套牌影响" }).map((group) => group.textContent)).toEqual(["对套牌影响-1.75", "对套牌影响0.00", "对套牌影响2.10"]);
    expect(screen.getAllByRole("group", { name: "6+胜选取率" }).map((group) => group.textContent)).toEqual(["6+胜选取率10.2%", "6+胜选取率11.8%", "6+胜选取率13.4%"]);
  });

  it("keeps four metric bars compact, non-blocking, and width constrained", () => {
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[\s\S]*?gap:\s*6\.5%;[\s\S]*?pointer-events:\s*none;[\s\S]*?background:\s*transparent;/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-card\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?justify-content:\s*center;/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell \.arena-choice-overlay-metrics\s*\{[\s\S]*?width:\s*min\(100%,\s*236px\);[\s\S]*?min-width:\s*0;[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell \.arena-choice-overlay-metric > strong\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    );

    expect(styles).toMatch(
      /\.arena-choice-overlay-shell \.arena-choice-overlay-metrics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?pointer-events:\s*none;/
    );
    expect(styles).toMatch(
      /\.arena-choice-overlay-shell \.arena-choice-overlay-metric\s*\{[\s\S]*?min-height:\s*24px;[\s\S]*?padding:\s*2px\s+4px;[\s\S]*?font-variant-numeric:\s*tabular-nums;/
    );
    expect(styles).toMatch(/\.arena-choice-overlay-metric\.is-positive\s*\{[^}]*?color:\s*#[0-9a-f]{6};/i);
    expect(styles).toMatch(/\.arena-choice-overlay-metric\.is-negative\s*\{[^}]*?color:\s*#[0-9a-f]{6};/i);
    expect(styles).toMatch(/\.arena-choice-overlay-metric\.is-neutral\s*\{[^}]*?color:\s*#[0-9a-f]{6};/i);
    expect(styles).not.toMatch(/@media \(max-width: 760px\)[\s\S]*?\.arena-choice-overlay-shell \.arena-choice-overlay-metric > strong\s*\{[\s\S]*?font-size:\s*13px;/);
  });

  it("isolates overlay metric classes from the main Arena panel cascade", () => {
    const { container } = render(<ArenaChoiceOverlayPanel arena={scorelessArena} />);

    expect(container.querySelector(".arena-choice-metrics")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".arena-choice-overlay-metric")).toHaveLength(12);
  });
});
