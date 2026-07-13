export interface WebContentsLike {
  readonly mainFrame: unknown;
}

export interface IpcEventLike {
  readonly sender: unknown;
  readonly senderFrame: unknown;
}

export function assertTrustedIpcEvent(event: IpcEventLike, trustedContents: ReadonlySet<unknown>): void {
  const sender = event.sender as Partial<WebContentsLike> | undefined;
  if (!sender || !trustedContents.has(sender) || !event.senderFrame || event.senderFrame !== sender.mainFrame) {
    throw new Error("拒绝来自不可信页面的请求");
  }
}

export function createSecureWebPreferences(preload: string, backgroundThrottling = true) {
  return {
    preload,
    contextIsolation: true as const,
    nodeIntegration: false as const,
    sandbox: true as const,
    backgroundThrottling
  };
}

interface NavigationWebContentsLike {
  getURL(): string;
  on(name: "will-navigate", handler: (event: { preventDefault(): void }, url: string) => void): void;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
}

export function configureSecureNavigation(window: { webContents: NavigationWebContentsLike }): void {
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
