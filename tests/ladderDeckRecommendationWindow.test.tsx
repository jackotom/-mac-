import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LadderDeckRecommendationWindow } from "../src/renderer/App";
import type { LadderDeckRecommendation, LadderDeckRecommendationResult, LadderMode } from "../src/shared/ladderDeckRecommendation";

function recommendation(mode: LadderMode, name: string): LadderDeckRecommendation {
  return {
    id: `${mode}-1`, mode, region: "CN", patch: "36.0", name, className: "战士", winRate: 56,
    games: 200, deckCode: "AAECAQcCi6AE0LIHAA==", cards: [], source: { name: "测试源", url: "https://example.com" },
    updatedAt: "2026-07-12T00:00:00.000Z"
  };
}

describe("LadderDeckRecommendationWindow", () => {
  it("ignores a late initial response after the mode has switched", async () => {
    let resolveInitial!: (result: LadderDeckRecommendationResult) => void;
    let emit!: (mode: LadderMode, result: LadderDeckRecommendationResult) => void;
    const getLadderDeckRecommendation = vi.fn(() => new Promise<LadderDeckRecommendationResult>((resolve) => { resolveInitial = resolve; }));
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        getLadderDeckRecommendation,
        onLadderDeckRecommendationUpdate: (callback: typeof emit) => { emit = callback; return vi.fn(); }
      }
    });

    render(<LadderDeckRecommendationWindow searchParams={new URLSearchParams("mode=standard")} />);
    await act(async () => {
      emit("wild", { status: "ready", recommendation: recommendation("wild", "狂野新卡组"), stale: false });
    });
    await act(async () => {
      resolveInitial({ status: "ready", recommendation: recommendation("standard", "迟到的标准卡组"), stale: false });
    });

    expect(screen.getByLabelText("当前模式")).toHaveTextContent("狂野");
    expect(screen.getByRole("heading", { name: "狂野新卡组" })).toBeInTheDocument();
    expect(screen.queryByText("迟到的标准卡组")).not.toBeInTheDocument();
  });
});
