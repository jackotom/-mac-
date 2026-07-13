import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

function source(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("window experience configuration", () => {
  it("keeps the normal deck overlay at least as wide as its rendered layout", () => {
    expect(source("src/main/main.ts")).toMatch(/createOverlayWindow[\s\S]*?minWidth:\s*300/);
  });

  it("does not allow expanded opponent windows to use collapsed dimensions", () => {
    const main = source("src/main/main.ts");
    expect(main).toMatch(/opponentOverlayWindow\.setMinimumSize\(220,\s*150\)/);
  });

  it("repairs undersized saved opponent bounds", () => {
    const main = source("src/main/main.ts");
    expect(main).toMatch(/Math\.max\(220,\s*value\.width/);
    expect(main).toMatch(/Math\.max\(150,\s*value\.height/);
  });

  it("allows hidden renderer windows to throttle", () => {
    const main = source("src/main/main.ts");
    expect(main).not.toMatch(/backgroundThrottling:\s*false/);
  });

  it("provides visible keyboard focus for main toolbar controls", () => {
    expect(source("src/renderer/styles.css")).toMatch(/\.top-actions button:focus-visible/);
  });

  it("keeps overlay window controls large enough to target", () => {
    expect(source("src/renderer/overlayStyles.css")).toMatch(/\.overlay-header button[\s\S]*?width:\s*28px[\s\S]*?min-height:\s*28px/);
    expect(source("src/renderer/opponentOverlayStyles.css")).toMatch(/\.overlay-header button[\s\S]*?width:\s*28px[\s\S]*?height:\s*28px/);
    expect(source("src/renderer/ladderDeckRecommendationStyles.css")).toMatch(/\.ladder-deck-close[\s\S]*?width:\s*28px[\s\S]*?height:\s*28px/);
  });

  it("keeps arena choice labels legible at narrow widths", () => {
    const styles = source("src/renderer/arenaChoiceOverlayStyles.css");
    expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*?> span \{\s*font-size:\s*11px/);
    expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*?> strong \{\s*font-size:\s*13px/);
  });
});
