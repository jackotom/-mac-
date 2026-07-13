export const opponentOverlayCollapsedUpdateChannel = "tracker:opponent-overlay-collapsed:update";

interface IpcEventLike {
  readonly sender: unknown;
}

type IpcHandler = (event: IpcEventLike, ...args: unknown[]) => unknown;

export interface IpcMainLike {
  handle(channel: string, handler: IpcHandler): void;
}

export interface OpponentOverlayIpcHost {
  isOpponentOverlaySender(sender: unknown): boolean;
  isCollapsed(): boolean;
  collapse(): Promise<boolean>;
  expand(focus: boolean): Promise<boolean>;
}

export function registerOpponentOverlayIpc(ipcMain: IpcMainLike, host: OpponentOverlayIpcHost): void {
  ipcMain.handle("tracker:get-opponent-overlay-collapsed", async (event) => {
    assertOpponentOverlaySender(event.sender, host);
    return host.isCollapsed();
  });

  ipcMain.handle("tracker:set-opponent-overlay-collapsed", async (event, collapsed) => {
    assertOpponentOverlaySender(event.sender, host);
    if (typeof collapsed !== "boolean") {
      throw new Error("对手小窗折叠状态无效");
    }
    return collapsed ? host.collapse() : host.expand(false);
  });
}

function assertOpponentOverlaySender(sender: unknown, host: OpponentOverlayIpcHost): void {
  if (!host.isOpponentOverlaySender(sender)) {
    throw new Error("无权修改对手小窗");
  }
}
