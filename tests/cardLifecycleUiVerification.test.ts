import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("card lifecycle Electron QA verification", () => {
  it("registers the project-Electron verification command", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["verify:card-lifecycle-ui"])
      .toBe("node scripts/verify-card-lifecycle-ui.mjs");
  });

  it("defines eight isolated, hard-asserted scenarios without user data or another browser", () => {
    const script = read("scripts/verify-card-lifecycle-ui.mjs");
    for (const scenario of [
      "friendly-short",
      "friendly-tall",
      "opponent-secret",
      "opponent-unknown-hand",
      "inline-normal",
      "inline-pinned",
      "external-normal",
      "external-pinned"
    ]) {
      expect(script).toContain(scenario);
    }
    expect(script).toContain("mkdtemp");
    expect(script).toContain("QA_USER_DATA_DIR");
    expect(script).toContain("node_modules/.bin/electron");
    expect(script).toContain("当前环境无法验证 100×900");
    expect(script).toContain("workArea.height");
    expect(script).toContain("actualScrollableSelectors");
    expect(script).toContain("designatedScrollOwners");
    expect(script).toContain("consoleErrorCount");
    expect(script).toContain("outcomeRows");
    expect(script).toContain("KeyboardEvent");
    expect(script).not.toMatch(/\b(?:playwright|puppeteer|open|chrome|egolite)\b/i);
    expect(script).not.toMatch(/(?:Library\/Logs\/Hearthstone|Documents\/text\/炉石传说|process\.env\.(?:HOME|USERPROFILE))/);
    expect(script).toContain('join(userData, "Power.log")');
  });

  it("collects the complete computed-layout inspection and uses production pinning", () => {
    const main = read("src/main/main.ts");
    const overlayStyles = read("src/renderer/overlayStyles.css");
    for (const key of [
      "viewport",
      "layoutMode",
      "page",
      "expandedKeys",
      "shellRect",
      "mainRect",
      "footerRect",
      "visibleCardRowRects",
      "shellScrollSize",
      "mainScrollSize",
      "designatedScrollOwners",
      "actualScrollableSelectors",
      "consoleErrorCount",
      "preview"
    ]) {
      expect(main).toContain(key);
    }
    expect(main).toContain('process.env.QA_PIN_CARD_PREVIEW === "1"');
    expect(main).toContain("setCardPreviewPinned(true)");
    expect(main).toContain("new KeyboardEvent");
    expect(main).toContain('code: "KeyQ"');
    expect(main).toContain("getComputedStyle");
    expect(main).toContain("scrollHeight > element.clientHeight");
    expect(overlayStyles).toMatch(
      /\.overlay-card-groups:has\(> \.card-tracking-layout\)\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*100%;[^}]*overflow:\s*hidden;/
    );
    expect(overlayStyles).toMatch(
      /\.card-tracking-layout\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*100%;/
    );
    expect(overlayStyles).toMatch(
      /\.card-tracking-main\s*\{[^}]*overflow-y:\s*auto;/
    );
  });
});
