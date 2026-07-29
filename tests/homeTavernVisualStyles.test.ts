import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/homeNewsStyles.css"), "utf8");

describe("home tavern visual styles", () => {
  it("uses the generated tavern frame only for the home surface", () => {
    expect(styles).toContain('url("./assets/tavern-dashboard-frame-v1.png")');
    expect(styles).toMatch(/\.home-newsroom\s*\{[\s\S]*?background-image:/);
    expect(styles).toMatch(
      /body:has\(\.desktop-frame\):has\(\.app-shell\.view-home\)[\s\S]*?\.app-sidebar/
    );
    expect(styles).not.toMatch(/\.app-shell:not\(\.view-home\)[\s\S]*?tavern-dashboard-frame-v1/);
  });

  it("keeps interactive states and reduced-motion fallbacks explicit", () => {
    expect(styles).toMatch(/\.home-primary-action:focus-visible/);
    expect(styles).toMatch(/\.home-copy-deck:focus-visible/);
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.home-dashboard-panel/
    );
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.home-newsroom-footer-grid/);
  });
});
