import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicTrackerState } from "../src/shared/types";

const ratedState: PublicTrackerState = {
  status: "watching",
  deck: [],
  opponentPlayed: [],
  events: [],
  summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 },
  arena: {
    status: "drafting",
    hero: { name: "法师", className: "Mage" },
    draftCount: 0,
    unresolvedCount: 30,
    currentChoices: [
      {
        name: "候选一",
        cardId: "TEST_001",
        count: 1,
        rating: { pickRate: 41.2, firestone: { includedWinrate: 56.8 } }
      },
      {
        name: "候选二",
        cardId: "TEST_002",
        count: 1,
        rating: { pickRate: 37.5, firestone: { includedWinrate: 54.1 } }
      },
      {
        name: "候选三",
        cardId: "TEST_003",
        count: 1,
        rating: { pickRate: 29.8, firestone: { includedWinrate: 51.6 } }
      }
    ],
    picks: [],
    deck: []
  }
};

function installTrackerApi() {
  let emit!: (state: PublicTrackerState) => void;
  window.hearthstoneTracker = {
    discoverLogs: vi.fn(async () => []),
    getState: vi.fn(async () => ratedState),
    onUpdate: vi.fn((callback: (state: PublicTrackerState) => void) => {
      emit = callback;
      return () => undefined;
    })
  } as unknown as typeof window.hearthstoneTracker;
  return (state: PublicTrackerState) => emit(state);
}

function withoutChoiceStatistics(state: PublicTrackerState): PublicTrackerState {
  return {
    ...state,
    arena: state.arena
      ? {
          ...state.arena,
          lastUpdated: "2026-07-26T10:00:01.000Z",
          currentChoices: state.arena.currentChoices.map(({ name, cardId, count }) => ({ name, cardId, count }))
        }
      : undefined
  };
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  delete window.hearthstoneTracker;
});

describe("arena choice renderer state stability", () => {
  it("keeps same-card pick and win statistics in the dedicated overlay during a transient refresh", async () => {
    window.history.replaceState({}, "", "/?arena-choice-overlay=1");
    const emit = installTrackerApi();
    const { default: App } = await import("../src/renderer/App.js");

    render(<App />);

    const overlay = await screen.findByLabelText("竞技场选牌数据条");
    await waitFor(() => expect(within(overlay).getByText("41.2%")).toBeInTheDocument());

    act(() => emit(withoutChoiceStatistics(ratedState)));

    expect(within(overlay).getByText("41.2%")).toBeInTheDocument();
    expect(within(overlay).getByText("56.8%")).toBeInTheDocument();
  });

  it("keeps same-card pick and win statistics in ArenaPanel during a transient refresh", async () => {
    const emit = installTrackerApi();
    const { default: App } = await import("../src/renderer/App.js");

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "实时对局" }));

    const candidate = await screen.findByLabelText("候选一");
    const candidateRow = candidate.closest("li");
    expect(candidateRow).not.toBeNull();
    await waitFor(() => expect(within(candidateRow!).getByText("41.2%")).toBeInTheDocument());

    act(() => emit(withoutChoiceStatistics(ratedState)));

    expect(within(candidateRow!).getByText("41.2%")).toBeInTheDocument();
    expect(candidateRow).toHaveTextContent("入选胜率 56.8%");
  });
});
