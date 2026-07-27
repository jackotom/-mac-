import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import type { OverlayPanelViewModel } from "../src/renderer/types";

function waitingView(
  overrides: Partial<OverlayPanelViewModel> = {}
): OverlayPanelViewModel {
  return {
    summary: { totalCards: 0, remainingCards: 0, drawnCards: 0 },
    deckIdentity: {
      name: "等待识别",
      status: "waiting",
      detail: "抽到或打出卡牌后自动匹配"
    },
    remainingDeck: [],
    handCards: [{ id: "known-hand", name: "已知手牌", count: 1 }],
    otherCards: [],
    recentDraws: [],
    opponentRecentPlays: [],
    status: {
      tone: "tracking",
      label: "监听中",
      detail: "正在监听日志",
      updatedAtLabel: "刚刚"
    },
    ...overrides
  };
}

describe("friendly overlay deck-count states", () => {
  it("labels an actively scanned deck as recognizing", () => {
    render(
      <OverlayPanel
        view={waitingView({
          deckIdentity: {
            name: "正在识别套牌",
            status: "waiting",
            detail: "标准套牌识别中"
          }
        })}
      />
    );

    expect(screen.getByLabelText("牌库剩余识别中")).toHaveTextContent("?");
    expect(screen.getByRole("region", { name: "牌库中 识别中" })).toHaveTextContent("正在识别牌库");
  });

  it("labels a failed unknown deck count as unavailable", () => {
    render(
      <OverlayPanel
        view={waitingView({
          status: {
            tone: "error",
            label: "识别失败",
            detail: "录屏权限被拒绝",
            updatedAtLabel: "刚刚"
          }
        })}
      />
    );

    expect(screen.getByLabelText("牌库剩余不可用")).toHaveTextContent("?");
    expect(screen.getByRole("region", { name: "牌库中 不可用" })).toHaveTextContent("牌库数据不可用");
  });

  it("keeps zero when an identified deck is truly empty", () => {
    render(
      <OverlayPanel
        view={waitingView({
          deckIdentity: {
            name: "测试套牌",
            status: "automatic",
            detail: "已自动识别当前对局"
          },
          handCards: []
        })}
      />
    );

    expect(screen.getByLabelText("牌库剩余")).toHaveTextContent("0");
    expect(screen.getByRole("region", { name: "牌库中 0 张" })).toHaveTextContent("牌库中暂无卡牌");
    expect(screen.queryByText("牌库数量待识别")).not.toBeInTheDocument();
  });
});
