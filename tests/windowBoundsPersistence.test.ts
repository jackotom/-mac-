import { describe, expect, it, vi } from "vitest";
import { WindowBoundsPersistence } from "../src/main/windowBoundsPersistence";

describe("WindowBoundsPersistence", () => {
  it("flushes the latest scheduled bounds before release and waits for the write", async () => {
    vi.useFakeTimers();
    let finishWrite!: () => void;
    const writePending = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const save = vi.fn(() => writePending);
    const persistence = new WindowBoundsPersistence(save, 180);
    persistence.schedule({ x: 10, y: 20, width: 250, height: 170 });
    persistence.schedule({ x: 30, y: 40, width: 280, height: 210 });

    const flush = persistence.flush();
    expect(save).toHaveBeenCalledWith({ x: 30, y: 40, width: 280, height: 210 });
    let completed = false;
    void flush.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    finishWrite();
    await flush;
    expect(completed).toBe(true);
    vi.useRealTimers();
  });

  it("queues final bounds behind an older write so stale data cannot win", async () => {
    let finishFirstWrite!: () => void;
    const writes: Array<{ x: number }> = [];
    const save = vi.fn(async (value: { x: number }) => {
      writes.push(value);
      if (value.x === 10) {
        await new Promise<void>((resolve) => {
          finishFirstWrite = resolve;
        });
      }
    });
    const persistence = new WindowBoundsPersistence(save, 180);

    const first = persistence.flush({ x: 10 });
    const final = persistence.flush({ x: 99 });
    expect(writes).toEqual([{ x: 10 }]);

    finishFirstWrite();
    await Promise.all([first, final]);
    expect(writes).toEqual([{ x: 10 }, { x: 99 }]);
  });

  it("reports an explicit flush failure without rejecting the close flow", async () => {
    const failure = new Error("disk full");
    const onError = vi.fn();
    const persistence = new WindowBoundsPersistence(
      async () => {
        throw failure;
      },
      180,
      onError
    );

    await expect(persistence.flush({ x: 99 })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
