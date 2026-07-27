interface IpcEventLike {
  readonly sender: unknown;
}

type IpcHandler = (event: IpcEventLike, ...args: unknown[]) => unknown;

export interface FriendlyOverlayIpcMain {
  handle(channel: string, handler: IpcHandler): void;
}

export interface FriendlyOverlayIpcHost {
  isFriendlyOverlaySender(sender: unknown): boolean;
  suppressCurrentContext(): void;
  closeFriendlyOverlay(): void | Promise<void>;
}

export function registerFriendlyOverlayIpc(
  ipcMain: FriendlyOverlayIpcMain,
  host: FriendlyOverlayIpcHost
): void {
  ipcMain.handle("tracker:close-friendly-overlay", async (event) => {
    if (!host.isFriendlyOverlaySender(event.sender)) {
      throw new Error("无权关闭我方记牌小窗");
    }
    host.suppressCurrentContext();
    await host.closeFriendlyOverlay();
  });
}
