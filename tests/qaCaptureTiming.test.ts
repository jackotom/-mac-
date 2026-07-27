import { afterEach, describe, expect, it, vi } from "vitest";
import { requestQaQuit, waitForQaRendererSettled } from "../src/main/qaCaptureTiming";

describe("QA capture timing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("continues after a bounded delay when renderer frames are throttled", async () => {
    vi.useFakeTimers();
    const wait = waitForQaRendererSettled(() => new Promise(() => undefined), 500);

    await vi.advanceTimersByTimeAsync(500);

    await expect(wait).resolves.toBeUndefined();
  });

  it("continues immediately after the renderer paints two frames", async () => {
    const executeJavaScript = vi.fn(async (_script: string) => undefined);

    await waitForQaRendererSettled(executeJavaScript, 10_000);

    expect(executeJavaScript).toHaveBeenCalledOnce();
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain("requestAnimationFrame");
  });

  it("requests a normal quit and keeps the QA startup chain stopped", async () => {
    const quit = vi.fn();
    let settled = false;

    void requestQaQuit(quit).finally(() => { settled = true; });
    await Promise.resolve();

    expect(quit).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
  });
});
