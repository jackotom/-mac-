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
  it("renders an independent, scrollable opponent-play list", () => {
    render(<OpponentOverlayPanel view={view} isCollapsed={false} />);

    expect(screen.getByLabelText("对手出牌置顶小窗")).toHaveClass("opponent-overlay-shell");
    expect(screen.getByLabelText("对手最近出牌")).toBeInTheDocument();
    expect(screen.getByText("伺机待发")).toBeInTheDocument();
    expect(screen.getByText("回合 3")).toBeInTheDocument();
  });

  it("does not embed board attack totals in the opponent list window", () => {
    render(<OpponentOverlayPanel view={view} isCollapsed={false} />);

    expect(screen.queryByRole("button", { name: "我方场攻 7" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "对方场攻 12" })).not.toBeInTheDocument();
  });

  it("requests collapse changes but renders only the controlled state", () => {
    const onCollapsedChange = vi.fn();
    const { rerender } = render(
      <OpponentOverlayPanel view={view} isCollapsed={false} onCollapsedChange={onCollapsedChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "折叠对手小窗" }));

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText("对手最近出牌")).toBeInTheDocument();

    rerender(<OpponentOverlayPanel view={view} isCollapsed onCollapsedChange={onCollapsedChange} />);

    expect(screen.queryByLabelText("对手最近出牌")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复对手小窗，2 个奥秘" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "恢复对手小窗，2 个奥秘" }));

    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);

    rerender(<OpponentOverlayPanel view={view} isCollapsed={false} onCollapsedChange={onCollapsedChange} />);

    expect(screen.getByLabelText("对手最近出牌")).toBeInTheDocument();
  });

  it("selects independent secret slots and discloses possible and excluded candidates", () => {
    render(<OpponentOverlayPanel view={view} isCollapsed={false} />);

    const firstSlot = screen.getByRole("button", { name: "查看奥秘 1" });
    const secondSlot = screen.getByRole("button", { name: "查看奥秘 2" });

    expect(screen.queryByText("法术反制")).not.toBeInTheDocument();
    fireEvent.click(firstSlot);
    expect(firstSlot).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("法术反制")).toBeInTheDocument();
    expect(screen.getByText("可能")).toBeInTheDocument();
    expect(screen.getByText("寒冰屏障").closest("li")).toHaveClass("secret-candidate-excluded");
    expect(screen.getByText("已排除")).toBeInTheDocument();

    fireEvent.click(secondSlot);
    expect(firstSlot).toHaveAttribute("aria-expanded", "false");
    expect(secondSlot).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("法术反制")).not.toBeInTheDocument();
    expect(screen.getByText("镜像实体")).toBeInTheDocument();

    fireEvent.click(secondSlot);
    expect(secondSlot).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("镜像实体")).not.toBeInTheDocument();
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
