import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LadderDeckRecommendationPanel,
  type LadderDeckRecommendation
} from "../src/renderer/components/LadderDeckRecommendationPanel";

const recommendation: LadderDeckRecommendation = {
  id: "standard-warrior",
  mode: "standard",
  region: "CN",
  patch: "36.0",
  name: "节奏战士",
  className: "战士",
  winRate: 58.4,
  games: 12_486,
  updatedAt: "2026-07-12T06:30:00.000Z",
  source: { name: "国服天梯统计", url: "https://example.com/source" },
  deckCode: "AAECAQcEtest-code",
  cards: [
    { name: "赤红深渊", cost: 1, count: 2 },
    { name: "礼盒雏龙", cost: 2, count: 1 }
  ]
};

describe("ladder deck recommendation panel", () => {
  it("shows loading state", () => {
    render(<LadderDeckRecommendationPanel mode="standard" isLoading onCopyDeckCode={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("正在获取标准模式推荐");
    expect(screen.getByLabelText("天梯推荐")).toHaveAttribute("aria-busy", "true");
  });

  it("shows a recommendation with mode, statistics, source, update time, and cards", () => {
    render(
      <LadderDeckRecommendationPanel
        mode="standard"
        gameVersion="36.0.246003"
        recommendation={recommendation}
        onCopyDeckCode={vi.fn()}
      />
    );

    expect(screen.getByLabelText("天梯推荐工具栏")).toHaveTextContent("天梯推荐");
    expect(screen.getByLabelText("当前模式")).toHaveTextContent("标准");
    expect(screen.getByLabelText("炉石版本")).toHaveTextContent("36.0.246003");
    expect(within(screen.getByLabelText("天梯推荐工具栏")).queryByLabelText("炉石版本")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "节奏战士" })).toBeInTheDocument();
    expect(screen.getByText("战士")).toBeInTheDocument();
    expect(screen.getByLabelText("胜率")).toHaveTextContent("58.4%");
    expect(screen.getByLabelText("统计场次")).toHaveTextContent("12,486");
    expect(screen.getByText("国服天梯统计")).toBeInTheDocument();
    expect(screen.getByText(/更新时间/)).toBeInTheDocument();

    const cardList = screen.getByRole("list", { name: "卡组牌表" });
    expect(within(cardList).getByText("赤红深渊")).toBeInTheDocument();
    expect(within(cardList).getByLabelText("数量 2")).toHaveTextContent("2");
    expect(within(cardList).queryByLabelText("数量 1")).not.toBeInTheDocument();
  });

  it("marks cached data without hiding the recommendation", () => {
    render(
      <LadderDeckRecommendationPanel
        mode="wild"
        recommendation={{ ...recommendation, mode: "wild" }}
        isCached
        onCopyDeckCode={vi.fn()}
      />
    );

    expect(screen.getByLabelText("当前模式")).toHaveTextContent("狂野");
    expect(screen.queryByLabelText("数据状态")).not.toBeInTheDocument();
    expect(screen.getByText(/缓存更新于/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "节奏战士" })).toBeInTheDocument();
  });

  it.each([
    ["installation-not-found", "未找到炉石", "请先启动一次炉石", true],
    ["version-unreadable", "无法读取版本", "无法确认当前炉石版本", true],
    ["source-unconfigured", "等待国服数据", "国服数据源尚未接入", false],
    ["network-failed", "网络更新失败", "暂时无法连接国服数据源", false],
    ["no-current-patch-data", "当前版本暂无推荐", "36.0 暂无达到最低场次的国服卡组", false],
    ["invalid-data", "数据校验失败", "推荐数据异常，已停止展示", false],
    ["cache-expired", "缓存已过期", "当前版本的本地数据已过期", false]
  ] as const)("shows the %s unavailable state", (code, title, message, canRetry) => {
    const onRetry = vi.fn();
    render(
      <LadderDeckRecommendationPanel
        mode="standard"
        gameVersion={code === "no-current-patch-data" ? "36.0" : undefined}
        unavailable={{ status: "unavailable", code, message }}
        onRetry={onRetry}
        onCopyDeckCode={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(title);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    const retry = screen.queryByRole("button", { name: "重新检测" });
    expect(Boolean(retry)).toBe(canRetry);
    if (retry) {
      fireEvent.click(retry);
      expect(onRetry).toHaveBeenCalledOnce();
    }
  });

  it("shows empty and error states clearly", () => {
    const { rerender } = render(
      <LadderDeckRecommendationPanel mode="standard" emptyMessage="暂无达到最低场次的卡组" onCopyDeckCode={vi.fn()} />
    );
    expect(screen.getByRole("status")).toHaveTextContent("暂无达到最低场次的卡组");

    rerender(
      <LadderDeckRecommendationPanel mode="standard" loadError="推荐数据暂时不可用" onCopyDeckCode={vi.fn()} />
    );
    expect(screen.getByRole("alert")).toHaveClass("ladder-deck-error");
  });

  it("copies the complete deck code and reports success", async () => {
    const onCopyDeckCode = vi.fn().mockResolvedValue(undefined);
    render(
      <LadderDeckRecommendationPanel
        mode="standard"
        recommendation={recommendation}
        onCopyDeckCode={onCopyDeckCode}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "复制卡组代码" }));

    expect(onCopyDeckCode).toHaveBeenCalledWith("AAECAQcEtest-code");
    expect(await screen.findByRole("button", { name: "已复制" })).toBeInTheDocument();
  });

  it("reports copy failure and permits retry", async () => {
    const onCopyDeckCode = vi.fn().mockRejectedValueOnce(new Error("clipboard unavailable")).mockResolvedValueOnce(undefined);
    render(
      <LadderDeckRecommendationPanel
        mode="standard"
        recommendation={recommendation}
        onCopyDeckCode={onCopyDeckCode}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "复制卡组代码" }));
    expect(await screen.findByRole("alert")).toHaveClass("ladder-deck-feedback", "is-error");
    expect(screen.getByRole("alert")).not.toHaveClass("ladder-deck-message");

    fireEvent.click(screen.getByRole("button", { name: "复制卡组代码" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument());
    expect(onCopyDeckCode).toHaveBeenCalledTimes(2);
  });

  it("styles and invokes the close button", () => {
    const onClose = vi.fn();
    render(
      <LadderDeckRecommendationPanel
        mode="standard"
        recommendation={recommendation}
        onCopyDeckCode={vi.fn()}
        onClose={onClose}
      />
    );

    const close = screen.getByRole("button", { name: "关闭推荐" });
    expect(close).toHaveClass("ladder-deck-close");
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
