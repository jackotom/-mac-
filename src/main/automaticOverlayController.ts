import type { PublicTrackerState } from "../shared/types.js";
import { isHearthstoneOrTrackerFrontmost } from "./frontmostApp.js";

export interface AutomaticOverlayHost {
  readonly getState: () => PublicTrackerState;
  readonly getFrontmostAppName: () => Promise<string | undefined>;
  readonly hasOverlayWindow: () => boolean;
  readonly isOverlayVisible: () => boolean;
  readonly isOverlayFocused: () => boolean;
  readonly isOverlayInteractionActive?: () => boolean;
  readonly createOverlayWindow: () => Promise<void>;
  readonly showOverlayWindow: () => void;
  readonly hideOverlayWindow: () => void;
}

export class AutomaticOverlayController {
  private monitor: NodeJS.Timeout | undefined;
  private refreshPromise: Promise<void> | undefined;
  private contextKey: string | undefined;
  private suppressedContextKey: string | undefined;

  constructor(private readonly host: AutomaticOverlayHost) {}

  start(intervalMs = 350) {
    if (this.monitor) {
      return;
    }

    void this.refresh();
    this.monitor = setInterval(() => {
      void this.refresh();
    }, intervalMs);
    this.monitor.unref();
  }

  stop() {
    if (this.monitor) {
      clearInterval(this.monitor);
      this.monitor = undefined;
    }
  }

  refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshOnce().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  suppressCurrentContext() {
    this.suppressedContextKey = resolveAutomaticOverlayContext(this.host.getState());
  }

  clearSuppression() {
    this.suppressedContextKey = undefined;
  }

  private async refreshOnce() {
    const frontmostAppName = await this.host.getFrontmostAppName();
    const nextContextKey = resolveAutomaticOverlayContext(this.host.getState());
    if (nextContextKey !== this.contextKey) {
      this.contextKey = nextContextKey;
      if (!matchesSuppressedContext(this.suppressedContextKey, nextContextKey)) {
        this.suppressedContextKey = undefined;
      }
    }

    const shouldShow = Boolean(
      nextContextKey &&
      !matchesSuppressedContext(this.suppressedContextKey, nextContextKey) &&
      (
        isHearthstoneOrTrackerFrontmost(frontmostAppName) ||
        this.host.isOverlayFocused() ||
        this.host.isOverlayInteractionActive?.()
      )
    );

    if (!shouldShow) {
      if (this.host.hasOverlayWindow() && this.host.isOverlayVisible()) {
        this.host.hideOverlayWindow();
      }
      return;
    }

    if (!this.host.hasOverlayWindow()) {
      await this.host.createOverlayWindow();
    }
    const latestContextKey = resolveAutomaticOverlayContext(this.host.getState());
    if (
      latestContextKey !== nextContextKey ||
      matchesSuppressedContext(this.suppressedContextKey, latestContextKey)
    ) {
      if (this.host.hasOverlayWindow() && this.host.isOverlayVisible()) {
        this.host.hideOverlayWindow();
      }
      return;
    }
    if (!this.host.isOverlayVisible()) {
      this.host.showOverlayWindow();
    }
  }
}

export function resolveAutomaticOverlayContext(state: PublicTrackerState): string | undefined {
  if (state.status !== "watching") {
    return undefined;
  }

  if (state.arena?.status && state.arena.status !== "inactive") {
    return "arena";
  }

  if (state.autoMatchedDeckId) {
    return `constructed-deck:${state.constructedScreenMode ?? "unknown"}:${state.autoMatchedDeckId}`;
  }

  if (state.constructedScreenMode) {
    return `constructed-waiting:${state.constructedScreenMode}`;
  }

  return state.gameActive ? "constructed-game:waiting" : undefined;
}

function matchesSuppressedContext(suppressedKey: string | undefined, nextKey: string | undefined) {
  if (!suppressedKey || !nextKey) {
    return false;
  }
  if (suppressedKey === nextKey) {
    return true;
  }

  const suppressedDeck = parseConstructedDeckContext(suppressedKey);
  const nextDeck = parseConstructedDeckContext(nextKey);
  return Boolean(
    suppressedDeck &&
    nextDeck &&
    suppressedDeck.deckId === nextDeck.deckId &&
    (suppressedDeck.mode === "unknown" || nextDeck.mode === "unknown")
  );
}

function parseConstructedDeckContext(key: string) {
  const match = key.match(/^constructed-deck:(standard|wild|unknown):(.+)$/);
  return match?.[1] && match[2]
    ? { mode: match[1] as "standard" | "wild" | "unknown", deckId: match[2] }
    : undefined;
}
