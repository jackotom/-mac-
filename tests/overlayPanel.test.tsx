import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import { toOverlayPanelViewModel } from "../src/renderer/overlayView";
import type {
  OverlayCardTrackingView,
  OverlayPanelViewModel,
  OverlaySecretSlot
} from "../src/renderer/types";
import type { PublicTrackerState } from "../src/shared/types";

const view: OverlayPanelViewModel = {
  summary: { totalCards: 30, remainingCards: 23, drawnCards: 7 },
  deckIdentity: { name: "测试套牌", status: "automatic", detail: "已自动识别当前对局" },
  remainingDeck: [{ id: "remaining-1", name: "剩余测试卡", count: 2, detail: "剩 2/2" }],
  recentDraws: [{ id: "draw-1", name: "已移除的抽牌区测试卡", count: 1, detail: "回合 1" }],
  opponentRecentPlays: [],
  status: { tone: "tracking", label: "监听中", detail: "同步 09:41:12", updatedAtLabel: "09:41:12" }
};

function lifecycleTracking(
  gameKey = "game-1",
  secretSlots: readonly OverlaySecretSlot[] = []
): OverlayCardTrackingView {
  const zone = (
    key: keyof OverlayCardTrackingView["current"],
    count: number,
    name?: string
  ) => ({
    key,
    status: "known" as const,
    knownCount: count,
    totalCount: count,
    countLabel: String(count),
    cards: name ? [{ id: `${key}-1`, name, count: 1 }] : []
  });
  return {
    status: "ready",
    gameKey,
    side: "friendly",
    current: {
      deck: zone("deck", 1, "牌库牌"),
      hand: zone("hand", 1, "手牌牌"),
      play: zone("play", 0),
      secret: zone("secret", secretSlots.length),
      graveyard: zone("graveyard", 1, "墓地牌"),
      removed: zone("removed", 0)
    },
    burned: {
      key: "burned",
      totalCount: 1,
      countLabel: "1",
      truncated: false,
      items: [{
        id: "burned-1",
        sequence: 1,
        displayName: "烧毁牌",
        hidden: false,
        confidence: "confirmed"
      }]
    },
    used: {
      key: "used",
      totalCount: 1,
      countLabel: "1",
      truncated: false,
      items: [{
        id: "used-1",
        sequence: 2,
        displayName: "已使用牌",
        hidden: false,
        confidence: "confirmed"
      }]
    },
    secretSlots: [...secretSlots]
  };
}

function lifecycleView(
  gameKey = "game-1",
  secretSlots: readonly OverlaySecretSlot[] = []
): OverlayPanelViewModel {
  return { ...view, cardTracking: lifecycleTracking(gameKey, secretSlots) };
}

function setViewportHeight(height: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

describe("standard tracker overlay", () => {
  afterEach(() => {
    window.localStorage.clear();
    setViewportHeight(768);
    vi.unstubAllGlobals();
  });

  it("uses tall lifecycle defaults without an other group", () => {
    setViewportHeight(900);
    const { container } = render(<OverlayPanel view={lifecycleView()} />);

    expect(container.querySelector(".card-tracking-layout")).toHaveAttribute("data-layout-mode", "tall");
    expect(container.querySelector('[data-group-key="deck"]')).toHaveAttribute("data-expanded", "true");
    expect(container.querySelector('[data-group-key="hand"]')).toHaveAttribute("data-expanded", "true");
    expect(container.querySelectorAll('[data-expanded="true"]')).toHaveLength(2);
    expect(screen.queryByText("其他")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-scroll-owner="card-tracking-main"]')).toHaveLength(1);
  });

  it("keeps exactly one group open on both short pages", () => {
    setViewportHeight(200);
    const { container } = render(<OverlayPanel view={lifecycleView()} />);

    expect(container.querySelector(".card-tracking-layout")).toHaveAttribute("data-layout-mode", "short");
    expect(container.querySelectorAll('[data-expanded="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-group-key="deck"]')).toHaveAttribute("data-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "历史" }));

    expect(container.querySelector(".card-tracking-layout")).toHaveAttribute("data-tracking-page", "history");
    expect(container.querySelectorAll('[data-expanded="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-group-key="burned"]')).toHaveAttribute("data-expanded", "true");
  });

  it("promotes the first secret only while selection is pristine", () => {
    setViewportHeight(200);
    const firstSecret: OverlaySecretSlot = {
      id: "secret-1",
      label: "? 1",
      candidates: [{ id: "EX1_287", name: "法术反制", status: "possible" }]
    };
    const preview = render(<OverlayPanel view={lifecycleView()} />);

    preview.rerender(<OverlayPanel view={lifecycleView("game-1", [firstSecret])} />);
    expect(preview.container.querySelector('[data-group-key="secret"]')).toHaveAttribute("data-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: /手牌.*1/ }));
    preview.rerender(<OverlayPanel view={lifecycleView("game-1", [firstSecret, { ...firstSecret, id: "secret-2" }])} />);
    expect(preview.container.querySelector('[data-group-key="hand"]')).toHaveAttribute("data-expanded", "true");
    expect(preview.container.querySelector(".card-tracking-layout")).toHaveAttribute("data-tracking-page", "current");

    fireEvent.click(screen.getByRole("button", { name: "历史" }));
    preview.rerender(<OverlayPanel view={lifecycleView("game-1", [
      firstSecret,
      { ...firstSecret, id: "secret-2" },
      { ...firstSecret, id: "secret-3" }
    ])} />);
    expect(preview.container.querySelector(".card-tracking-layout")).toHaveAttribute("data-tracking-page", "history");
  });

  it("resets user selection when a new game key arrives", () => {
    setViewportHeight(200);
    const preview = render(<OverlayPanel view={lifecycleView("game-1")} />);
    fireEvent.click(screen.getByRole("button", { name: "历史" }));
    expect(preview.container.querySelector(".card-tracking-layout")).toHaveAttribute("data-tracking-page", "history");

    preview.rerender(<OverlayPanel view={lifecycleView("game-2")} />);
    expect(preview.container.querySelector(".card-tracking-layout")).toHaveAttribute("data-tracking-page", "current");
    expect(preview.container.querySelector('[data-group-key="deck"]')).toHaveAttribute("data-expanded", "true");
  });

  it("keeps the most recent user group across tall-short-tall resizing", () => {
    let notifyResize: ResizeObserverCallback | undefined;
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    setViewportHeight(900);
    const preview = render(<OverlayPanel view={lifecycleView()} />);

    fireEvent.click(screen.getByRole("button", { name: /墓地.*1/ }));
    expect(preview.container.querySelector('[data-group-key="graveyard"]')).toHaveAttribute("data-expanded", "true");

    act(() => {
      notifyResize?.(
        [{ contentRect: { height: 200 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });
    expect(preview.container.querySelector(".card-tracking-layout")).toHaveAttribute("data-layout-mode", "short");
    expect(preview.container.querySelectorAll('[data-expanded="true"]')).toHaveLength(1);
    expect(preview.container.querySelector('[data-group-key="graveyard"]')).toHaveAttribute("data-expanded", "true");

    act(() => {
      notifyResize?.(
        [{ contentRect: { height: 900 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });
    expect(preview.container.querySelector(".card-tracking-layout")).toHaveAttribute("data-layout-mode", "tall");
    expect(preview.container.querySelectorAll('[data-expanded="true"]')).toHaveLength(1);
    expect(preview.container.querySelector('[data-group-key="graveyard"]')).toHaveAttribute("data-expanded", "true");
  });

  it("renders the recognized waiting state in green without a repair prompt", () => {
    render(
      <OverlayPanel
        view={{
          ...view,
          status: {
            tone: "tracking",
            label: "已识别炉石，等待开局",
            detail: "进入对局后自动开始记牌",
            updatedAtLabel: "刚刚"
          }
        }}
      />
    );

    const status = screen.getByText("已识别炉石，等待开局");
    expect(status).toHaveClass("overlay-status-tracking");
    expect(status).toHaveAttribute("title", "进入对局后自动开始记牌");
    expect(screen.queryByText(/先点修复日志/)).not.toBeInTheDocument();
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
    const onOpenSettings = vi.fn();
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

    const { container } = render(
      <OverlayPanel view={compactView} onOpenSettings={onOpenSettings} onClose={onClose} />
    );

    const toolbar = screen.getByLabelText("置顶小窗工具栏");
    expect(toolbar).toHaveTextContent("记牌器");
    expect(toolbar.querySelector(".lucide-layers-3")).toBeInTheDocument();
    expect(toolbar).toHaveTextContent("监听中");
    const settingsButton = screen.getByRole("button", { name: "打开软件设置" });
    expect(settingsButton).toHaveAttribute("title", "打开软件设置");
    expect(settingsButton.compareDocumentPosition(screen.getByRole("button", { name: "关闭小窗" })))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    fireEvent.click(settingsButton);
    expect(onOpenSettings).toHaveBeenCalledOnce();
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

  it("keeps card art and mana from deck details, using ? only when details are absent", () => {
    const state: PublicTrackerState = {
      status: "watching",
      gameActive: true,
      deckName: "缩略图回归套牌",
      autoMatchedDeckId: "thumbnail-regression",
      deck: [
        {
          name: "有详情卡牌",
          count: 2,
          remaining: 2,
          drawn: 0,
          played: 0,
          details: {
            dbfId: 1001,
            name: "有详情卡牌",
            manaCost: 6,
            cropImageUrl: "https://example.com/known-card-crop.jpg",
            imageUrl: "https://example.com/known-card-full.jpg",
            isSpell: true,
            relatedCards: []
          }
        },
        {
          name: "无详情卡牌",
          count: 1,
          remaining: 1,
          drawn: 0,
          played: 0
        }
      ],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 3, remainingCards: 3, drawnCards: 0, opponentPlayedCount: 0 }
    };

    render(<OverlayPanel view={toOverlayPanelViewModel(state)} />);

    const deckGroup = screen.getByRole("region", { name: /牌库中.*3/ });
    const knownRow = within(deckGroup).getByText("有详情卡牌").closest(".overlay-compact-card-row") as HTMLElement;
    const unknownRow = within(deckGroup).getByText("无详情卡牌").closest(".overlay-compact-card-row") as HTMLElement;

    expect(within(knownRow).getByLabelText("费用 6")).toHaveTextContent("6");
    expect(within(knownRow).queryByLabelText("费用 ?")).not.toBeInTheDocument();
    expect(knownRow.querySelector(".overlay-card-art-image")).toHaveAttribute(
      "src",
      "https://example.com/known-card-crop.jpg"
    );
    expect(within(unknownRow).getByLabelText("费用 ?")).toHaveTextContent("?");
    expect(unknownRow.querySelector(".overlay-card-art-image")).not.toBeInTheDocument();
  });

  it("shows global effects first and clears them when a reset state arrives", () => {
    const effectView: OverlayPanelViewModel = {
      ...view,
      globalEffects: [{ id: "global-1", name: "全场法力消耗降低", count: 1, cost: 0 }]
    };
    const { rerender } = render(<OverlayPanel view={effectView} />);

    const globalGroup = screen.getByRole("region", { name: /影响全局.*1/ });
    const deckGroup = screen.getByRole("region", { name: /牌库中.*23/ });
    expect(globalGroup.compareDocumentPosition(deckGroup)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(globalGroup).toHaveTextContent("全场法力消耗降低");

    rerender(<OverlayPanel view={{ ...view, globalEffects: [] }} />);
    expect(screen.getByRole("region", { name: /影响全局.*0/ })).toHaveTextContent("暂无全局影响");
    expect(screen.queryByText("全场法力消耗降低")).not.toBeInTheDocument();

    rerender(<OverlayPanel view={view} />);
    expect(screen.getByRole("region", { name: /影响全局.*0/ })).toHaveTextContent("暂无全局影响");
  });

  it("renders only available friendly public counters as short text-and-number outputs", () => {
    render(
      <OverlayPanel
        view={{
          ...view,
          friendlyCounters: { nextFatigueDamage: 0, corpses: 6 }
        }}
      />
    );

    const counters = screen.getByRole("region", { name: "我方公开计数" });
    const fatigue = within(counters).getByLabelText("我方下次疲劳伤害 0");
    const corpses = within(counters).getByLabelText("我方尸体 6");

    expect(counters).toHaveClass("overlay-public-counters");
    expect(fatigue).toHaveClass("overlay-public-counter", "overlay-public-counter-fatigue");
    expect(fatigue.querySelector(".overlay-public-counter-label")).toHaveTextContent("疲劳");
    expect(fatigue.querySelector(".overlay-public-counter-value")).toHaveTextContent("0");
    expect(corpses.querySelector(".overlay-public-counter-label")).toHaveTextContent("尸体");
    expect(corpses.querySelector(".overlay-public-counter-value")).toHaveTextContent("6");
    expect(counters.querySelector("svg")).not.toBeInTheDocument();
    expect(within(counters).queryByLabelText(/已用法术/)).not.toBeInTheDocument();
  });

  it("keeps essential card information available at 100px wide", () => {
    const narrowView: OverlayPanelViewModel = {
      ...view,
      deckIdentity: {
        name: "这是一个需要在窄窗口中省略显示的超长套牌名称",
        status: "automatic",
        detail: "已自动识别当前对局"
      },
      remainingDeck: [
        {
          id: "narrow-card",
          name: "这是一张需要在窄窗口中省略显示的超长卡牌名称",
          count: 12,
          cost: 10
        }
      ]
    };

    render(<OverlayPanel view={narrowView} style={{ width: 100 }} />);

    const overlay = screen.getByLabelText("炉石记牌器置顶小窗");
    expect(overlay).toHaveStyle({ width: "100px" });
    expect(screen.getByLabelText("套牌概览").querySelector(".overlay-deck-name")).toHaveAttribute(
      "title",
      expect.stringContaining("超长套牌名称")
    );

    const cardGroup = screen.getByRole("region", { name: /牌库中.*23/ });
    expect(within(cardGroup).getByLabelText("费用 10")).toHaveTextContent("10");
    expect(within(cardGroup).getByLabelText("数量 12")).toHaveTextContent("12");
    expect(within(cardGroup).getByText(/超长卡牌名称/)).toHaveAttribute(
      "title",
      "这是一张需要在窄窗口中省略显示的超长卡牌名称"
    );
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

  it("shows only the Firestone-style Arena deck table with exact rate and impact formatting", () => {
    const arenaView: OverlayPanelViewModel = {
      ...view,
      arena: {
        isChoosing: true,
        showDeckStats: true,
        statusLabel: "选牌中",
        progress: "11/30",
        hero: "玛法里奥",
        scoreSource: "竞技场评分",
        choices: [
          { id: "arena-choice-1", name: "候选一", score: 100 },
          { id: "arena-choice-2", name: "候选二", score: 90 },
          { id: "arena-choice-3", name: "候选三", score: 80 }
        ],
        deck: [
          { id: "arena-deck-1", name: "卡多雷培育师", count: 2, cost: 3, pickRate: 75.6, deckImpact: 0.1 },
          { id: "arena-deck-2", name: "空数据牌", count: 1, cost: 4 },
          { id: "arena-deck-3", name: "负影响牌", count: 1, cost: 5, pickRate: 29.74, deckImpact: -9.13 },
          { id: "arena-deck-4", name: "零影响牌", count: 1, cost: 6, pickRate: 50, deckImpact: 0 }
        ],
        deckCount: 11,
        confirmedCount: 11,
        unresolvedCount: 19
      }
    };

    render(<OverlayPanel view={arenaView} />);

    const arena = screen.getByLabelText("竞技场卡组影响");
    expect(within(arena).getByLabelText("竞技场牌库表头")).toHaveTextContent("选取率卡牌影响");
    expect(within(arena).getByLabelText("选取率 75.6%")).toHaveTextContent("75.6%");
    expect(within(arena).getByLabelText("选取率 75.6%")).toHaveClass("is-positive");
    expect(within(arena).getByLabelText("选取率 29.7%")).toHaveClass("is-negative");
    expect(within(arena).getByLabelText("选取率 50.0%")).toHaveClass("is-neutral");
    expect(within(arena).getByLabelText("卡组影响 0.10")).toHaveTextContent("0.10");
    expect(within(arena).getByLabelText("卡组影响 0.10")).toHaveClass("is-positive");
    expect(within(arena).getByLabelText("卡组影响 -9.13")).toHaveClass("is-negative");
    expect(within(arena).getByLabelText("卡组影响 0.00")).toHaveClass("is-neutral");
    expect(within(arena).getAllByText("—")).toHaveLength(2);
    expect(within(arena).getByLabelText("数量 2")).toHaveTextContent("2");
    expect(screen.queryByRole("region", { name: "当前竞技场候选牌" })).not.toBeInTheDocument();
    expect(screen.queryByText("最近选择：")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("套牌概览")).not.toBeInTheDocument();
  });

  it("does not imply there are no choices when a special-team draft has no selected deck cards yet", () => {
    render(
      <OverlayPanel
        view={{
          ...view,
          arena: {
            isChoosing: true,
            showDeckStats: true,
            statusLabel: "选牌中",
            progress: "0/30",
            hero: "等待职业",
            choices: [
              { id: "arena-choice-zilliax", name: "奇利亚斯豪华版3000型" },
              { id: "arena-choice-murozond", name: "末世的姆诺兹多" },
              { id: "arena-choice-vashj", name: "瓦丝琪女男爵" }
            ],
            deck: [],
            deckCount: 0,
            confirmedCount: 0,
            unresolvedCount: 30
          }
        }}
      />
    );

    const arena = screen.getByLabelText("竞技场卡组影响");
    expect(within(arena).getByText("当前牌库尚无已选牌")).toBeInTheDocument();
    expect(within(arena).queryByText("尚未选择牌")).not.toBeInTheDocument();
  });

  it.each(["选牌中", "重选中", "等待开局"])("shows the Arena phase above the deck table: %s", (statusLabel) => {
    render(
      <OverlayPanel
        style={{ width: 100 }}
        view={{
          ...view,
          arena: {
            isChoosing: statusLabel !== "等待开局",
            showDeckStats: true,
            statusLabel,
            progress: "30/30",
            hero: "玛法里奥",
            choices: [],
            deck: [{ id: "arena-deck-1", name: "再生德鲁伊", count: 1 }],
            deckCount: 30,
            confirmedCount: 30,
            unresolvedCount: 0
          }
        }}
      />
    );

    expect(screen.getByLabelText("竞技场阶段")).toHaveTextContent(statusLabel);
  });

  it("keeps the Arena deck table visible while waiting for the match to start", () => {
    const arenaView: OverlayPanelViewModel = {
      ...view,
      deckIdentity: { name: "竞技场牌库", status: "arena", detail: "已选 30/30" },
      remainingDeck: [{ id: "arena-remaining-1", name: "再生德鲁伊", count: 1, detail: "剩 1/1" }],
      arena: {
        isChoosing: false,
        showDeckStats: true,
        statusLabel: "等待开局",
        progress: "30/30",
        hero: "玛法里奥",
        scoreSource: "竞技场评分",
        choices: [],
        deck: [{ id: "arena-deck-1", name: "再生德鲁伊", count: 1, pickRate: 82.4, deckImpact: -9.08 }],
        deckCount: 30,
        confirmedCount: 30,
        unresolvedCount: 0
      }
    };

    render(<OverlayPanel view={arenaView} />);

    const arena = screen.getByLabelText("竞技场卡组影响");
    expect(arena).toHaveTextContent("再生德鲁伊");
    expect(within(arena).getByLabelText("选取率 82.4%")).toBeInTheDocument();
    expect(within(arena).getByLabelText("卡组影响 -9.08")).toBeInTheDocument();
    expect(screen.queryByLabelText("套牌概览")).not.toBeInTheDocument();
  });

  it("keeps unresolved Arena placeholder cards out of the table", () => {
    const incompleteArenaView = {
      ...view,
      summary: { totalCards: 30, remainingCards: 30, drawnCards: 0 },
      deckIdentity: { name: "竞技场牌库", status: "arena", detail: "已确认 24/30" },
      remainingDeck: [
        { id: "known-card", name: "再生德鲁伊", count: 1, cost: 3 },
        { id: "unresolved-cards", name: "日志缺失的竞技场牌", count: 6, unresolved: true }
      ],
      arena: {
        isChoosing: false,
        showDeckStats: true,
        statusLabel: "牌库待确认",
        progress: "已确认 24/30",
        hero: "玛法里奥",
        choices: [],
        deck: [{ id: "known-card", name: "再生德鲁伊", count: 1, cost: 3 }],
        deckCount: 30,
        confirmedCount: 24,
        unresolvedCount: 6
      }
    } as OverlayPanelViewModel;

    render(<OverlayPanel view={incompleteArenaView} style={{ width: 100 }} />);

    expect(screen.getByLabelText("竞技场卡组影响")).toBeInTheDocument();
    expect(screen.queryByText("日志缺失的竞技场牌")).not.toBeInTheDocument();
    expect(screen.getByText("再生德鲁伊")).toBeInTheDocument();
  });

  it("distinguishes the remaining Arena deck from its total after drafting", () => {
    const completedArenaView: OverlayPanelViewModel = {
      ...view,
      summary: { totalCards: 30, remainingCards: 27, drawnCards: 3 },
      deckIdentity: { name: "竞技场牌库", status: "arena", detail: "已选 30/30" },
      arena: {
        isChoosing: false,
        showDeckStats: false,
        statusLabel: "对局中",
        progress: "30/30",
        hero: "玛法里奥",
        choices: [],
        deck: [{ id: "arena-deck-1", name: "再生德鲁伊", count: 1 }],
        deckCount: 30,
        confirmedCount: 30,
        unresolvedCount: 0
      }
    };

    render(<OverlayPanel view={completedArenaView} style={{ width: 100 }} />);

    const deckCount = screen.getByLabelText("牌库剩余 27，总计 30");
    expect(deckCount).toHaveTextContent("27/30");
    expect(deckCount).toHaveAttribute("title", "牌库剩余 27，总计 30");
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
        showDeckStats: true,
        statusLabel: "选牌中",
        progress: "12/30",
        hero: "玛法里奥",
        scoreSource: "竞技场评分",
        choices: [],
        deck: arenaDeck,
        deckCount: 12,
        confirmedCount: 12,
        unresolvedCount: 18
      }
    };

    render(<OverlayPanel view={arenaView} />);

    const arenaDeckTable = screen.getByLabelText("竞技场卡组影响");
    expect(arenaDeckTable).toHaveTextContent("选取率");
    expect(arenaDeckTable).toHaveTextContent("竞技场已选 12");
    expect(screen.queryByText("普通牌库假卡")).not.toBeInTheDocument();
  });

  it("highlights synergy cards across normal groups on hover and clears when the pointer leaves", () => {
    const synergyView = {
      ...view,
      remainingDeck: [
        {
          id: "cold-case",
          name: "冰冷案例",
          count: 1,
          details: {
            dbfId: 77659,
            name: "冰冷案例",
            isSpell: true,
            relatedCards: [],
            synergyCards: [
              {
                dbfId: 78394,
                cardId: "REV_514",
                name: "天定之灾克尔苏加德",
                reason: "共同使用不稳定的骷髅"
              }
            ]
          }
        }
      ],
      handCards: [
        {
          id: "kelthuzad",
          name: "天定之灾克尔苏加德",
          count: 1,
          details: {
            dbfId: 118119,
            cardId: "CORE_REV_514",
            name: "天定之灾克尔苏加德",
            isSpell: false,
            relatedCards: [],
            synergyCards: []
          }
        }
      ],
      otherCards: [
        {
          id: "unrelated-card",
          name: "无关卡牌",
          count: 1,
          details: {
            dbfId: 99999,
            name: "无关卡牌",
            isSpell: true,
            relatedCards: [],
            synergyCards: []
          }
        }
      ]
    } as OverlayPanelViewModel;

    const { rerender } = render(<OverlayPanel view={synergyView} />);

    const coldCaseRow = screen.getByText("冰冷案例").closest(".overlay-compact-card-row") as HTMLElement;
    const kelthuzadRow = screen.getByText("天定之灾克尔苏加德").closest(".overlay-compact-card-row") as HTMLElement;
    const unrelatedRow = screen.getByText("无关卡牌").closest(".overlay-compact-card-row") as HTMLElement;

    fireEvent.mouseEnter(coldCaseRow);

    expect(kelthuzadRow).toHaveClass("is-synergy-related");
    expect(kelthuzadRow).toHaveAttribute("data-card-related", "true");
    expect(kelthuzadRow).toHaveAttribute("data-synergy-marker", "配");
    expect(kelthuzadRow).toHaveAttribute("title", "与当前卡牌有配合");
    expect(coldCaseRow).not.toHaveClass("is-synergy-related");
    expect(unrelatedRow).not.toHaveClass("is-synergy-related");

    fireEvent.mouseLeave(coldCaseRow);

    expect(kelthuzadRow).not.toHaveClass("is-synergy-related");
    expect(kelthuzadRow).not.toHaveAttribute("data-card-related");
    expect(kelthuzadRow).not.toHaveAttribute("data-synergy-marker");
    expect(kelthuzadRow).not.toHaveAttribute("title");

    fireEvent.mouseEnter(coldCaseRow);
    expect(kelthuzadRow).toHaveClass("is-synergy-related");

    rerender(<OverlayPanel view={{ ...synergyView, remainingDeck: [] }} />);

    expect(screen.getByText("天定之灾克尔苏加德").closest(".overlay-compact-card-row"))
      .not.toHaveClass("is-synergy-related");

    rerender(<OverlayPanel view={synergyView} />);

    expect(screen.getByText("天定之灾克尔苏加德").closest(".overlay-compact-card-row"))
      .not.toHaveClass("is-synergy-related");
  });

  it("does not confuse distinct cards that share the same display name", () => {
    const sameNameView: OverlayPanelViewModel = {
      ...view,
      remainingDeck: [
        {
          id: "source-card",
          name: "配合来源卡",
          count: 1,
          details: {
            dbfId: 2001,
            name: "配合来源卡",
            isSpell: true,
            relatedCards: [],
            synergyCards: [{ dbfId: 78394, cardId: "REV_514", name: "天定之灾克尔苏加德", reason: "测试配合" }]
          }
        }
      ],
      handCards: [
        {
          id: "different-same-name-card",
          name: "天定之灾克尔苏加德",
          count: 1,
          details: {
            dbfId: 96313,
            cardId: "REV_786",
            name: "天定之灾克尔苏加德",
            isSpell: false,
            relatedCards: []
          }
        }
      ],
      otherCards: []
    };

    render(<OverlayPanel view={sameNameView} />);

    fireEvent.mouseEnter(screen.getByText("配合来源卡").closest(".overlay-compact-card-row") as HTMLElement);

    expect(screen.getByText("天定之灾克尔苏加德").closest(".overlay-compact-card-row"))
      .not.toHaveClass("is-synergy-related");
  });

  it("treats existing related cards bidirectionally on keyboard focus and clears on blur", () => {
    const relatedView: OverlayPanelViewModel = {
      ...view,
      remainingDeck: [
        {
          id: "source-card",
          name: "关联来源卡",
          count: 1,
          details: {
            dbfId: 1001,
            name: "关联来源卡",
            isSpell: true,
            relatedCards: [{ dbfId: 1002, name: "关联目标卡" }]
          }
        }
      ],
      handCards: [],
      otherCards: [
        {
          id: "target-card",
          name: "关联目标卡",
          count: 1,
          details: {
            dbfId: 1002,
            name: "关联目标卡",
            isSpell: false,
            relatedCards: []
          }
        }
      ]
    };

    render(<OverlayPanel view={relatedView} />);

    const sourceRow = screen.getByText("关联来源卡").closest(".overlay-compact-card-row") as HTMLElement;
    const targetRow = screen.getByText("关联目标卡").closest(".overlay-compact-card-row") as HTMLElement;

    expect(targetRow).toHaveAttribute("tabindex", "0");

    fireEvent.focus(targetRow);

    expect(sourceRow).toHaveClass("is-synergy-related");
    expect(sourceRow).toHaveAttribute("data-card-related", "true");
    expect(sourceRow).toHaveAttribute("data-synergy-marker", "配");
    expect(sourceRow).toHaveAttribute("title", "与当前卡牌有配合");
    expect(targetRow).not.toHaveClass("is-synergy-related");

    fireEvent.blur(targetRow);

    expect(sourceRow).not.toHaveClass("is-synergy-related");
    expect(sourceRow).not.toHaveAttribute("data-card-related");
    expect(sourceRow).not.toHaveAttribute("data-synergy-marker");
    expect(sourceRow).not.toHaveAttribute("title");
  });
});
