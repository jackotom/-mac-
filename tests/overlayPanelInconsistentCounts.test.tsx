import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import type { OverlayPanelViewModel } from "../src/renderer/types";

const inconsistentView: OverlayPanelViewModel = {
  summary: { totalCards: 30, remainingCards: 18, drawnCards: 12 },
  deckIdentity: { name: "当前套牌", status: "automatic", detail: "已自动识别当前对局" },
  remainingDeck: [],
  handCards: [{ id: "hand-1", name: "已知手牌", count: 1 }],
  otherCards: [{ id: "other-1", name: "异常区域记录", count: 967 }],
  recentDraws: [],
  opponentRecentPlays: [],
  status: { tone: "tracking", label: "监听中", detail: "同步中", updatedAtLabel: "刚刚" }
};

describe("OverlayPanel inconsistent count states", () => {
  it("warns without hiding or rewriting suspicious deck and other-zone counts", () => {
    const { rerender } = render(<OverlayPanel view={inconsistentView} />);

    expect(screen.getByRole("alert", { name: "牌库数据异常" })).toHaveTextContent("牌库数据异常，正在重新识别");
    expect(screen.getByRole("button", { name: /牌库中.*18/ })).toHaveTextContent("牌库中 (18)");
    expect(screen.getByRole("button", { name: /手牌中.*1/ })).toHaveTextContent("手牌中 (1)");
    expect(screen.getByRole("button", { name: /其他.*967/ })).toHaveTextContent("其他 (967)");

    const otherGroup = screen.getByRole("region", { name: /其他.*967/ });
    expect(within(otherGroup).getByText("异常区域记录")).toBeInTheDocument();
    expect(within(otherGroup).getByLabelText("数量 967")).toHaveTextContent("967");

    rerender(
      <OverlayPanel
        view={{
          ...inconsistentView,
          otherCards: [{ id: "other-1", name: "异常区域记录", count: 5696 }]
        }}
      />
    );

    expect(screen.getByRole("alert", { name: "牌库数据异常" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /手牌中.*1/ })).toHaveTextContent("手牌中 (1)");
    expect(screen.getByRole("button", { name: /其他.*5696/ })).toHaveTextContent("其他 (5696)");
  });

  it("does not warn for a valid empty deck, an arena deck, or a reasonable other-zone count", () => {
    const validEmptyView: OverlayPanelViewModel = {
      ...inconsistentView,
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0 },
      remainingDeck: [],
      handCards: [],
      otherCards: []
    };
    const { rerender } = render(<OverlayPanel view={validEmptyView} />);

    expect(screen.queryByRole("alert", { name: "牌库数据异常" })).not.toBeInTheDocument();

    rerender(
      <OverlayPanel
        view={{
          ...validEmptyView,
          summary: { totalCards: 30, remainingCards: 30, drawnCards: 0 },
          deckIdentity: { name: "竞技场牌库", status: "arena", detail: "等待精确牌库" }
        }}
      />
    );

    expect(screen.queryByRole("alert", { name: "牌库数据异常" })).not.toBeInTheDocument();

    rerender(
      <OverlayPanel
        view={{
          ...validEmptyView,
          otherCards: [{ id: "other-limit", name: "合理边界记录", count: 100 }]
        }}
      />
    );

    expect(screen.queryByRole("alert", { name: "牌库数据异常" })).not.toBeInTheDocument();
  });
});
