import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { markRendererReady } from "../src/renderer/rendererReady";

describe("renderer fail-closed bootstrap", () => {
  it("keeps the document hidden until the renderer confirms its first frame", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

    expect(html).toContain("html:not([data-renderer-ready])");
    expect(html).toMatch(/html:not\(\[data-renderer-ready\]\)[\s\S]*?visibility:\s*hidden/);
    expect(document.documentElement).not.toHaveAttribute("data-renderer-ready");

    markRendererReady(document);

    expect(document.documentElement).toHaveAttribute("data-renderer-ready", "true");
  });
});
