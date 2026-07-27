import { describe, expect, it, vi } from "vitest";
import {
  registerFriendlyOverlayIpc,
  type FriendlyOverlayIpcHost
} from "../src/main/friendlyOverlayIpc";

type IpcHandler = (event: { sender: unknown }, ...args: unknown[]) => unknown;

describe("friendly overlay IPC", () => {
  it("allows only the current friendly overlay to suppress and close itself", async () => {
    const handlers = new Map<string, IpcHandler>();
    const friendlySender = {};
    const calls: string[] = [];
    const host: FriendlyOverlayIpcHost = {
      isFriendlyOverlaySender: (sender) => sender === friendlySender,
      suppressCurrentContext: () => calls.push("suppress"),
      closeFriendlyOverlay: () => {
        calls.push("close");
      }
    };
    registerFriendlyOverlayIpc({
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }, host);
    const close = handlers.get("tracker:close-friendly-overlay");

    await expect(close?.({ sender: friendlySender })).resolves.toBeUndefined();
    expect(calls).toEqual(["suppress", "close"]);

    await expect(close?.({ sender: {} })).rejects.toThrow("无权关闭我方记牌小窗");
    expect(calls).toEqual(["suppress", "close"]);
  });

  it("waits for final bounds persistence before resolving close", async () => {
    const handlers = new Map<string, IpcHandler>();
    let finishClose!: () => void;
    let completed = false;
    registerFriendlyOverlayIpc({
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }, {
      isFriendlyOverlaySender: () => true,
      suppressCurrentContext: vi.fn(),
      closeFriendlyOverlay: () => new Promise<void>((resolve) => {
        finishClose = resolve;
      })
    });

    const close = handlers.get("tracker:close-friendly-overlay");
    const request = Promise.resolve(close?.({ sender: {} })).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    finishClose();
    await request;
    expect(completed).toBe(true);
  });
});
