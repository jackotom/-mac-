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
  unresolvedCount: 23,
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
  deck: [{ name: "已选测试牌", count: 7 }]
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
  it("keeps the game left-to-right choice order and marks only the highest score", () => {
    render(<ArenaPanel state={{
      ...state,
      currentChoices: [
        { name: "左侧候选", count: 1, cardId: "LEFT", score: 80 },
        { name: "中间最佳", count: 1, cardId: "MIDDLE", score: 120 },
        { name: "右侧候选", count: 1, cardId: "RIGHT", score: 95 }
      ]
    }} />);

    const choices = within(screen.getByRole("region", { name: "当前候选牌" }))
      .getAllByRole("listitem");
    expect(choices.map((choice) => choice.querySelector(".arena-choice-row strong")?.textContent))
      .toEqual(["左侧候选", "中间最佳", "右侧候选"]);
    expect(within(choices[0]).queryByText("首选")).not.toBeInTheDocument();
    expect(within(choices[1]).getByText("首选")).toBeInTheDocument();
    expect(within(choices[2]).queryByText("首选")).not.toBeInTheDocument();
  });

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

  it.each([
    [29, 1],
    [24, 6]
  ])("shows %i confirmed cards and %i unresolved cards without rendering the placeholder", (confirmedCount, unresolvedCount) => {
    render(<ArenaPanel state={{
      ...state,
      status: "complete",
      draftCount: confirmedCount,
      unresolvedCount,
      currentChoices: [],
      deck: [
        { name: "已确认竞技场牌", count: confirmedCount },
        { name: "未解析竞技场牌", count: unresolvedCount, unresolved: true }
      ]
    }} />);

    const deck = screen.getByRole("region", { name: "当前竞技场牌库" });
    expect(screen.getByText(`已确认 ${confirmedCount}/30`)).toBeInTheDocument();
    expect(screen.getByText(`${unresolvedCount} 张待识别`)).toBeInTheDocument();
    expect(within(deck).getByText(`${confirmedCount} 张`)).toBeInTheDocument();
    expect(within(deck).queryByText("未解析竞技场牌")).not.toBeInTheDocument();
    expect(screen.queryByText("30/30")).not.toBeInTheDocument();
  });

  it("shows a 31-candidate ambiguity as zero confirmed and thirty unresolved", () => {
    render(<ArenaPanel state={{
      ...state,
      status: "redrafting",
      draftCount: 30,
      unresolvedCount: 30,
      currentChoices: [],
      deck: []
    }} />);

    expect(screen.getByText("已确认 0/30")).toBeInTheDocument();
    expect(screen.getByText("30 张待识别")).toBeInTheDocument();
    expect(screen.queryByText("尚未选择牌，完成选牌后会生成竞技场牌库。")).not.toBeInTheDocument();
    expect(screen.queryByText("30/30")).not.toBeInTheDocument();
  });

  it("shows 30/30 without an unresolved warning only for an exact deck", () => {
    render(<ArenaPanel state={{
      ...state,
      status: "complete",
      draftCount: 30,
      unresolvedCount: 0,
      currentChoices: [],
      deck: [{ name: "精确竞技场牌库", count: 30 }]
    }} />);

    const deck = screen.getByRole("region", { name: "当前竞技场牌库" });
    expect(screen.getByText("30/30")).toBeInTheDocument();
    expect(screen.queryByText(/张待识别/)).not.toBeInTheDocument();
    expect(within(deck).getByText("30 张")).toBeInTheDocument();
    expect(within(deck).getByText("精确竞技场牌库")).toBeInTheDocument();
  });
});
