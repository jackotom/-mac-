import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toCardTrackingView } from "../src/renderer/cardTrackingView";
import { OpponentOverlayPanel } from "../src/renderer/components/OpponentOverlayPanel";
import type { OverlayCardTrackingView, OverlayPanelViewModel, OverlaySecretSlot } from "../src/renderer/types";
import { createEmptyCardTracking } from "./fixtures/publicTrackerState";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  delete window.hearthstoneTracker;
});

function opponentTracking(
  secretSlots: readonly OverlaySecretSlot[] = [],
  handTotal = 5
): OverlayCardTrackingView {
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
        totalCount: handTotal,
        countLabel: String(handTotal),
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

  it("renders exact public deck and hand totals from real tracking state", () => {
    const tracking = structuredClone(createEmptyCardTracking("opponent-counts"));
    const current = tracking.opponent.current as unknown as Record<string, unknown>;
    current.deck = { status: "partial", knownCount: 0, totalCount: 22, cards: [] };
    current.hand = {
      status: "partial",
      knownCount: 1,
      totalCount: 6,
      cards: [{ cardKey: "id:known-hand", name: "已知手牌", count: 1 }]
    };
    const cardTracking = toCardTrackingView(tracking, "opponent", { showSecretCandidates: true });

    render(<OpponentOverlayPanel view={view(cardTracking)} isCollapsed={false} />);

    expect(screen.getByLabelText("对手概览")).toHaveTextContent("牌库 22");
    expect(screen.getByLabelText("对手概览")).toHaveTextContent("手牌 6");
  });

  it("shows the full secret effect when a candidate is hovered", () => {
    const showCardPreview = vi.fn(async () => undefined);
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview: vi.fn(async () => undefined)
      }
    });
    window.history.replaceState({}, "", "/?opponent-overlay=1");
    const details = {
      dbfId: 585,
      cardId: "EX1_287",
      name: "法术反制",
      manaCost: 3,
      cardType: "法术",
      text: "当你的对手施放一个法术时，反制该法术。",
      isSpell: true,
      relatedCards: []
    };
    const secret: OverlaySecretSlot = {
      id: "slot-1",
      label: "? 1",
      candidates: [
        { id: "EX1_287", name: "法术反制", status: "possible", details },
        { id: "EX1_289", name: "寒冰屏障", status: "excluded" }
      ]
    };
    render(<OpponentOverlayPanel view={view(opponentTracking([secret]))} isCollapsed={false} />);

    fireEvent.mouseEnter(screen.getByText("法术反制"));

    expect(showCardPreview).toHaveBeenCalledWith({
      details,
      anchorRect: expect.objectContaining({
        left: expect.any(Number),
        top: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number)
      })
    });
    expect(screen.getByText("已排除")).toBeInTheDocument();
  });

  it("does not open an empty preview for a candidate without card details", () => {
    const showCardPreview = vi.fn(async () => undefined);
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        showCardPreview,
        hideCardPreview: vi.fn(async () => undefined)
      }
    });
    window.history.replaceState({}, "", "/?opponent-overlay=1");
    const secret: OverlaySecretSlot = {
      id: "slot-1",
      label: "? 1",
      candidates: [{ id: "UNKNOWN", name: "未知奥秘", status: "possible" }]
    };
    render(<OpponentOverlayPanel view={view(opponentTracking([secret]))} isCollapsed={false} />);

    fireEvent.mouseEnter(screen.getByText("未知奥秘"));

    expect(showCardPreview).not.toHaveBeenCalled();
  });

  it("shows the opponent's inserted-deck counts without listing generated card names", () => {
    render(<OpponentOverlayPanel view={view({
      ...opponentTracking(),
      deckInsertions: {
        groups: [{ sourceEntityId: "500", sourceName: "对手来源创建", remainingCount: 5 }],
        placements: [{ entityId: "501", position: "top" }]
      }
    })} isCollapsed={false} />);

    fireEvent.click(screen.getByRole("button", { name: /牌库.*\?/ }));
    expect(screen.getByLabelText("牌库生成记录")).toHaveTextContent("对手来源创建5张卡牌");
    expect(screen.getByLabelText("牌库位置记录")).toHaveTextContent("置顶：未知卡牌");
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

  it("shows only the active side from match pulse", () => {
    render(<OpponentOverlayPanel view={view(opponentTracking(), {
      matchPulse: {
        turn: 7,
        activeSide: "friendly",
        fullLabel: "第7回合 · 我方行动 · 法力5/7",
        compactLabel: "7回 · 我 · 5/7",
        actorLabel: "我方回合"
      }
    })} isCollapsed={false} />);

    const pulse = screen.getByLabelText("当前行动方");
    expect(pulse).toHaveTextContent("我方回合");
    expect(pulse).not.toHaveTextContent(/7|5\/7/);
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

  it("requests collapse changes but renders only the controlled value", () => {
    const onCollapsedChange = vi.fn();
    const preview = render(
      <OpponentOverlayPanel view={view()} isCollapsed={false} onCollapsedChange={onCollapsedChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "折叠对手小窗" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("已知手牌")).toBeInTheDocument();

    preview.rerender(<OpponentOverlayPanel view={view()} isCollapsed onCollapsedChange={onCollapsedChange} />);
    fireEvent.click(screen.getByRole("button", { name: "恢复对手小窗，0 个奥秘" }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it("updates the public hand count without replacing the revealed row", () => {
    const preview = render(<OpponentOverlayPanel view={view(opponentTracking([], 3))} isCollapsed={false} />);
    const revealedRow = screen.getByText("已知手牌").closest(".overlay-compact-card-row");
    expect(screen.getByText("未公开 ×2")).toBeInTheDocument();

    preview.rerender(<OpponentOverlayPanel view={view(opponentTracking([], 6))} isCollapsed={false} />);

    expect(screen.getByText("已知手牌").closest(".overlay-compact-card-row")).toBe(revealedRow);
    expect(screen.getByText("未公开 ×5")).toBeInTheDocument();
  });

  it("keeps card preview integration for a revealed lifecycle hand card", () => {
    const base = opponentTracking([], 2);
    const cardTracking = {
      ...base,
      current: {
        ...base.current,
        hand: {
          ...base.current.hand,
          cards: [{
            id: "known-hand",
            name: "火球术",
            count: 1,
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
          }]
        }
      }
    } satisfies OverlayCardTrackingView;
    render(<OpponentOverlayPanel view={view(cardTracking)} isCollapsed={false} />);

    fireEvent.mouseEnter(screen.getByText("火球术").closest(".overlay-compact-card-row") as HTMLElement);

    expect(screen.getByRole("tooltip")).toHaveTextContent("造成 6 点伤害。");
    expect(screen.getByText("未公开 ×1")).toBeInTheDocument();
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
