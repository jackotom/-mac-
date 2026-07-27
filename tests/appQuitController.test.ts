import { describe, expect, it, vi } from "vitest";

import { AppQuitController } from "../src/main/appQuitController";

describe("AppQuitController", () => {
  it("blocks repeated quit requests until one cleanup finishes, then allows the real quit", async () => {
    let releaseCleanup: (() => void) | undefined;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    const cleanup = vi.fn(async () => cleanupGate);
    const quit = vi.fn();
    const controller = new AppQuitController({ cleanup, quit });
    const firstEvent = { preventDefault: vi.fn() };
    const repeatedEvent = { preventDefault: vi.fn() };

    controller.handleBeforeQuit(firstEvent);
    controller.handleBeforeQuit(repeatedEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();

    releaseCleanup?.();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

    const recursiveEvent = { preventDefault: vi.fn() };
    controller.handleBeforeQuit(recursiveEvent);
    expect(recursiveEvent.preventDefault).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  });

  it("reports cleanup failure and still releases the application once", async () => {
    const error = new Error("disk failure");
    const onError = vi.fn();
    const quit = vi.fn();
    const controller = new AppQuitController({
      cleanup: vi.fn(async () => { throw error; }),
      quit,
      onError
    });
    const event = { preventDefault: vi.fn() };

    controller.handleBeforeQuit(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith(error);
  });
});
