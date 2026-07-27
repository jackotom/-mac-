import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const styles = fs.readFileSync(path.join(projectRoot, "src/renderer/boardAttackOverlayStyles.css"), "utf8");

describe("board attack floating counter styles", () => {
  it("matches the reference's tiny sword counter beside each hero", () => {
    expect(styles).toMatch(
      /\.board-attack-overlay-canvas\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?pointer-events:\s*none;/
    );
    expect(styles).toMatch(
      /\.board-attack-icon\s*\{[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px;[\s\S]*?place-items:\s*center;[\s\S]*?border-radius:\s*50%;[\s\S]*?background:\s*radial-gradient\([^;]*rgba\(16,\s*27,\s*78,\s*0\.98\)/
    );
    expect(styles).toMatch(
      /\.board-attack-counter-icon\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*-4px;/
    );
    expect(styles).toMatch(
      /\.board-attack-counter-icon svg\s*\{[\s\S]*?width:\s*11px;[\s\S]*?height:\s*11px;[\s\S]*?padding:\s*0;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/
    );
    expect(styles).toMatch(
      /\.board-attack-counter-value\s*\{[\s\S]*?font-size:\s*16px;[\s\S]*?font-variant-numeric:\s*tabular-nums;/
    );
  });

  it("does not recreate a large panel around the counters", () => {
    const canvasRule = styles.match(/\.board-attack-overlay-canvas\s*\{[^}]*\}/)?.[0] ?? "";
    const iconRule = styles.match(/\.board-attack-icon\s*\{[^}]*\}/)?.[0] ?? "";

    expect(canvasRule).not.toMatch(/(?:border|box-shadow):/);
    expect(iconRule).not.toMatch(/width:\s*(?:3[5-9]|[4-9]\d|\d{3,})px/);
    expect(iconRule).not.toMatch(/height:\s*(?:3[5-9]|[4-9]\d|\d{3,})px/);
  });
});
