import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpponentOverlayPanel } from "../src/renderer/components/OpponentOverlayPanel";
import { TopBar } from "../src/renderer/components/TopBar";
import type { OverlayPanelViewModel, TrackerStatus } from "../src/renderer/types";

const view: OverlayPanelViewModel = {
  summary: { totalCards: 30, remainingCards: 22, drawnCards: 8 },
  deckIdentity: { name: "测试套牌", status: "automatic", detail: "自动识别当前对局" },
  remainingDeck: [],
  recentDraws: [],
  opponentRecentPlays: [
    { id: "opponent-1", name: "伺机待发", count: 2, detail: "回合 3" }
  ],
  opponentDeck: [{ id: "opponent-deck-1", name: "已知牌库牌", count: 1, cost: 2 }],
  opponentHand: [{ id: "opponent-hand-1", name: "已知手牌", count: 1, cost: 3 }],
  opponentOther: [],
  opponentGlobalEffects: [{ id: "opponent-global-1", name: "对手全局效果", count: 1 }],
  opponentDeckCount: 18,
  opponentHandCount: 4,
  boardAttack: { friendly: 7, opponent: 12 },
  opponentSecrets: [
    {
      id: "secret-11",
      label: "? 1",
      candidates: [
        { id: "EX1_287", name: "法术反制", status: "possible" },
        { id: "EX1_289", name: "寒冰屏障", status: "excluded" }
      ]
    },
    {
      id: "secret-12",
      label: "? 2",
      candidates: [{ id: "EX1_294", name: "镜像实体", status: "possible" }]
    }
  ],
  status: { tone: "tracking", label: "监听中", detail: "同步 09:00:12", updatedAtLabel: "09:00:12" }
};

const status: TrackerStatus = {
  state: "tracking",
  isLoading: false,
  logPath: "/Applications/Hearthstone/Logs/Power.log",
  watchedFiles: 3,
  parsedLines: 120,
  lastSyncedAt: "09:00:12"
};

describe("opponent overlay", () => {
  it("renders the recognized waiting state in green without a repair prompt", () => {
    render(
      <OpponentOverlayPanel
        view={{
          ...view,
          status: {
            tone: "tracking",
            label: "已识别炉石，等待开局",
            detail: "进入对局后自动开始记牌",
            updatedAtLabel: "刚刚"
          }
        }}
        isCollapsed={false}
      />
    );

    expect(screen.getByText("已识别炉石，等待开局")).toHaveClass("overlay-status-tracking");
    expect(screen.getByText("进入对局后自动开始记牌")).toBeInTheDocument();
    expect(screen.queryByText(/先点修复日志/)).not.toBeInTheDocument();
  });

  it("keeps a real missing log as an explicit repair prompt", () => {
    render(
      <OpponentOverlayPanel
        view={{
          ...view,
          status: {
            tone: "offline",
            label: "缺少 Power.log",
            detail: "先点修复日志，完全退出并重新打开炉石，然后进入一局",
            updatedAtLabel: "刚刚"
          }
        }}
        isCollapsed={false}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("先点修复日志");
    expect(screen.queryByRole("button", { name: /牌库中/ })).not.toBeInTheDocument();
  });

  it("renders deck, hand, and other groups without inventing hidden deck cards", () => {
    render(<OpponentOverlayPanel view={view} isCollapsed={false} />);

    expect(screen.getByLabelText("对手记牌器置顶小窗")).toHaveClass("opponent-overlay-shell");
    expect(screen.getByText("对手记牌器")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /影响全局.*1/ })).toBeInTheDocument();
    expect(screen.getByText("对手全局效果")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /牌库中.*18/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /手牌中.*4/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /其他/ })).toBeInTheDocument();
    expect(screen.getByText("已知牌库牌")).toBeInTheDocument();
    expect(screen.getByText("已知手牌")).toBeInTheDocument();
    expect(screen.getAllByText("未公开")).toHaveLength(3);
    expect(screen.getByText("伺机待发")).toBeInTheDocument();
    expect(screen.queryByText(/未知牌库牌/)).not.toBeInTheDocument();
  });

  it("keeps missing opponent global effects as an empty top group", () => {
    render(
      <OpponentOverlayPanel
        view={{ ...view, opponentGlobalEffects: undefined }}
        isCollapsed={false}
      />
    );

    expect(screen.getByRole("region", { name: /影响全局.*0/ })).toHaveTextContent("暂无全局影响");
    expect(screen.queryByText("对手全局效果")).not.toBeInTheDocument();
  });

  it("renders unknown opponent hand cards as stable undisclosed slots", () => {
    const preview = render(<OpponentOverlayPanel view={view} isCollapsed={false} />);

    const firstSlots = screen.getAllByText("未公开")
      .map((label) => label.closest(".overlay-compact-card-row") as HTMLElement);
    expect(firstSlots).toHaveLength(3);
    expect(screen.queryByText(/未知手牌 ×3/)).not.toBeInTheDocument();

    preview.rerender(
      <OpponentOverlayPanel
        view={{ ...view, opponentHandCount: 5 }}
        isCollapsed={false}
      />
    );

    const nextSlots = screen.getAllByText("未公开")
      .map((label) => label.closest(".overlay-compact-card-row") as HTMLElement);
    expect(nextSlots).toHaveLength(4);
    expect(nextSlots[0]).toBe(firstSlots[0]);
    expect(nextSlots[1]).toBe(firstSlots[1]);
    expect(nextSlots[2]).toBe(firstSlots[2]);
  });

  it("keeps a revealed returned card ahead of undisclosed slots while the hand count changes", () => {
    const revealedCard = {
      id: "opponent-hand-revealed-fireball",
      name: "火球术",
      count: 1,
      cost: 4,
      details: {
        dbfId: 315,
        cardId: "CS2_029",
        name: "火球术",
        manaCost: 4,
        cardType: "法术",
        text: "造成 6 点伤害。",
        isSpell: true,
        relatedCards: []
      }
    };
    const preview = render(
      <OpponentOverlayPanel
        view={{ ...view, opponentHand: [revealedCard], opponentHandCount: 3 }}
        isCollapsed={false}
      />
    );

    const revealedRow = screen.getByText("火球术").closest(".overlay-compact-card-row");
    expect(
      [...screen.getByRole("region", { name: /手牌中.*3/ }).querySelectorAll(".overlay-card-art strong")]
        .map((label) => label.textContent)
    ).toEqual(["火球术", "未公开", "未公开"]);

    preview.rerender(
      <OpponentOverlayPanel
        view={{ ...view, opponentHand: [revealedCard], opponentHandCount: 4 }}
        isCollapsed={false}
      />
    );

    expect(screen.getByText("火球术").closest(".overlay-compact-card-row")).toBe(revealedRow);
    expect(screen.getAllByText("未公开")).toHaveLength(3);

    preview.rerender(
      <OpponentOverlayPanel
        view={{ ...view, opponentHand: [revealedCard], opponentHandCount: 2 }}
        isCollapsed={false}
      />
    );

    expect(screen.getByText("火球术").closest(".overlay-compact-card-row")).toBe(revealedRow);
    expect(screen.getAllByText("未公开")).toHaveLength(1);
  });

  it("keeps card preview available for a revealed returned card", () => {
    render(
      <OpponentOverlayPanel
        view={{
          ...view,
          opponentHand: [{
            id: "opponent-hand-revealed-fireball",
            name: "火球术",
            count: 1,
            cost: 4,
            details: {
              dbfId: 315,
              cardId: "CS2_029",
              name: "火球术",
              manaCost: 4,
              cardType: "法术",
              text: "造成 6 点伤害。",
              isSpell: true,
              relatedCards: []
            }
          }],
          opponentHandCount: 2
        }}
        isCollapsed={false}
      />
    );

    fireEvent.mouseEnter(screen.getByText("火球术").closest(".overlay-compact-card-row") as HTMLElement);

    expect(screen.getByRole("tooltip")).toHaveTextContent("造成 6 点伤害。");
    expect(screen.getAllByText("未公开")).toHaveLength(1);
  });

  it("does not embed board attack totals in the opponent list window", () => {
    render(<OpponentOverlayPanel view={view} isCollapsed={false} />);

    expect(screen.queryByRole("button", { name: "我方场攻 7" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "对方场攻 12" })).not.toBeInTheDocument();
  });

  it("renders only available opponent public counters as short text-and-number outputs", () => {
    render(
      <OpponentOverlayPanel
        view={{
          ...view,
          opponentCounters: { nextFatigueDamage: 3, spellsPlayed: 8 }
        }}
        isCollapsed={false}
      />
    );

    const counters = screen.getByRole("region", { name: "对方公开计数" });
    expect(screen.getByLabelText("对方下次疲劳伤害 3")).toHaveClass(
      "overlay-public-counter",
      "overlay-public-counter-fatigue"
    );
    expect(screen.getByLabelText("对方已用法术 8").querySelector(".overlay-public-counter-value"))
      .toHaveTextContent("8");
    expect(screen.getByLabelText("对方下次疲劳伤害 3").querySelector(".overlay-public-counter-label"))
      .toHaveTextContent("疲劳");
    expect(screen.getByLabelText("对方已用法术 8").querySelector(".overlay-public-counter-label"))
      .toHaveTextContent("法术");
    expect(counters.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/对方尸体/)).not.toBeInTheDocument();
  });

  it("requests collapse changes but renders only the controlled state", () => {
    const onCollapsedChange = vi.fn();
    const { rerender } = render(
      <OpponentOverlayPanel view={view} isCollapsed={false} onCollapsedChange={onCollapsedChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "折叠对手小窗" }));

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: /其他/ })).toBeInTheDocument();

    rerender(<OpponentOverlayPanel view={view} isCollapsed onCollapsedChange={onCollapsedChange} />);

    expect(screen.queryByRole("button", { name: /其他/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复对手小窗，2 个奥秘" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "恢复对手小窗，2 个奥秘" }));

    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);

    rerender(<OpponentOverlayPanel view={view} isCollapsed={false} onCollapsedChange={onCollapsedChange} />);

    expect(screen.getByRole("button", { name: /其他/ })).toBeInTheDocument();
  });

  it("keeps every secret slot and all candidates visible without requiring a click", () => {
    render(<OpponentOverlayPanel view={view} isCollapsed={false} />);

    expect(screen.getByRole("region", { name: "奥秘 1 候选" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "奥秘 2 候选" })).toBeInTheDocument();
    expect(screen.getByText("法术反制")).toBeInTheDocument();
    expect(screen.getByText("镜像实体")).toBeInTheDocument();
    expect(screen.getAllByText("可能")).toHaveLength(2);
    expect(screen.getByText("寒冰屏障").closest("li")).toHaveClass("secret-candidate-excluded");
    expect(screen.getByText("已排除")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /查看奥秘/ })).not.toBeInTheDocument();
  });

  it("exposes the opponent-window control without duplicating the native Mac minimize control", () => {
    const onToggleOpponentOverlay = vi.fn();
    const onMinimize = vi.fn();

    render(
      <TopBar
        status={status}
        isTracking
        isBusy={false}
        onToggleTracking={vi.fn()}
        onChooseLogDirectory={vi.fn()}
        onImportDeck={vi.fn()}
        onEnsureLogConfig={vi.fn()}
        onToggleOverlay={vi.fn()}
        onToggleOpponentOverlay={onToggleOpponentOverlay}
        onMinimize={onMinimize}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开对手出牌小窗" }));
    expect(onToggleOpponentOverlay).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "最小化主程序" })).not.toBeInTheDocument();
    expect(onMinimize).not.toHaveBeenCalled();
  });
});
