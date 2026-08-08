import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTrustedDevServerUrl } from "../src/main/rendererPage";

describe("renderer page loading boundary", () => {
  it("ignores a development server URL in packaged builds", () => {
    expect(resolveTrustedDevServerUrl("https://evil.example", true)).toBeUndefined();
  });

  it("rejects a non-local development server URL", () => {
    expect(() => resolveTrustedDevServerUrl("https://evil.example", false)).toThrow(/本机开发地址/);
  });

  it("adds window query parameters to a trusted local development URL", () => {
    expect(resolveTrustedDevServerUrl("http://127.0.0.1:5173", false, { overlay: "1" }))
      .toContain("overlay=1");
  });

  it("routes all eight renderer windows through the trusted page loader", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/main/main.ts"), "utf8");

    expect(source.match(/await loadRendererPage\(/g)).toHaveLength(8);
    expect(source.match(/\.loadURL\(/g)).toHaveLength(1);
    expect(source.match(/\.loadFile\(/g)).toHaveLength(1);
  });
});
