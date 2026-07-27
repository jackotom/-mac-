import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/desktopReplicaStyles.css"), "utf8");

describe("desktop tavern theme styles", () => {
  it("uses one black-and-gold material system for the shell, settings, and deck tools route", () => {
    expect(styles).toMatch(/--replica-bg:\s*#090806/);
    expect(styles).toMatch(/--replica-panel:\s*#15110c/);
    expect(styles).toMatch(/--replica-gold:\s*#d69a2c/);
    expect(styles).toMatch(/\.sidebar-item\[aria-current="page"\][\s\S]*?background:\s*linear-gradient\(90deg, #50300d, #271a0c\)/);
    expect(styles).toMatch(/\.settings-section-content\s*\{[\s\S]*?#0f0c08/);
    expect(styles).toMatch(/\.deck-tools-page\s*\{[\s\S]*?linear-gradient\(180deg, #0d0a07, #080706\)/);
    expect(styles).toMatch(/\.deck-tools-manual textarea\s*\{[\s\S]*?background:\s*var\(--replica-bg\)/);
    expect(styles).toMatch(/\.deck-tools-page \.primary-action\s*\{[\s\S]*?background:\s*linear-gradient\(180deg, #e1a73d, #a76612\)/);
  });

  it("keeps tracker, match history, and card library interiors in the warm material system", () => {
    expect(styles).toMatch(/\.mana-cost\s*\{[\s\S]*?background:\s*radial-gradient\(circle at 35% 25%, #f1c765, #a96112 72%\)/);
    expect(styles).toMatch(/\.card-hover-preview\s*\{[\s\S]*?background:\s*var\(--replica-bg\)/);
    expect(styles).toMatch(/\.match-history-panel\s*\{[\s\S]*?background:\s*linear-gradient\(180deg, var\(--replica-panel-raised\), var\(--replica-panel\)\)/);
    expect(styles).toMatch(/\.card-library-panel\s*\{[\s\S]*?--card-library-bg:\s*var\(--replica-panel\)/);
    expect(styles).toMatch(/\.card-library-mana\s*\{[\s\S]*?background:\s*radial-gradient\(circle at 35% 25%, #f0c45d, #a65e10 74%\)/);
    expect(styles).toMatch(/\.card-library-pagination button\s*\{[\s\S]*?background:\s*var\(--replica-panel-soft\)/);
  });
});
