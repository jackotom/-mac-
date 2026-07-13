import { describe, expect, it, vi } from "vitest";
import {
  createSynchronousActionLock,
  selectVisibleNotice,
  shouldRequestCardLibrary
} from "../src/renderer/frontendStability";
import { parsePublicTrackerState } from "../src/renderer/runtimeValidation";

describe("frontend stability helpers", () => {
  it("shows initialization errors before live errors and notices", () => {
    expect(selectVisibleNotice("初始化失败", "实时失败", "普通提示")).toEqual({ message: "初始化失败", role: "alert" });
  });

  it("shows live errors before ordinary notices", () => {
    expect(selectVisibleNotice(undefined, "实时失败", "普通提示")).toEqual({ message: "实时失败", role: "alert" });
  });

  it("does not request for an unchanged debounced card query", () => {
    expect(shouldRequestCardLibrary(
      { query: "火", page: 1, pageSize: 48 },
      { query: "火", page: 1, pageSize: 48 }
    )).toBe(false);
  });

  it("locks an action synchronously before React can rerender", async () => {
    let release!: () => void;
    const task = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }))
      .mockResolvedValue(undefined);
    const lock = createSynchronousActionLock();
    const first = lock.run(task);
    const second = lock.run(task);
    expect(task).toHaveBeenCalledOnce();
    expect(second).toBeUndefined();
    release();
    await first;
    await lock.run(task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed tracker state at the renderer boundary", () => {
    expect(() => parsePublicTrackerState({ status: "watching", deck: "bad" })).toThrow(/状态数据无效/);
  });

  it("accepts the minimum valid tracker state", () => {
    const state = { status: "idle", deck: [], opponentPlayed: [], events: [], summary: { totalCards: 0, remainingCards: 0, drawnCards: 0, opponentPlayedCount: 0 } };
    expect(parsePublicTrackerState(state)).toEqual(state);
  });
});
