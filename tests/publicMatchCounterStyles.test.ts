import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const styles = fs.readFileSync(path.join(projectRoot, "src/renderer/overlayStyles.css"), "utf8");

describe("public match counter styles", () => {
  it("renders public counters as compact readable text capsules", () => {
    expect(styles).toMatch(
      /\.overlay-public-counters\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?gap:\s*3px;[\s\S]*?overflow:\s*hidden;[\s\S]*?background:\s*transparent;/
    );
    expect(styles).toMatch(
      /\.overlay-public-counter\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?min-width:\s*0;[\s\S]*?height:\s*22px;[\s\S]*?flex:\s*1 1 0;[\s\S]*?gap:\s*2px;[\s\S]*?padding:\s*0 5px;[\s\S]*?overflow:\s*hidden;[\s\S]*?border-radius:\s*5px;/
    );
    expect(styles).toMatch(
      /\.overlay-public-counter-label\s*\{[\s\S]*?display:\s*block;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?font-size:\s*10px;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(styles).not.toMatch(/\.overlay-public-counter-icon(?:\s|,|\{)/);
    expect(styles).not.toMatch(/\.overlay-public-counter-(?:fatigue|corpses|spells)::before/);
    expect(styles).toMatch(
      /\.overlay-public-counter-value\s*\{[\s\S]*?font-size:\s*11px;[\s\S]*?font-variant-numeric:\s*tabular-nums;/
    );
  });

  it("keeps three counters on one row at normal overlay widths", () => {
    const rowRule = styles.match(/\.overlay-public-counters\s*\{[^}]*\}/)?.[0] ?? "";
    const tokenRule = styles.match(/\.overlay-public-counter\s*\{[^}]*\}/)?.[0] ?? "";

    expect(rowRule).not.toBe("");
    expect(tokenRule).not.toBe("");
    expect(rowRule).not.toMatch(/(?:border|box-shadow):/);
    expect(rowRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(tokenRule).toMatch(/flex:\s*1 1 0/);
    expect(tokenRule).not.toMatch(/width:\s*\d+px/);
  });

  it("wraps counters and reserves two rows at 120px and below", () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*120px\)[\s\S]*?\.overlay-normal:has\(\.overlay-public-counters\)\s*\{[\s\S]*?grid-template-rows:\s*22px 44px minmax\(0,\s*1fr\);/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*120px\)[\s\S]*?\.overlay-public-counters\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow:\s*hidden;/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*120px\)[\s\S]*?\.overlay-public-counter\s*\{[\s\S]*?height:\s*19px;[\s\S]*?flex:\s*1 1 calc\(50% - 1px\);[\s\S]*?padding:\s*0 2px;/
    );
  });
});
