import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArenaChoiceMetrics } from "../src/renderer/components/ArenaChoiceMetrics";

describe("ArenaChoiceMetrics", () => {
  it("labels Firestone draft buckets as high-win pick rate instead of 12-win rate", () => {
    render(
      <ArenaChoiceMetrics
        choice={{
          name: "测试卡",
          score: 100,
          rating: {
            hearthArena: 100,
            pickRate: 42,
            highWinPickRate: 51,
            highWinThreshold: 4
          }
        }}
      />
    );

    expect(screen.getByRole("group", { name: "4+胜选取" })).toHaveTextContent("51.0%");
    expect(screen.queryByRole("group", { name: "12胜率" })).not.toBeInTheDocument();
  });

  it("keeps ordinary winrate separate from missing high-win data", () => {
    render(
      <ArenaChoiceMetrics
        choice={{
          name: "测试卡",
          score: 100,
          rating: {
            hearthArena: 100,
            firestone: { includedWinrate: 55 }
          }
        }}
      />
    );

    expect(screen.getByRole("group", { name: "胜率" })).toHaveTextContent("55.0%");
    expect(screen.getByRole("group", { name: "高胜数据" })).toHaveTextContent("暂无");
    expect(screen.queryByRole("group", { name: "12胜率" })).not.toBeInTheDocument();
  });
});
