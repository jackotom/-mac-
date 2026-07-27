import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/renderer/App";

describe("opponent overlay collapsed-state sync", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: undefined
    });
  });

  it("uses the initial main-process state and follows later main-process changes", async () => {
    let notifyCollapsedChange: ((collapsed: boolean) => void) | undefined;
    const unsubscribe = vi.fn();

    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        discoverLogs: () => Promise.resolve([]),
        getState: () => new Promise<never>(() => undefined),
        getOpponentOverlayCollapsed: () => Promise.resolve(true),
        onOpponentOverlayCollapsedChange: (callback: (collapsed: boolean) => void) => {
          notifyCollapsedChange = callback;
          return unsubscribe;
        },
        onUpdate: () => () => undefined
      }
    });
    window.history.replaceState({}, "", "/?opponent-overlay=1&qa-opponent-demo=1");

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "恢复对手小窗，2 个奥秘" })).toBeInTheDocument();
    });

    act(() => notifyCollapsedChange?.(false));

    expect(screen.getByLabelText("对手记牌器置顶小窗")).toBeInTheDocument();

    act(() => notifyCollapsedChange?.(true));

    expect(screen.getByRole("button", { name: "恢复对手小窗，2 个奥秘" })).toBeInTheDocument();

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not let a late initial query overwrite a newer main-process event", async () => {
    let notifyCollapsedChange: ((collapsed: boolean) => void) | undefined;
    let resolveInitialState!: (collapsed: boolean) => void;

    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        discoverLogs: () => Promise.resolve([]),
        getState: () => new Promise<never>(() => undefined),
        getOpponentOverlayCollapsed: () => new Promise<boolean>((resolve) => {
          resolveInitialState = resolve;
        }),
        onOpponentOverlayCollapsedChange: (callback: (collapsed: boolean) => void) => {
          notifyCollapsedChange = callback;
          return () => undefined;
        },
        onUpdate: () => () => undefined
      }
    });
    window.history.replaceState({}, "", "/?opponent-overlay=1&qa-opponent-demo=1");

    render(<App />);

    act(() => notifyCollapsedChange?.(true));
    expect(screen.getByRole("button", { name: "恢复对手小窗，2 个奥秘" })).toBeInTheDocument();

    await act(async () => resolveInitialState(false));

    expect(screen.getByRole("button", { name: "恢复对手小窗，2 个奥秘" })).toBeInTheDocument();
  });

  it("updates secret visibility without closing or recreating the opponent window", async () => {
    let notifySecretPredictionChange: ((enabled: boolean) => void) | undefined;

    Object.defineProperty(window, "hearthstoneTracker", {
      configurable: true,
      value: {
        discoverLogs: () => Promise.resolve([]),
        getState: () => new Promise<never>(() => undefined),
        getOpponentOverlayCollapsed: () => Promise.resolve(false),
        onOpponentOverlayCollapsedChange: () => () => undefined,
        onOpponentSecretPredictionChange: (callback: (enabled: boolean) => void) => {
          notifySecretPredictionChange = callback;
          return () => undefined;
        },
        onUpdate: () => () => undefined
      }
    });
    window.history.replaceState(
      {},
      "",
      "/?opponent-overlay=1&qa-opponent-demo=1&show-secret-prediction=1"
    );

    render(<App />);
    expect(await screen.findByLabelText("对手奥秘")).toBeInTheDocument();

    act(() => notifySecretPredictionChange?.(false));
    expect(screen.queryByLabelText("对手奥秘")).not.toBeInTheDocument();
    expect(screen.getByLabelText("对手记牌器置顶小窗")).toBeInTheDocument();

    act(() => notifySecretPredictionChange?.(true));
    expect(screen.getByLabelText("对手奥秘")).toBeInTheDocument();
  });
});
