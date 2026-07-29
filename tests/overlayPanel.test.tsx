import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import type { OverlayCardTrackingView, OverlayPanelViewModel } from "../src/renderer/types";

function zone(
  key: keyof OverlayCardTrackingView["current"],
  count: number,
  name?: string
) {
  return {
    key,
    status: "known" as const,
    knownCount: count,
    totalCount: count,
    countLabel: String(count),
    cards: name ? [{ id: `${key}-1`, name, count: 1 }] : []
  };
}

function tracking(gameKey = "game-1"): OverlayCardTrackingView {
  return {
    status: "ready",
    gameKey,
    side: "friendly",
    current: {
      deck: zone("deck", 1, "牌库牌"),
      hand: zone("hand", 1, "手牌牌"),
      play: zone("play", 0),
      secret: zone("secret", 0),
      graveyard: zone("graveyard", 1, "墓地牌"),
      removed: zone("removed", 0)
    },
    burned: {
      key: "burned",
      totalCount: 1,
      countLabel: "1",
      truncated: false,
      items: [{ id: "burn-1", sequence: 1, displayName: "烧毁牌", hidden: false, confidence: "inferred" }]
    },
    used: {
      key: "used",
      totalCount: 1,
      countLabel: "1",
      truncated: false,
      items: [{ id: "use-1", sequence: 2, displayName: "已使用牌", hidden: false, confidence: "confirmed" }]
    },
    secretSlots: []
  };
}

function view(overrides: Partial<OverlayPanelViewModel> = {}): OverlayPanelViewModel {
  return {
    cardTracking: tracking(),
    summary: { totalCards: 30, remainingCards: 23, drawnCards: 7 },
    deckIdentity: { name: "测试套牌", status: "automatic", detail: "已自动识别当前对局" },
    remainingDeck: [],
    recentDraws: [],
    status: { tone: "tracking", label: "监听中", detail: "同步中", updatedAtLabel: "刚刚" },
    ...overrides
  };
}

describe("standard tracker overlay", () => {
  afterEach(() => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  });

  it("uses lifecycle groups without an old other group", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const { container } = render(<OverlayPanel view={view()} />);

    expect(container.querySelector(".card-tracking-layout")).toHaveAttribute("data-layout-mode", "tall");
    expect(container.querySelector('[data-group-key="deck"]')).toHaveAttribute("data-expanded", "true");
    expect(container.querySelector('[data-group-key="hand"]')).toHaveAttribute("data-expanded", "true");
    expect(screen.queryByText("其他")).not.toBeInTheDocument();
  });

  it("keeps exactly one group open on each short page", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 200 });
    const { container } = render(<OverlayPanel view={view()} />);

    expect(container.querySelectorAll('[data-expanded="true"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "历史" }));
    expect(container.querySelector(".card-tracking-layout")).toHaveAttribute("data-tracking-page", "history");
    expect(container.querySelectorAll('[data-expanded="true"]')).toHaveLength(1);
  });

  it("shows lifecycle history on the history page", () => {
    render(<OverlayPanel view={view()} />);

    fireEvent.click(screen.getByRole("button", { name: "历史" }));

    expect(screen.getByText("烧毁牌")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /已使用.*1/ })).toBeInTheDocument();
  });

  it("keeps global effects separate from physical card locations", () => {
    const preview = render(<OverlayPanel view={view({
      globalEffects: [{ id: "global-1", name: "全局效果", count: 1 }]
    })} />);

    expect(screen.getByRole("region", { name: "影响全局 1 张" })).toHaveTextContent("全局效果");

    preview.rerender(<OverlayPanel view={view({ globalEffects: [] })} />);
    expect(screen.queryByText("全局效果")).not.toBeInTheDocument();
  });

  it("short-circuits groups for loading, errors, and missing logs", () => {
    const preview = render(<OverlayPanel view={view()} isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取记牌器状态");
    expect(document.querySelector("[data-group-key]")).not.toBeInTheDocument();

    preview.rerender(<OverlayPanel view={view()} loadError="读取失败测试" />);
    expect(screen.getByRole("alert")).toHaveTextContent("读取失败测试");

    preview.rerender(<OverlayPanel view={view({
      status: { tone: "offline", label: "缺少日志", detail: "缺少 Power.log", updatedAtLabel: "刚刚" }
    })} />);
    expect(screen.getByRole("status")).toHaveTextContent("先点修复日志");
    expect(document.querySelector("[data-group-key]")).not.toBeInTheDocument();
  });

  it("shows Arena deck statistics instead of lifecycle groups while drafting", () => {
    render(<OverlayPanel view={view({
      arena: {
        isChoosing: false,
        showDeckStats: true,
        statusLabel: "选牌中",
        progress: "12/30",
        confirmedCount: 12,
        unresolvedCount: 18,
        hero: "法师",
        choices: [],
        deck: [{ id: "arena-1", name: "竞技场牌", count: 1, pickRate: 82.4, deckImpact: -9.08 }],
        deckCount: 12
      }
    })} />);

    expect(screen.getByLabelText("竞技场卡组影响")).toHaveTextContent("竞技场牌");
    expect(screen.queryByRole("button", { name: "历史" })).not.toBeInTheDocument();
  });
});
