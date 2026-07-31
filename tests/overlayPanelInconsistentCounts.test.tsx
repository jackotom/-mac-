import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import { toOverlayPanelViewModel } from "../src/renderer/overlayView";
import { createEmptyCardTracking, createPublicTrackerState } from "./fixtures/publicTrackerState";

describe("OverlayPanel lifecycle counts", () => {
  it("uses validated lifecycle counts instead of conflicting legacy summaries", () => {
    const tracking = createEmptyCardTracking("truthful-counts");
    const current = tracking.friendly.current as unknown as Record<string, unknown>;
    current.deck = {
      status: "partial",
      knownCount: 1,
      totalCount: 18,
      cards: [{ cardKey: "known-deck", name: "已知牌库牌", count: 1 }]
    };
    current.hand = {
      status: "known",
      knownCount: 1,
      totalCount: 1,
      cards: [{ cardKey: "known-hand", name: "已知手牌", count: 1 }]
    };
    const state = createPublicTrackerState({
      status: "watching",
      gameActive: true,
      summary: { totalCards: 999, remainingCards: 999, drawnCards: 0, opponentPlayedCount: 0 },
      cardTracking: tracking
    });

    render(<OverlayPanel view={toOverlayPanelViewModel(state)} />);

    expect(screen.getByRole("region", { name: "牌库 18" })).toHaveTextContent("牌库 (18)");
    expect(screen.getByRole("region", { name: "手牌 1" })).toHaveTextContent("已知手牌");
    expect(screen.queryByText("999")).not.toBeInTheDocument();
  });
});
