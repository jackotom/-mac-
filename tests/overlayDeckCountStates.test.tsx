import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverlayPanel } from "../src/renderer/components/OverlayPanel";
import { toOverlayPanelViewModel } from "../src/renderer/overlayView";
import { createEmptyCardTracking, createPublicTrackerState } from "./fixtures/publicTrackerState";

describe("friendly overlay deck-count states", () => {
  it.each([
    {
      label: "待识别",
      overrides: {},
      emptyText: "牌库数量待识别"
    },
    {
      label: "识别中",
      overrides: { constructedScreenMode: "standard" as const },
      emptyText: "正在识别牌库"
    },
    {
      label: "不可用",
      overrides: { constructedScreenMode: "standard" as const, error: "录屏权限被拒绝" },
      emptyText: "牌库数据不可用"
    }
  ])("keeps the $label meaning for an unknown lifecycle deck", ({ label, overrides, emptyText }) => {
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
      cardTracking: tracking,
      ...overrides
    }));

    render(<OverlayPanel view={view} />);

    expect(screen.getByLabelText(`牌库剩余${label}`)).toHaveTextContent("?");
    expect(screen.getByRole("region", { name: `牌库 ${label}` })).toHaveTextContent(emptyText);
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
