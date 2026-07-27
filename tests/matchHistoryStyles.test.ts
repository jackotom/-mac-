import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/matchHistoryStyles.css"), "utf8");

describe("match history styles", () => {
  it("keeps the page fixed while only the history list scrolls", () => {
    expect(styles).toMatch(/\.match-history-panel\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(styles).toMatch(/\.match-history-list\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*auto;/);
  });

  it("overrides the main window width only while history is rendered", () => {
    expect(styles).toMatch(/html:has\(\.match-history-panel\),[\s\S]*?body:has\(\.match-history-panel\):not\(:has\(\.overlay-shell\)\):not\(:has\(\.board-attack-overlay-canvas\)\),[\s\S]*?#root:has\(\.match-history-panel\)\s*\{[\s\S]*?min-width:\s*0;/);
  });

  it("removes ordered-list browser spacing and markers", () => {
    expect(styles).toMatch(/\.match-history-list\s*\{[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*0;[\s\S]*?list-style:\s*none;/);
  });

  it("wraps summary statistics and constrains narrow rows without horizontal overflow", () => {
    expect(styles).toMatch(/\.match-history-summary\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
    expect(styles).toContain("@media (max-width: 700px)");
    expect(styles).toMatch(/\.match-history-panel\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/);
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.match-history-stat\s*\{[\s\S]*?flex-basis:\s*calc\(33\.333% - 7px\);/);
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.match-history-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.15fr\) minmax\(70px, auto\);/);
    expect(styles).toMatch(/\.match-history-row > \*\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/);
  });

  it("uses text, borders, and distinct shapes for every result", () => {
    for (const resultClass of ["win", "loss", "tie"]) {
      expect(styles).toContain(`.match-result-${resultClass}`);
      expect(styles).toContain(`.match-result-${resultClass}::before`);
    }
    expect(styles).toMatch(/\.match-result-win,\n\.match-result-loss,\n\.match-result-tie\s*\{[\s\S]*?border:\s*1px solid currentColor;/);
    expect(styles).toContain("border-radius: 50%");
    expect(styles).toContain("transform: rotate(45deg)");
  });
});
