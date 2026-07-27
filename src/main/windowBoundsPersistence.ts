export class WindowBoundsPersistence<T> {
  private timer: NodeJS.Timeout | undefined;
  private pendingValue: T | undefined;
  private writeQueue: Promise<void> | undefined;

  constructor(
    private readonly save: (value: T) => Promise<void>,
    private readonly delayMs: number,
    private readonly onError: (error: unknown) => void = () => undefined
  ) {}

  schedule(value: T): void {
    this.pendingValue = value;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.delayMs);
    this.timer.unref?.();
  }

  flush(value?: T): Promise<void> {
    if (value !== undefined) this.pendingValue = value;
    this.clearTimer();
    if (this.pendingValue === undefined) return this.writeQueue ?? Promise.resolve();
    const nextValue = this.pendingValue;
    this.pendingValue = undefined;
    let operation: Promise<void>;
    try {
      operation = this.writeQueue
        ? this.writeQueue.then(() => this.save(nextValue))
        : this.save(nextValue);
    } catch (error) {
      this.reportError(error);
      operation = Promise.resolve();
    }
    this.writeQueue = operation.catch((error) => {
      this.reportError(error);
    });
    return this.writeQueue;
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private reportError(error: unknown): void {
    try {
      this.onError(error);
    } catch {
      // Persistence failures must never block window lifecycle operations.
    }
  }
}
