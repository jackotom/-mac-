import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArenaPanel } from "../src/renderer/components/ArenaPanel";
import type { ArenaCardChoice, ArenaState } from "../src/shared/types";

interface ArenaChoiceMetricRates {
  readonly pickRate?: number;
  readonly highWinPickRate?: number;
  readonly highWinThreshold?: number;
  readonly twelveWinRate?: number;
}

type ArenaChoiceWithMetricRates = ArenaCardChoice & {
  readonly rating?: NonNullable<ArenaCardChoice["rating"]> & ArenaChoiceMetricRates;
};

type ArenaStateWithMetricRates = Omit<ArenaState, "currentChoices"> & {
  readonly currentChoices: readonly ArenaChoiceWithMetricRates[];
};

const state = {
  status: "drafting",
  hero: { name: "猎人", className: "Hunter" },
  draftCount: 7,
  scoreSource: "Arena Tracker / HearthArena + Firestone",
  currentChoices: [
    {
      name: "高数据候选",
      count: 1,
      cardId: "TEST_001",
      score: 126,
      quality: { tier: "a", label: "优秀" },
      rating: { hearthArena: 126, pickRate: 37.2, highWinPickRate: 45.4, highWinThreshold: 6 }
    },
    {
      name: "暂无数据候选",
      count: 1,
      cardId: "TEST_002",
      quality: { tier: "unknown", label: "暂无评分" }
    }
  ],
  picks: [],
  deck: []
} satisfies ArenaStateWithMetricRates;

function metricsFor(cardName: string) {
  const cardNameElement = screen.getByLabelText(cardName);
  const candidate = cardNameElement.closest("li");
  if (!candidate) {
    throw new Error(`找不到候选牌 ${cardName} 的容器`);
  }
  return within(candidate).getByRole("group", { name: `${cardName} 的竞技场指标` });
}

function expectMetric(metrics: HTMLElement, label: "评分" | "选取率" | "胜率" | "12胜率" | "高胜数据" | `${number}+胜选取`, value: string) {
  const metric = within(metrics).getByRole("group", { name: label });
  expect(metric).toHaveTextContent(label);
  expect(metric).toHaveTextContent(value);
}

describe("ArenaPanel", () => {
  it("renders score, pick rate, and high-win pick rate below every live draft choice", () => {
    render(<ArenaPanel state={state} />);

    const populatedMetrics = metricsFor("高数据候选");
    expectMetric(populatedMetrics, "评分", "126");
    expectMetric(populatedMetrics, "选取率", "37.2%");
    expectMetric(populatedMetrics, "6+胜选取", "45.4%");

    const unavailableMetrics = metricsFor("暂无数据候选");
    expectMetric(unavailableMetrics, "评分", "暂无");
    expectMetric(unavailableMetrics, "选取率", "暂无");
    expectMetric(unavailableMetrics, "高胜数据", "暂无");
  });

  it("shows a real win rate when the source does not publish a pick rate", () => {
    render(<ArenaPanel state={{
      ...state,
      currentChoices: [{
        name: "仅有胜率候选",
        count: 1,
        cardId: "TEST_003",
        rating: { firestone: { includedWinrate: 49.2, playedWinrate: 53.4, sampleSize: 1200 } }
      }]
    }} />);

    const metrics = metricsFor("仅有胜率候选");
    expectMetric(metrics, "胜率", "53.4%");
    expectMetric(metrics, "高胜数据", "暂无");
  });

  it("uses the 12-win label only when a real 12-win bucket exists", () => {
    render(<ArenaPanel state={{
      ...state,
      currentChoices: [{
        name: "真实12胜候选",
        count: 1,
        cardId: "TEST_004",
        rating: { hearthArena: 100, pickRate: 35, twelveWinRate: 12.4 }
      }]
    }} />);

    const metrics = metricsFor("真实12胜候选");
    expectMetric(metrics, "12胜率", "12.4%");
  });
});
