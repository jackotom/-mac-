import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "src/renderer/overlayStyles.css"), "utf8");

describe("friendly overlay card thumbnail styles", () => {
  it("keeps card art visible in the normal and 100px-wide layouts", () => {
    expect(styles).toMatch(
      /\.overlay-card-art-image\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?object-fit:\s*cover;[\s\S]*?opacity:\s*0\.62;/
    );

    const narrowLayout = styles.slice(
      styles.indexOf("@media (max-width: 120px)"),
      styles.indexOf("/* Arena pregame: Firestone-style pick rate / card / deck impact table. */")
    );

    expect(narrowLayout).toMatch(/\.overlay-card-art-image\s*\{[\s\S]*?opacity:\s*0\.5;/);
    expect(narrowLayout).not.toMatch(
      /\.overlay-card-art-image\s*\{[^}]*(?:display:\s*none|visibility:\s*hidden|opacity:\s*0(?:[;\s}]|$))/
    );
  });

  it("keeps mana cost, horizontal card art/name, and quantity on one compact row", () => {
    expect(styles).toMatch(
      /\.overlay-compact-card-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?height:\s*20px;[\s\S]*?grid-template-columns:\s*20px minmax\(0,\s*1fr\);[\s\S]*?overflow:\s*hidden;/
    );
    expect(styles).toMatch(
      /\.overlay-card-art\s*\{[\s\S]*?position:\s*relative;[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?overflow:\s*hidden;/
    );
    expect(styles).toMatch(
      /\.overlay-card-quantity\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*2px;[\s\S]*?right:\s*2px;[\s\S]*?width:\s*16px;[\s\S]*?height:\s*16px;/
    );
  });
});
