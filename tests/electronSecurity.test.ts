import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertTrustedIpcEvent,
  configureSecureNavigation,
  createSecureWebPreferences
} from "../src/main/electronSecurity";

describe("Electron security boundary", () => {
  it("accepts IPC only from the registered top-level frame", () => {
    const mainFrame = { url: "file:///app/index.html" };
    const contents = { mainFrame };
    const trusted = new Set([contents]);

    expect(() => assertTrustedIpcEvent({ sender: contents, senderFrame: mainFrame }, trusted)).not.toThrow();
    expect(() => assertTrustedIpcEvent({ sender: contents, senderFrame: { url: mainFrame.url } }, trusted)).toThrow("不可信页面");
    expect(() => assertTrustedIpcEvent({ sender: {}, senderFrame: mainFrame }, trusted)).toThrow("不可信页面");
  });

  it("blocks navigation and new windows after the application page loads", () => {
    const preventDefault = vi.fn();
    let navigateHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined;
    let openHandler: ((details: { url: string }) => { action: "deny" }) | undefined;
    const webContents = {
      getURL: () => "file:///app/index.html?overlay=1",
      on: vi.fn((name: string, handler: typeof navigateHandler) => {
        if (name === "will-navigate") navigateHandler = handler;
      }),
      setWindowOpenHandler: vi.fn((handler: typeof openHandler) => {
        openHandler = handler;
      })
    };

    configureSecureNavigation({ webContents });
    navigateHandler?.({ preventDefault }, "https://example.com/");

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(openHandler?.({ url: "https://example.com/" })).toEqual({ action: "deny" });
  });

  it("uses an explicit sandboxed renderer configuration", () => {
    expect(createSecureWebPreferences("/tmp/preload.cjs", true)).toEqual({
      preload: "/tmp/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true
    });
  });

  it("gives display-only windows only the capabilities they use", () => {
    const preload = fs.readFileSync(path.resolve(import.meta.dirname, "../src/main/preload.cts"), "utf8");
    expect(preload).toContain('params.get("board-attack-overlay") === "1"');
    expect(preload).toContain('params.get("arena-choice-overlay") === "1"');
    expect(preload).toContain('capability === "card-preview"');
    expect(preload).toContain('capability === "ladder-deck"');
    expect(preload).toContain(": mainApi");
  });

  it("keeps scripts local while allowing required HTTPS card images", () => {
    const html = fs.readFileSync(path.resolve(import.meta.dirname, "../index.html"), "utf8");
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("img-src 'self' data: https:");
    expect(html).not.toContain("'unsafe-eval'");
    expect(html).not.toContain("script-src 'self' https:");
  });
});
