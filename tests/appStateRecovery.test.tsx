import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/renderer/App";
import type { PublicTrackerState } from "../src/shared/types";
import { createEmptyCardTracking, createPublicTrackerState } from "./fixtures/publicTrackerState";

type StateListener = (state: unknown) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function stateWithCard(cardName: string): PublicTrackerState {
  const cardTracking = createEmptyCardTracking(`state-${cardName}`);
  const friendlyCurrent = cardTracking.friendly.current as unknown as Record<string, unknown>;
  friendlyCurrent.deck = {
    status: "known",
    knownCount: 1,
    totalCount: 1,
    cards: [{ cardKey: cardName, name: cardName, count: 1 }]
  };
  return createPublicTrackerState({
    status: "watching",
    gameActive: true,
    deck: [{ name: cardName, count: 1, remaining: 1, drawn: 0, played: 0 }],
    summary: { totalCards: 1, remainingCards: 1, drawnCards: 0, opponentPlayedCount: 0 },
    cardTracking
  });
}

function installApi(initialState: Promise<PublicTrackerState>) {
  let emit!: StateListener;
  window.hearthstoneTracker = {
    discoverLogs: vi.fn(async () => []),
    getState: vi.fn(() => initialState),
    onUpdate: vi.fn((listener: StateListener) => {
      emit = listener;
      return () => undefined;
    }),
    showCardPreview: vi.fn(async () => undefined),
    hideCardPreview: vi.fn(async () => undefined),
    onCardPreviewPinnedChange: vi.fn(() => () => undefined)
  } as unknown as typeof window.hearthstoneTracker;
  return { emit: (state: unknown) => emit(state) };
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  delete window.hearthstoneTracker;
  vi.restoreAllMocks();
});

describe("tracker state recovery", () => {
  it("applies a valid initial state after an invalid live update", async () => {
    const initial = deferred<PublicTrackerState>();
    const api = installApi(initial.promise);
    window.history.replaceState({}, "", "/?overlay=1");
    render(<App />);

    act(() => api.emit({ ...stateWithCard("损坏状态"), deck: [null] }));
    await act(async () => initial.resolve(stateWithCard("合法初始牌")));
    expect(await screen.findByText("合法初始牌")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("keeps the last valid state after an invalid update and recovers on the next valid update", async () => {
    const initialState = stateWithCard("上次有效牌");
    const api = installApi(Promise.resolve(initialState));
    window.history.replaceState({}, "", "/?overlay=1");
    render(<App />);

    expect(await screen.findByText("上次有效牌")).toBeInTheDocument();
    act(() => api.emit({ ...initialState, events: [null] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("状态数据无效");
    expect(screen.getByText("上次有效牌")).toBeInTheDocument();

    act(() => api.emit(stateWithCard("恢复后的牌")));
    expect(await screen.findByText("恢复后的牌")).toBeInTheDocument();
    expect(screen.queryByText("上次有效牌")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("does not let a delayed initial state overwrite a valid live update", async () => {
    const initial = deferred<PublicTrackerState>();
    const api = installApi(initial.promise);
    window.history.replaceState({}, "", "/?overlay=1");
    render(<App />);

    act(() => api.emit(stateWithCard("实时状态牌")));
    await act(async () => initial.resolve(stateWithCard("延迟初始牌")));
    await waitFor(() => expect(screen.queryByText("延迟初始牌")).not.toBeInTheDocument());
    expect(screen.getByText("实时状态牌")).toBeInTheDocument();
  });
});
