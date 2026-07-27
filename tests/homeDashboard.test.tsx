import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeDashboard } from "../src/renderer/components/HomeDashboard";
import type { LadderDeckRecommendationResult } from "../src/shared/ladderDeckRecommendation";
import type { MatchHistoryResult, PublicTrackerState } from "../src/shared/types";

const liveState: PublicTrackerState = {
  status: "watching",
  gameActive: true,
  trackerMode: "arena",
  deckName: "真实竞技场套牌",
  deck: [
    { name: "火球术", cardId: "CS2_029", count: 2, remaining: 1, drawn: 1, played: 0 },
    { name: "寒冰箭", cardId: "CS2_024", count: 2, remaining: 2, drawn: 0, played: 0 }
  ],
  opponentPlayed: [],
  events: [],
  summary: { totalCards: 30, remainingCards: 27, drawnCards: 3, opponentPlayedCount: 2 },
  arena: {
    status: "drafting",
    hero: { name: "法师" },
    currentChoices: [],
    picks: [],
    deck: [],
    draftCount: 18,
    unresolvedCount: 2,
    scoreSource: "HearthArena 简中"
  }
};

const history: MatchHistoryResult = {
  status: "ok",
  matches: [
    { id: "older", result: "loss", mode: "wild", deckName: "奥秘法", endedAt: "2026-07-21T10:00:00.000Z" },
    { id: "newer", result: "win", mode: "arena", deckName: "上一副竞技场套牌", endedAt: "2026-07-22T04:00:00.000Z" }
  ],
  summary: { total: 2, wins: 1, losses: 1, ties: 0, winRate: 0.5 }
};

const ladder: LadderDeckRecommendationResult = {
  status: "ready",
  stale: false,
  gameVersion: "31.2.2",
  recommendation: {
    id: "real-standard",
    mode: "standard",
    region: "CN",
    patch: "31.2.2",
    name: "当前版本真实推荐",
    className: "死亡骑士",
    winRate: 56.3,
    games: 1248,
    deckCode: "REAL-DECK-CODE",
    cards: [],
    source: { name: "国服天梯统计", url: "https://example.com/source" },
    updatedAt: "2026-07-22T03:00:00.000Z"
  }
};

describe("home dashboard", () => {
  it("shows one calm waiting message after Hearthstone is recognized", () => {
    render(
      <HomeDashboard
        state={{
          ...liveState,
          gameActive: false,
          arena: undefined,
          error: "已识别炉石，等待开局。"
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "已识别炉石，等待开局" })).toBeInTheDocument();
    expect(screen.getByText("日志正常")).toBeInTheDocument();
    expect(screen.queryByText("需要完成日志设置")).not.toBeInTheDocument();
    expect(screen.queryByText(/先点修复日志/)).not.toBeInTheDocument();
  });

  it("renders four real data areas and copies the trusted recommendation code", async () => {
    const onCopy = vi.fn(async () => undefined);
    render(
      <HomeDashboard
        state={liveState}
        matchHistory={history}
        ladderRecommendation={ladder}
        onCopyLadderDeckCode={onCopy}
      />
    );

    const activity = screen.getByRole("article", { name: "游戏动态" });
    expect(activity).toHaveTextContent("对局进行中");
    expect(activity).toHaveTextContent("胜利上一副竞技场套牌竞技场");

    const ladderPanel = screen.getByRole("article", { name: "天梯推荐" });
    expect(ladderPanel).toHaveTextContent("当前版本真实推荐");
    expect(ladderPanel).toHaveTextContent("胜率56.3%");
    expect(ladderPanel).toHaveTextContent("统计场次1,248");
    fireEvent.click(within(ladderPanel).getByRole("button", { name: "复制卡组代码" }));
    await waitFor(() => expect(onCopy).toHaveBeenCalledWith("REAL-DECK-CODE"));
    expect(within(ladderPanel).getByRole("button", { name: "已复制卡组代码" })).toBeInTheDocument();

    const arena = screen.getByRole("article", { name: "竞技场概览" });
    expect(arena).toHaveTextContent("英雄法师");
    expect(arena).toHaveTextContent("选牌进度已确认 18 张");
    expect(arena).toHaveTextContent("评分来源HearthArena 简中");

    const deck = screen.getByRole("article", { name: "当前套牌" });
    expect(deck).toHaveTextContent("真实竞技场套牌");
    expect(deck).toHaveTextContent("牌库剩余27");
    expect(deck).toHaveTextContent("火球术×1");

    expect(screen.queryByText(/游戏资讯|玩家排行|热门卡组/)).not.toBeInTheDocument();
  });

  it("shows explicit empty and unavailable states without fake values", () => {
    const emptyState: PublicTrackerState = {
      status: "missing-log",
      error: "缺少 Power.log。",
      deck: [],
      opponentPlayed: [],
      events: [],
      summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 }
    };
    const unavailable: LadderDeckRecommendationResult = {
      status: "unavailable",
      errorCode: "patch-unavailable",
      message: "当前版本没有可信的国服数据。"
    };

    render(<HomeDashboard state={emptyState} ladderRecommendation={unavailable} />);

    expect(screen.getByRole("heading", { name: "需要完成日志设置" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "游戏动态" })).toHaveTextContent("尚未读取对局历史。");
    expect(screen.getByRole("article", { name: "游戏动态" })).toHaveTextContent("天梯推荐：当前版本没有可信的国服数据。");
    expect(screen.queryByRole("article", { name: "天梯推荐" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "竞技场概览" })).toHaveTextContent("尚未进入竞技场选牌。");
    expect(screen.getByRole("article", { name: "当前套牌" })).toHaveTextContent("还没有可用的 Power.log。");
    expect(screen.queryByRole("button", { name: "复制卡组代码" })).not.toBeInTheDocument();
  });

  it("distinguishes an initial history read from a failed read", () => {
    const preview = render(<HomeDashboard state={liveState} matchHistoryLoading />);
    const activity = screen.getByRole("article", { name: "游戏动态" });

    expect(within(activity).getByRole("status")).toHaveTextContent("正在读取最近完成的对局…");
    expect(screen.queryByText("尚未读取对局历史。")).not.toBeInTheDocument();

    preview.rerender(<HomeDashboard state={liveState} matchHistoryError="读取对局历史失败，请稍后重试。" />);
    expect(within(activity).getByRole("alert")).toHaveTextContent("读取对局历史失败，请稍后重试。");
  });

  it("uses current real tracker data instead of two large empty panels", () => {
    const emptyHistory: MatchHistoryResult = {
      status: "ok",
      matches: [],
      summary: { total: 0, wins: 0, losses: 0, ties: 0, winRate: 0 }
    };
    const unavailable: LadderDeckRecommendationResult = {
      status: "unavailable",
      errorCode: "source-unconfigured",
      message: "暂无经过验证的国服公开统计接口。"
    };

    const { container } = render(
      <HomeDashboard state={{ ...liveState, gameActive: false }} matchHistory={emptyHistory} ladderRecommendation={unavailable} />
    );

    const activity = screen.getByRole("article", { name: "游戏动态" });
    expect(activity).toHaveTextContent("竞技场选牌中");
    expect(activity).toHaveTextContent("已确认 18 张 · 待识别 2 张");
    expect(activity).toHaveTextContent("天梯推荐：暂无经过验证的国服公开统计接口。");
    expect(screen.queryByRole("article", { name: "天梯推荐" })).not.toBeInTheDocument();
    expect(container.querySelector(".home-dashboard-grid")).toHaveClass("is-ladder-unavailable");
  });

  it("shows recent real tracker events when no completed match exists", () => {
    const emptyHistory: MatchHistoryResult = {
      status: "ok",
      matches: [],
      summary: { total: 0, wins: 0, losses: 0, ties: 0, winRate: 0 }
    };
    const state: PublicTrackerState = {
      ...liveState,
      events: [{ id: "draw-1", at: "12:03:00", kind: "draw", player: "friendly", cardName: "火球术" }]
    };

    render(<HomeDashboard state={state} matchHistory={emptyHistory} />);

    const activity = screen.getByRole("article", { name: "游戏动态" });
    expect(activity).toHaveTextContent("最近事件");
    expect(activity).toHaveTextContent("抽到火球术");
  });

  it("formats history win-rate ratios as percentages while preserving percentage inputs", () => {
    const ratioHistory: MatchHistoryResult = {
      status: "ok",
      matches: history.matches,
      summary: { total: 17, wins: 6, losses: 11, ties: 0, winRate: 6 / 17 }
    };
    const preview = render(<HomeDashboard state={liveState} matchHistory={ratioHistory} />);

    expect(screen.getByRole("article", { name: "对局记录" })).toHaveTextContent("胜率35.3%");

    preview.rerender(
      <HomeDashboard
        state={liveState}
        matchHistory={{
          ...ratioHistory,
          summary: { ...ratioHistory.summary, winRate: 35.3 }
        }}
      />
    );
    expect(screen.getByRole("article", { name: "对局记录" })).toHaveTextContent("胜率35.3%");
  });
});
