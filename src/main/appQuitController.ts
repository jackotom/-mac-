interface BeforeQuitEvent {
  preventDefault(): void;
}

interface AppQuitControllerOptions {
  readonly cleanup: () => Promise<void>;
  readonly quit: () => void;
  readonly onError?: (error: unknown) => void;
}

export class AppQuitController {
  private cleanupStarted = false;
  private released = false;

  constructor(private readonly options: AppQuitControllerOptions) {}

  handleBeforeQuit(event: BeforeQuitEvent) {
    if (this.released) {
      return;
    }

    event.preventDefault();
    if (this.cleanupStarted) {
      return;
    }

    this.cleanupStarted = true;
    void this.finishCleanup();
  }

  private async finishCleanup() {
    try {
      await this.options.cleanup();
    } catch (error) {
      try {
        this.options.onError?.(error);
      } catch {
        // Cleanup failures must never leave the application stuck in the quit guard.
      }
    } finally {
      this.released = true;
      this.options.quit();
    }
  }
}
