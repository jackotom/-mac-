import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import { toOverlayPanelViewModel } from "../src/renderer/overlayView";
import { createEmptyCardTracking, createPublicTrackerState } from "./fixtures/publicTrackerState";

describe("friendly overlay deck-count states", () => {
  it("shows an unknown lifecycle deck count as unknown", () => {
    const emptyTracking = createEmptyCardTracking("unknown-deck");
    const tracking = {
      ...emptyTracking,
      friendly: {
        ...emptyTracking.friendly,
        current: {
          ...emptyTracking.friendly.current,
          deck: {
            status: "unknown" as const,
            knownCount: 0,
            cards: []
          }
        }
      }
    };
    const view = toOverlayPanelViewModel(createPublicTrackerState({
      status: "watching",
      gameActive: true,
      cardTracking: tracking
    }));

    render(<OverlayPanel view={view} />);

    expect(screen.getByLabelText("牌库剩余 ?")).toHaveTextContent("?");
    expect(screen.getByRole("region", { name: "牌库 ?" })).toBeInTheDocument();
  });

  it("keeps a confirmed empty lifecycle deck as a real zero", () => {
    const tracking = createEmptyCardTracking("empty-deck");
    const view = toOverlayPanelViewModel(createPublicTrackerState({
      status: "watching",
      gameActive: true,
      autoMatchedDeckId: "recognized-empty",
      deckName: "已识别套牌",
      cardTracking: tracking
    }));

    render(<OverlayPanel view={view} />);

    expect(screen.getByLabelText("牌库剩余 0")).toHaveTextContent("0");
    expect(screen.getByRole("region", { name: "牌库 0" })).toHaveTextContent("暂无记录");
  });
});
