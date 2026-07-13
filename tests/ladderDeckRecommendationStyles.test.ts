import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/ladderDeckRecommendationStyles.css"), "utf8");

describe("ladder deck recommendation styles", () => {
  it("keeps the window fixed while allowing only the card list to scroll", () => {
    expect(styles).toMatch(/\.ladder-deck-shell\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(styles).toMatch(/\.ladder-deck-card-list\s*\{[\s\S]*?overflow:\s*auto;/);
    expect(styles).toMatch(/\.ladder-deck-card-section\s*\{[\s\S]*?min-height:\s*0;/);
  });

  it("supports the approved compact and narrow window sizes", () => {
    expect(styles).toContain("min-width: 190px");
    expect(styles).toContain("min-height: 400px");
    expect(styles).toContain("@media (max-width: 205px), (max-height: 450px)");
  });

  it("keeps the copy action outside the scrolling card section", () => {
    expect(styles).toMatch(/\.ladder-deck-shell\s*\{[\s\S]*?grid-template-rows:\s*34px auto minmax\(0, 1fr\) auto;/);
    expect(styles).toMatch(/\.ladder-deck-copy-button\s*\{[\s\S]*?width:\s*100%;/);
  });
});
