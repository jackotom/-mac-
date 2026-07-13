import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import type { OverlayPanelViewModel } from "../src/renderer/types";

const view: OverlayPanelViewModel = {
  summary: { totalCards: 30, remainingCards: 23, drawnCards: 7 },
  deckIdentity: { name: "测试套牌", status: "automatic", detail: "已自动识别当前对局" },
  remainingDeck: [{ id: "remaining-1", name: "剩余测试卡", count: 2, detail: "剩 2/2" }],
  recentDraws: [{ id: "draw-1", name: "已移除的抽牌区测试卡", count: 1, detail: "回合 1" }],
  opponentRecentPlays: [],
  status: { tone: "tracking", label: "监听中", detail: "同步 09:41:12", updatedAtLabel: "09:41:12" }
};

describe("standard tracker overlay", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("omits the recent-draw section while keeping the compact deck summary", () => {
    render(<OverlayPanel view={view} />);

    expect(screen.getByLabelText("套牌概览")).toHaveTextContent("测试套牌");
    expect(screen.getByLabelText("手牌总数")).toHaveTextContent("0");
    expect(screen.getByLabelText("牌库剩余")).toHaveTextContent("23");
    expect(screen.getByRole("button", { name: /牌库中.*23/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "最近抽牌" })).not.toBeInTheDocument();
    expect(screen.queryByText("已移除的抽牌区测试卡")).not.toBeInTheDocument();
  });

  it("renders the compact toolbar, deck summary, and all three card groups", () => {
    const onClose = vi.fn();
    const compactView: OverlayPanelViewModel = {
      ...view,
      remainingDeck: [
        {
          id: "remaining-1",
          name: "剑刃风暴",
          count: 2,
          cost: 3,
          thumbnailUrl: "https://example.com/blade-storm.jpg",
          details: {
            dbfId: 1,
            name: "剑刃风暴",
            manaCost: 3,
            rarity: "EPIC",
            isSpell: true,
            relatedCards: []
          }
        }
      ],
      handCards: [
        { id: "hand-1", name: "盾牌格挡", count: 2, cost: 2 },
        { id: "hand-2", name: "绝命乱斗", count: 1, cost: 5 }
      ],
      otherCards: [{ id: "other-1", name: "幸运币", count: 1, cost: 0 }]
    };

    const { container } = render(<OverlayPanel view={compactView} onClose={onClose} />);

    const toolbar = screen.getByLabelText("置顶小窗工具栏");
    expect(toolbar).toHaveTextContent("记牌器");
    expect(toolbar.querySelector(".lucide-layers-3")).toBeInTheDocument();
    expect(toolbar).toHaveTextContent("监听中");
    fireEvent.click(screen.getByRole("button", { name: "关闭小窗" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const summary = screen.getByLabelText("套牌概览");
    expect(summary).toHaveTextContent("测试套牌");
    expect(within(summary).getByLabelText("手牌总数")).toHaveTextContent("3");
    expect(within(summary).getByLabelText("牌库剩余")).toHaveTextContent("23");
    expect(summary.querySelector(".lucide-hand")).toBeInTheDocument();
    expect(summary.querySelector(".lucide-layers")).toBeInTheDocument();
    expect(summary.querySelector(".overlay-deck-identity-compact .lucide-chevron-down")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /牌库中.*23/ })).toHaveTextContent("牌库中 (23)");
    expect(screen.getByRole("button", { name: /牌库中.*23/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /手牌中.*3/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /其他.*1/ })).toHaveAttribute("aria-expanded", "true");

    const deckGroup = screen.getByRole("region", { name: /牌库中.*23/ });
    expect(deckGroup).toHaveTextContent("剑刃风暴");
    expect(within(deckGroup).getByLabelText("费用 3")).toHaveTextContent("3");
    expect(within(deckGroup).getByLabelText("费用 3")).toHaveClass("is-rarity-epic");
    expect(within(deckGroup).getByLabelText("数量 2")).toHaveTextContent("2");
    expect(deckGroup.querySelector(".overlay-card-art-image")).toHaveAttribute(
      "src",
      "https://example.com/blade-storm.jpg"
    );
    expect(container.querySelector(".overlay-card-thumb")).not.toBeInTheDocument();

    const handGroup = screen.getByRole("region", { name: /手牌中.*3/ });
    expect(within(handGroup).queryByLabelText("数量 1")).not.toBeInTheDocument();
    expect(within(handGroup).getByLabelText("数量 2")).toHaveTextContent("2");
  });

  it("collapses and restores each normal card group independently", () => {
    const collapsibleView: OverlayPanelViewModel = {
      ...view,
      handCards: [{ id: "hand-1", name: "手牌测试卡", count: 1, cost: 1 }],
      otherCards: [{ id: "other-1", name: "其他测试卡", count: 1, cost: 4 }]
    };

    render(<OverlayPanel view={collapsibleView} />);

    const deckToggle = screen.getByRole("button", { name: /牌库中.*23/ });
    fireEvent.click(deckToggle);

    expect(deckToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("剩余测试卡")).not.toBeInTheDocument();
    expect(screen.getByText("手牌测试卡")).toBeInTheDocument();
    expect(screen.getByText("其他测试卡")).toBeInTheDocument();

    fireEvent.click(deckToggle);
    expect(deckToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("剩余测试卡")).toBeInTheDocument();
  });

  it("keeps loading, error, and missing-log states instead of rendering card groups", () => {
    const { rerender } = render(<OverlayPanel view={view} isLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("正在读取记牌器状态");
    expect(screen.queryByRole("button", { name: /牌库中/ })).not.toBeInTheDocument();

    rerender(<OverlayPanel view={view} loadError="状态文件损坏" />);
    expect(screen.getByRole("alert")).toHaveTextContent("状态文件损坏");
    expect(screen.queryByRole("button", { name: /牌库中/ })).not.toBeInTheDocument();

    rerender(
      <OverlayPanel
        view={{
          ...view,
          status: { ...view.status, tone: "offline", label: "缺少 Power.log" }
        }}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("先点修复日志");
    expect(screen.queryByRole("button", { name: /牌库中/ })).not.toBeInTheDocument();
  });

  it("lets the arena overlay split be adjusted and remembered", () => {
    const arenaView: OverlayPanelViewModel = {
      ...view,
      arena: {
        isChoosing: true,
        statusLabel: "选牌中",
        progress: "11/30",
        hero: "玛法里奥",
        scoreSource: "竞技场评分",
        choices: [
          { id: "arena-choice-1", name: "候选一", score: 100 },
          { id: "arena-choice-2", name: "候选二", score: 90 },
          { id: "arena-choice-3", name: "候选三", score: 80 }
        ],
        deck: [{ id: "arena-deck-1", name: "卡多雷培育师", count: 1, detail: "随从" }],
        deckCount: 11
      }
    };

    render(<OverlayPanel view={arenaView} />);

    const slider = screen.getByLabelText("调整当前牌库高度");
    fireEvent.change(slider, { target: { value: "60" } });

    expect(window.localStorage.getItem("hearthstone.overlay.arenaDeckShare")).toBe("60");
    expect(screen.getByLabelText("竞技场选牌评分")).toHaveStyle({
      gridTemplateRows: "auto minmax(92px, 40fr) 14px minmax(78px, 60fr) auto"
    });
  });

  it("uses the compact tracker after the Arena draft is complete", () => {
    const arenaView: OverlayPanelViewModel = {
      ...view,
      deckIdentity: { name: "竞技场牌库", status: "arena", detail: "已选 30/30" },
      remainingDeck: [{ id: "arena-remaining-1", name: "再生德鲁伊", count: 1, detail: "剩 1/1" }],
      arena: {
        isChoosing: false,
        statusLabel: "牌库已生成",
        progress: "30/30",
        hero: "玛法里奥",
        scoreSource: "竞技场评分",
        choices: [],
        deck: [{ id: "arena-deck-1", name: "再生德鲁伊", count: 1, detail: "随从" }],
        deckCount: 30
      }
    };

    render(<OverlayPanel view={arenaView} />);

    expect(screen.queryByRole("region", { name: "当前竞技场候选牌" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("调整当前牌库高度")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("竞技场选牌评分")).not.toBeInTheDocument();
    expect(screen.getByLabelText("套牌概览")).toHaveTextContent("竞技场牌库");
    expect(screen.getByRole("button", { name: /牌库中.*23/ })).toBeInTheDocument();
    expect(screen.getByText("再生德鲁伊")).toBeInTheDocument();
  });

  it("shows the Arena deck instead of the normal deck while drafting", () => {
    const arenaDeck = Array.from({ length: 12 }, (_value, index) => ({
      id: `arena-deck-${index + 1}`,
      name: `竞技场已选 ${index + 1}`,
      count: 1
    }));
    const arenaView: OverlayPanelViewModel = {
      ...view,
      remainingDeck: [{ id: "normal-deck-1", name: "普通牌库假卡", count: 1, detail: "不应显示" }],
      arena: {
        isChoosing: false,
        statusLabel: "选牌中",
        progress: "12/30",
        hero: "玛法里奥",
        scoreSource: "竞技场评分",
        choices: [],
        deck: arenaDeck,
        deckCount: 12
      }
    };

    render(<OverlayPanel view={arenaView} />);

    const arenaDeckRegion = screen.getByRole("region", { name: "当前竞技场牌库" });
    expect(screen.getByLabelText("竞技场选牌评分")).toHaveTextContent("12/30");
    expect(arenaDeckRegion).toHaveTextContent("当前牌库");
    expect(arenaDeckRegion).toHaveTextContent("12");
    expect(arenaDeckRegion).toHaveTextContent("竞技场已选 12");
    expect(screen.queryByText("普通牌库假卡")).not.toBeInTheDocument();
  });
});
