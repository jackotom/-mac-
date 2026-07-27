import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArenaHeroWinRateRankingPanel } from "../src/renderer/components/ArenaHeroWinRateRankingPanel";

describe("arena hero win-rate ranking panel", () => {
  it("renders trusted ranking rows and closes through the supplied action", () => {
    const onClose = vi.fn();
    render(
      <ArenaHeroWinRateRankingPanel
        result={{
          status: "ok",
          source: "公开统计",
          updatedAt: "2026-07-23T08:00:00.000Z",
          entries: [
            { rank: 1, heroName: "死亡骑士", heroClass: "Death Knight", winRate: 55.84, games: 42860 },
            { rank: 2, heroName: "法师", heroClass: "Mage", winRate: 52.1, games: 9100 }
          ]
        }}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("region", { name: "竞技场英雄胜率排行" })).toBeInTheDocument();
    expect(screen.getByText("死亡骑士")).toBeInTheDocument();
    expect(screen.getByText("55.8%")).toBeInTheDocument();
    expect(screen.getByText("4.3万 场")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭竞技场英雄胜率排行" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows explicit unavailable and loading states", () => {
    const view = render(<ArenaHeroWinRateRankingPanel isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取排行");

    view.rerender(<ArenaHeroWinRateRankingPanel result={{ status: "unavailable", message: "当前版本暂无排行" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("当前版本暂无排行");
  });

  it("keeps ranks, hero names, and win rates in narrow layouts", () => {
    const styles = fs.readFileSync(
      path.resolve(process.cwd(), "src/renderer/arenaHeroRankingStyles.css"),
      "utf8"
    );

    expect(styles).toMatch(
      /@media \(max-width: 190px\)[\s\S]*?\.arena-hero-ranking__list li\s*\{[\s\S]*?grid-template-columns:\s*18px minmax\(0,\s*1fr\) 40px;[\s\S]*?min-height:\s*29px;/
    );
    expect(styles).toMatch(
      /@media \(max-width: 190px\)[\s\S]*?\.arena-hero-ranking__icon,[\s\S]*?\.arena-hero-ranking__hero small\s*\{\s*display:\s*none;/
    );
    expect(styles).toMatch(
      /@media \(max-width: 230px\)[\s\S]*?\.arena-hero-ranking__sample\s*\{\s*display:\s*none;/
    );
    expect(styles).toMatch(
      /@media \(max-width: 190px\)[\s\S]*?\.arena-hero-ranking__rank\s*\{[\s\S]*?width:\s*17px;[\s\S]*?height:\s*17px;/
    );
    expect(styles).toMatch(
      /@media \(max-height: 230px\)[\s\S]*?\.arena-hero-ranking__header\s*\{[\s\S]*?min-height:\s*34px;[\s\S]*?\.arena-hero-ranking__list li\s*\{[\s\S]*?min-height:\s*29px;/
    );
  });

  it("fits the ranking into the 100px-wide default without losing rank, win rate, or close action", () => {
    const styles = fs.readFileSync(
      path.resolve(process.cwd(), "src/renderer/arenaHeroRankingStyles.css"),
      "utf8"
    );

    expect(styles).toMatch(
      /@media \(max-width: 120px\)[\s\S]*?\.arena-hero-ranking__list li\s*\{[\s\S]*?grid-template-columns:\s*15px minmax\(0,\s*1fr\) 34px;[\s\S]*?overflow:\s*hidden;/
    );
    expect(styles).toMatch(
      /@media \(max-width: 120px\)[\s\S]*?\.arena-hero-ranking__header h1\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(styles).toMatch(
      /@media \(max-width: 120px\)[\s\S]*?\.arena-hero-ranking__header button\s*\{[\s\S]*?width:\s*22px;[\s\S]*?height:\s*22px;/
    );
    expect(styles).toMatch(
      /\.arena-hero-ranking__list\s*\{[\s\S]*?overflow-x:\s*hidden;/
    );
  });
});
