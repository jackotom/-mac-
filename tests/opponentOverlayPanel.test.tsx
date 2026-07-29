import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpponentOverlayPanel } from "../src/renderer/components/OpponentOverlayPanel";
import type { OverlayCardTrackingView, OverlayPanelViewModel, OverlaySecretSlot } from "../src/renderer/types";

function opponentTracking(secretSlots: readonly OverlaySecretSlot[] = []): OverlayCardTrackingView {
  const empty = (key: keyof OverlayCardTrackingView["current"]) => ({
    key,
    status: "known" as const,
    knownCount: 0,
    totalCount: 0,
    countLabel: "0",
    cards: []
  });
  return {
    status: "ready",
    gameKey: "opponent-game",
    side: "opponent",
    current: {
      deck: { ...empty("deck"), status: "unknown", totalCount: undefined, countLabel: "?" },
      hand: {
        ...empty("hand"),
        status: "partial",
        knownCount: 1,
        totalCount: 5,
        countLabel: "≥1",
        cards: [{ id: "known-hand", name: "已知手牌", count: 1 }]
      },
      play: empty("play"),
      secret: { ...empty("secret"), countLabel: `当前 ${secretSlots.length}` },
      graveyard: empty("graveyard"),
      removed: empty("removed")
    },
    burned: { key: "burned", totalCount: 0, countLabel: "0", truncated: false, items: [] },
    used: { key: "used", totalCount: 0, countLabel: "0", truncated: false, items: [] },
    secretSlots: [...secretSlots]
  };
}

function view(
  cardTracking: OverlayCardTrackingView = opponentTracking(),
  overrides: Partial<OverlayPanelViewModel> = {}
): OverlayPanelViewModel {
  return {
    cardTracking,
    summary: { totalCards: 30, remainingCards: 22, drawnCards: 8 },
    deckIdentity: { name: "测试套牌", status: "automatic", detail: "自动识别当前对局" },
    remainingDeck: [],
    recentDraws: [],
    status: { tone: "tracking", label: "监听中", detail: "同步中", updatedAtLabel: "刚刚" },
    ...overrides
  };
}

describe("opponent overlay", () => {
  it("counts one secret slot once while showing all candidates", () => {
    const secret: OverlaySecretSlot = {
      id: "slot-1",
      label: "? 1",
      candidates: Array.from({ length: 5 }, (_value, index) => ({
        id: `candidate-${index + 1}`,
        name: `候选牌 ${index + 1}`,
        status: "possible" as const
      }))
    };
    render(<OpponentOverlayPanel view={view(opponentTracking([secret]))} isCollapsed={false} />);

    expect(screen.getByRole("button", { name: /奥秘.*当前 1/ })).toBeInTheDocument();
    expect(screen.getAllByText(/候选牌 \d/)).toHaveLength(5);
  });

  it("keeps hidden hand cards aggregated", () => {
    render(<OpponentOverlayPanel view={view()} isCollapsed={false} />);

    expect(screen.getByText("已知手牌")).toBeInTheDocument();
    expect(screen.getByText("未公开 ×4")).toBeInTheDocument();
  });

  it("keeps global effects and public counters", () => {
    render(<OpponentOverlayPanel view={view(opponentTracking(), {
      opponentGlobalEffects: [{ id: "global-1", name: "对手全局效果", count: 1 }],
      opponentCounters: { nextFatigueDamage: 3, spellsPlayed: 8 }
    })} isCollapsed={false} />);

    expect(screen.getByText("对手全局效果")).toBeInTheDocument();
    expect(screen.getByText("疲劳")).toBeInTheDocument();
    expect(screen.getByText("法术")).toBeInTheDocument();
  });

  it("shows secret count on the collapsed restore button", () => {
    const secret: OverlaySecretSlot = { id: "slot-1", label: "? 1", candidates: [] };
    const onCollapsedChange = vi.fn();
    render(
      <OpponentOverlayPanel
        view={view(opponentTracking([secret]))}
        isCollapsed
        onCollapsedChange={onCollapsedChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "恢复对手小窗，1 个奥秘" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("short-circuits lifecycle groups for loading, errors, and missing logs", () => {
    const preview = render(<OpponentOverlayPanel view={view()} isCollapsed={false} isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取对局状态");
    expect(document.querySelector("[data-group-key]")).not.toBeInTheDocument();

    preview.rerender(<OpponentOverlayPanel view={view()} isCollapsed={false} loadError="读取失败测试" />);
    expect(screen.getByRole("alert")).toHaveTextContent("读取失败测试");

    preview.rerender(<OpponentOverlayPanel
      view={view(opponentTracking(), {
        status: { tone: "offline", label: "缺少日志", detail: "缺少 Power.log", updatedAtLabel: "刚刚" }
      })}
      isCollapsed={false}
    />);
    expect(screen.getByRole("status")).toHaveTextContent("先点修复日志");
  });
});
