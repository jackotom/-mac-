import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/renderer/App";
import type { PublicTrackerState } from "../src/shared/types";

const state: PublicTrackerState = {
  status: "watching",
  gameActive: true,
  logPath: "/Logs/Power.log",
  deck: [],
  opponentPlayed: [],
  events: [
    { id: "event-1", at: "2026-07-30T01:00:00.000Z", kind: "draw", player: "friendly", cardName: "火球术" },
    { id: "event-2", at: "2026-07-30T01:00:01.000Z", kind: "opponent-play", player: "opponent", cardName: "寒冰箭" },
    { id: "event-3", at: "2026-07-30T01:00:02.000Z", kind: "zone-change", player: "unknown" }
  ],
  summary: { totalCards: 30, remainingCards: 29, drawnCards: 1, opponentPlayedCount: 1 }
};

afterEach(() => {
  window.history.replaceState({}, "", "/");
  delete window.hearthstoneTracker;
});

function installApi() {
  window.hearthstoneTracker = {
    discoverLogs: vi.fn(async () => []),
    getState: vi.fn(async () => state),
    onUpdate: vi.fn(() => () => undefined)
  } as unknown as typeof window.hearthstoneTracker;
}

describe("truthful main-window event presentation", () => {
  it("shows unknown turn for every event instead of deriving 1, 2, 3 from array positions", async () => {
    installApi();
    render(<App />);
    await waitFor(() => expect(window.hearthstoneTracker?.getState).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: "实时对局" }));

    const feed = screen.getByRole("main", { name: "实时事件流" });
    expect(within(feed).getAllByText("回合 ?")).toHaveLength(3);
    expect(within(feed).queryByText(/^回合 [123]$/)).not.toBeInTheDocument();
  });

  it("labels the event count honestly instead of calling it parsed log lines", async () => {
    installApi();
    render(<App />);
    await waitFor(() => expect(window.hearthstoneTracker?.getState).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: "实时对局" }));
    const toolbar = screen.getByRole("banner", { name: "记牌器工具栏" });
    expect(toolbar).toHaveTextContent("事件 3");
    expect(toolbar).not.toHaveTextContent("3 行");
  });
});
