import { opponentOverlayCollapsedUpdateChannel } from "./opponentOverlayIpc.js";
import type { OpponentOverlayWindowState, WindowBounds } from "./opponentOverlayWindowState.js";

interface OpponentOverlayWebContents {
  send(channel: string, collapsed: boolean): void;
}

export interface OpponentOverlayWindowLike {
  readonly webContents: OpponentOverlayWebContents;
  isDestroyed(): boolean;
  getBounds(): WindowBounds;
  setResizable(resizable: boolean): void;
  setMinimumSize(width: number, height: number): void;
  setBounds(bounds: WindowBounds, animate?: boolean): void;
  showInactive(): void;
  show(): void;
  focus(): void;
}

export interface OpponentOverlayWindowControllerHost {
  getWindow(): OpponentOverlayWindowLike | undefined;
  getState(): OpponentOverlayWindowState | undefined;
  saveExpandedBounds(bounds: WindowBounds): Promise<void>;
}

export class OpponentOverlayWindowController {
  constructor(private readonly host: OpponentOverlayWindowControllerHost) {}

  isOpponentOverlaySender(sender: unknown): boolean {
    const window = this.liveWindow();
    return Boolean(window && sender === window.webContents);
  }

  isCollapsed(): boolean {
    return this.host.getState()?.isCollapsed() ?? false;
  }

  showInactive(): boolean {
    const window = this.liveWindow();
    if (!window) return false;
    window.showInactive();
    return true;
  }

  async collapse(): Promise<boolean> {
    const session = this.liveSession();
    if (!session) {
      return false;
    }

    const { window, state } = session;
    if (!state.isCollapsed()) {
      state.updateExpandedBounds(window.getBounds());
      await this.host.saveExpandedBounds(state.currentBounds());
      window.setResizable(false);
      window.setMinimumSize(52, 38);
      window.setBounds(state.collapse(), false);
    }
    this.publish(window, state.isCollapsed());
    window.showInactive();
    return state.isCollapsed();
  }

  async expand(focus: boolean): Promise<boolean> {
    const session = this.liveSession();
    if (!session) {
      return false;
    }

    const { window, state } = session;
    window.setBounds(state.expand(), false);
    window.setMinimumSize(100, 150);
    window.setResizable(true);
    this.publish(window, state.isCollapsed());
    if (focus) {
      window.show();
      window.focus();
    } else {
      window.showInactive();
    }
    return state.isCollapsed();
  }

  private liveWindow(): OpponentOverlayWindowLike | undefined {
    const window = this.host.getWindow();
    return window && !window.isDestroyed() ? window : undefined;
  }

  private liveSession(): { window: OpponentOverlayWindowLike; state: OpponentOverlayWindowState } | undefined {
    const window = this.liveWindow();
    const state = this.host.getState();
    return window && state ? { window, state } : undefined;
  }

  private publish(window: OpponentOverlayWindowLike, collapsed: boolean): void {
    window.webContents.send(opponentOverlayCollapsedUpdateChannel, collapsed);
  }
}
