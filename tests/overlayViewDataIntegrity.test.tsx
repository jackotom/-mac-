import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import { toOverlayPanelViewModel } from "../src/renderer/overlayView";
import type { PublicTrackerState, TrackerZoneCard } from "../src/shared/types";

function trackerState({
  deck = [],
  friendlyHand = [],
  friendlyOther = [],
  totalCards = 30,
  remainingCards = 18
}: {
  readonly deck?: PublicTrackerState["deck"];
  readonly friendlyHand?: readonly TrackerZoneCard[];
  readonly friendlyOther?: readonly TrackerZoneCard[];
  readonly totalCards?: number;
  readonly remainingCards?: number;
} = {}): PublicTrackerState {
  return {
    status: "watching",
    gameActive: true,
    deck,
    friendlyHand: [...friendlyHand],
    friendlyOther: [...friendlyOther],
    opponentPlayed: [],
    events: [],
    summary: {
      totalCards,
      remainingCards,
      drawnCards: totalCards - remainingCards,
      opponentPlayedCount: 0
    }
  };
}

describe("overlay view data integrity", () => {
  it("does not amplify a normal friendly-other row count", () => {
    const view = toOverlayPanelViewModel(trackerState({
      friendlyOther: [{ name: "场外测试牌", count: 1 }]
    }));

    expect(view.otherCards).toEqual([
      expect.objectContaining({ name: "场外测试牌", count: 1 })
    ]);
  });

  it("passes a suspicious friendly-other count through unchanged for diagnosis", () => {
    const view = toOverlayPanelViewModel(trackerState({
      friendlyOther: [{ name: "异常来源实体", count: 967 }]
    }));

    expect(view.otherCards).toEqual([
      expect.objectContaining({ name: "异常来源实体", count: 967 })
    ]);
  });

  it("keeps hand and other totals identical across the full renderer chain", () => {
    const initialState = trackerState({
      friendlyHand: [{ name: "已知手牌", count: 1 }],
      friendlyOther: [{ name: "异常来源实体", count: 967 }]
    });
    const nextState = trackerState({
      friendlyHand: [{ name: "已知手牌", count: 1 }],
      friendlyOther: [{ name: "异常来源实体", count: 5696 }]
    });
    const { rerender } = render(<OverlayPanel view={toOverlayPanelViewModel(initialState)} />);

    expect(screen.getByRole("region", { name: "手牌中 1 张" })).toHaveTextContent("手牌中 (1)");
    expect(screen.getByRole("region", { name: "其他 967 张" })).toHaveTextContent("其他 (967)");

    rerender(<OverlayPanel view={toOverlayPanelViewModel(nextState)} />);

    expect(screen.getByRole("region", { name: "手牌中 1 张" })).toHaveTextContent("手牌中 (1)");
    expect(screen.getByRole("region", { name: "其他 5696 张" })).toHaveTextContent("其他 (5696)");
  });

  it("shows all five hand cards when the input state contains five", () => {
    render(<OverlayPanel view={toOverlayPanelViewModel(trackerState({
      friendlyHand: [
        { name: "手牌一", count: 1 },
        { name: "手牌二", count: 2 },
        { name: "手牌三", count: 2 }
      ]
    }))} />);

    expect(screen.getByRole("region", { name: "手牌中 5 张" })).toHaveTextContent("手牌中 (5)");
  });

  it("does not present an unknown active deck count as zero", () => {
    const view = toOverlayPanelViewModel(trackerState({
      totalCards: 0,
      remainingCards: 0,
      friendlyHand: [{ name: "已知手牌", count: 1 }],
      friendlyOther: [{ name: "已知其他区牌", count: 1 }]
    }));

    expect(view.deckIdentity.status).toBe("waiting");
    expect(view.summary.remainingCards).toBeUndefined();

    render(<OverlayPanel view={view} />);

    expect(screen.getByLabelText("牌库剩余待识别")).toHaveTextContent("?");
    expect(screen.getByRole("region", { name: "牌库中 待识别" })).toHaveTextContent("牌库中 (待识别)");
    expect(screen.getByRole("region", { name: "牌库中 待识别" })).toHaveTextContent("牌库数量待识别");
    expect(screen.queryByText("牌库中暂无卡牌")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "牌库中 0 张" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "手牌中 1 张" })).toHaveTextContent("已知手牌");
    expect(screen.getByRole("region", { name: "其他 1 张" })).toHaveTextContent("已知其他区牌");
  });

  it("keeps a recognized empty deck as a real zero", () => {
    const state = trackerState({
      deck: [{ name: "已抽空牌库", count: 30, remaining: 0, drawn: 30, played: 0 }],
      totalCards: 30,
      remainingCards: 0
    });
    state.autoMatchedDeckId = "recognized-empty-deck";
    state.deckName = "已识别套牌";

    render(<OverlayPanel view={toOverlayPanelViewModel(state)} />);

    expect(screen.getByLabelText("牌库剩余")).toHaveTextContent("0");
    expect(screen.getByRole("region", { name: "牌库中 0 张" })).toHaveTextContent("牌库中 (0)");
    expect(screen.getByText("牌库中暂无卡牌")).toBeInTheDocument();
  });

  it("labels constructed recognition and recognition errors without claiming zero cards", () => {
    const recognizingState = trackerState({ totalCards: 0, remainingCards: 0 });
    recognizingState.gameActive = false;
    recognizingState.constructedScreenMode = "standard";
    const { rerender } = render(<OverlayPanel view={toOverlayPanelViewModel(recognizingState)} />);

    expect(screen.getByLabelText("牌库剩余识别中")).toHaveTextContent("?");
    expect(screen.getByRole("region", { name: "牌库中 识别中" })).toHaveTextContent("正在识别牌库");

    rerender(
      <OverlayPanel
        view={toOverlayPanelViewModel({
          ...recognizingState,
          error: "请允许录制屏幕"
        })}
      />
    );

    expect(screen.getByLabelText("牌库剩余不可用")).toHaveTextContent("?");
    expect(screen.getByRole("region", { name: "牌库中 不可用" })).toHaveTextContent("牌库数据不可用");
  });

  it("does not invent or filter deck rows when the summary and source rows disagree", () => {
    const missingRows = toOverlayPanelViewModel(trackerState({ deck: [], remainingCards: 18 }));
    const knownRow = toOverlayPanelViewModel(trackerState({
      deck: [{
        name: "已知牌库牌",
        cardId: "TEST_DECK_001",
        count: 18,
        remaining: 18,
        drawn: 0,
        played: 0
      }],
      remainingCards: 18
    }));

    expect(missingRows.summary.remainingCards).toBe(18);
    expect(missingRows.remainingDeck).toEqual([]);
    expect(knownRow.remainingDeck).toEqual([
      expect.objectContaining({ name: "已知牌库牌", count: 18, detail: "剩 18/18" })
    ]);
  });
});
