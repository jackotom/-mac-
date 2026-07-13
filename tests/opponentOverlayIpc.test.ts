import { describe, expect, it, vi } from "vitest";
import {
  registerOpponentOverlayIpc,
  type OpponentOverlayIpcHost
} from "../src/main/opponentOverlayIpc";

type IpcHandler = (event: { sender: unknown }, ...args: unknown[]) => unknown;

function makeIpcMain() {
  const handlers = new Map<string, IpcHandler>();
  return {
    handlers,
    ipcMain: {
      handle(channel: string, handler: IpcHandler) {
        handlers.set(channel, handler);
      }
    }
  };
}

describe("opponent overlay IPC", () => {
  it("accepts collapse requests only from the opponent overlay window", async () => {
    const opponentSender = {};
    const collapse = vi.fn(async () => true);
    const host: OpponentOverlayIpcHost = {
      isOpponentOverlaySender: (sender) => sender === opponentSender,
      isCollapsed: () => false,
      collapse,
      expand: vi.fn(async () => false)
    };
    const fixture = makeIpcMain();
    registerOpponentOverlayIpc(fixture.ipcMain, host);
    const setCollapsed = fixture.handlers.get("tracker:set-opponent-overlay-collapsed");

    await expect(setCollapsed?.({ sender: opponentSender }, true)).resolves.toBe(true);
    await expect(setCollapsed?.({ sender: {} }, true)).rejects.toThrow("无权修改对手小窗");
    expect(collapse).toHaveBeenCalledOnce();
  });

  it("returns the main-process state and routes restore requests back through the same host", async () => {
    const opponentSender = {};
    const expand = vi.fn(async () => false);
    const host: OpponentOverlayIpcHost = {
      isOpponentOverlaySender: (sender) => sender === opponentSender,
      isCollapsed: () => true,
      collapse: vi.fn(async () => true),
      expand
    };
    const fixture = makeIpcMain();
    registerOpponentOverlayIpc(fixture.ipcMain, host);
    const getCollapsed = fixture.handlers.get("tracker:get-opponent-overlay-collapsed");
    const setCollapsed = fixture.handlers.get("tracker:set-opponent-overlay-collapsed");

    await expect(getCollapsed?.({ sender: opponentSender })).resolves.toBe(true);
    await expect(setCollapsed?.({ sender: opponentSender }, false)).resolves.toBe(false);
    expect(expand).toHaveBeenCalledWith(false);
  });
});
