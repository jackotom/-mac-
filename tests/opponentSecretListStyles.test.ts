import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/opponentOverlayStyles.css"), "utf8");

describe("opponent secret list styles", () => {
  it("reserves compact rows for counters with and without match pulse", () => {
    expect(styles).toMatch(
      /\.opponent-overlay-shell:has\(\.card-tracking-layout\):has\(\.overlay-public-counters\)\s*\{\s*grid-template-rows:\s*24px 26px 30px minmax\(0,\s*1fr\);/
    );
    expect(styles).toMatch(
      /\.opponent-overlay-shell:has\(\.card-tracking-layout\):has\(\.match-pulse-actor\):has\(\.overlay-public-counters\)\s*\{\s*grid-template-rows:\s*24px 18px 26px 30px minmax\(0,\s*1fr\);/
    );
  });

  it("reserves a real row for global effects in every compact status combination", () => {
    expect(styles).toMatch(
      /\.opponent-overlay-shell:has\(\.card-tracking-layout\):has\(> \.overlay-card-group\)\s*\{\s*grid-template-rows:\s*24px 26px minmax\(19px,\s*96px\) minmax\(0,\s*1fr\);/
    );
    expect(styles).toMatch(
      /\.opponent-overlay-shell:has\(\.card-tracking-layout\):has\(\.overlay-public-counters\):has\(> \.overlay-card-group\)\s*\{\s*grid-template-rows:\s*24px 26px 30px minmax\(19px,\s*96px\) minmax\(0,\s*1fr\);/
    );
    expect(styles).toMatch(
      /\.opponent-overlay-shell:has\(\.card-tracking-layout\):has\(\.match-pulse-actor\):has\(> \.overlay-card-group\)\s*\{\s*grid-template-rows:\s*24px 18px 26px minmax\(19px,\s*96px\) minmax\(0,\s*1fr\);/
    );
    expect(styles).toMatch(
      /\.opponent-overlay-shell:has\(\.card-tracking-layout\):has\(\.match-pulse-actor\):has\(\.overlay-public-counters\):has\(> \.overlay-card-group\)\s*\{\s*grid-template-rows:\s*24px 18px 26px 30px minmax\(19px,\s*96px\) minmax\(0,\s*1fr\);/
    );
    expect(styles).toMatch(
      /\.opponent-overlay-shell:has\(\.card-tracking-layout\) > \.overlay-card-group\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/
    );
  });

  it("keeps every secret slot as a compact readable row", () => {
    expect(styles).toMatch(
      /\.opponent-secret-section\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?align-content:\s*start;[\s\S]*?overflow:\s*visible;/
    );
    expect(styles).toMatch(
      /\.opponent-secret-slot\s*\{[\s\S]*?grid-template-columns:\s*36px minmax\(0,\s*1fr\);[\s\S]*?align-items:\s*start;[\s\S]*?padding:\s*3px 4px;/
    );
    expect(styles).toMatch(
      /\.opponent-secret-slot-label\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    );
  });

  it("wraps candidates inside the slot while keeping status text visible", () => {
    expect(styles).toMatch(
      /\.opponent-secret-candidates\s*\{[\s\S]*?display:\s*flex;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*visible;[\s\S]*?flex-wrap:\s*wrap;/
    );
    expect(styles).toMatch(
      /\.opponent-secret-candidates li\s*\{[\s\S]*?flex:\s*1 1 100%;[\s\S]*?min-width:\s*0;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/
    );
    expect(styles).toMatch(
      /\.opponent-secret-candidate-preview\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;[\s\S]*?display:\s*grid;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/
    );
    expect(styles).toMatch(
      /\.opponent-secret-candidates strong\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(styles).toMatch(
      /\.opponent-secret-candidates span\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(styles).not.toMatch(/\.opponent-secret-section\s*\{\s*max-height:/);
  });

  it("tightens the slot label at the 240px minimum width", () => {
    expect(styles).toMatch(
      /@media \(max-width: 280px\)[\s\S]*?\.opponent-secret-slot\s*\{[\s\S]*?grid-template-columns:\s*32px minmax\(0,\s*1fr\);/
    );
  });
});
