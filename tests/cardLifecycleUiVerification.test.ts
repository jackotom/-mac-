import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
    expect(script).toContain('QA_LOCK_LOG_PATH: "1"');
    expect(script).toMatch(
      /assert\.equal\(\s*inspection\.trackerState\?\.logPath,\s*isolatedPowerLog/
    );
  });

  it("sanitizes inherited QA and development environment before every Electron launch", () => {
    const script = read("scripts/verify-card-lifecycle-ui.mjs");
    expect(script).toContain("/^QA_/");
    expect(script).toContain("VITE_DEV_SERVER_URL");
    expect(script).toContain("ELECTRON_RUN_AS_NODE");
    expect(script).toContain("NODE_OPTIONS");
    expect(script).not.toContain("...process.env,");
  });

  it("owns and cleans only the detached Electron process group", () => {
    const script = read("scripts/verify-card-lifecycle-ui.mjs");
    expect(script).toContain("detached: true");
    expect(script).toContain('signalProcessGroup(processGroupId, "SIGTERM")');
    expect(script).toContain('signalProcessGroup(processGroupId, "SIGKILL")');
    expect(script).toContain("process.kill(-processGroupId, signal)");
    expect(script).not.toMatch(/\bpkill\b|\bkillall\b/);
  });

  it.each([
    ["unknown", "not-a-real-scenario", "未知"],
    ["blank", "   ", "不能为空"]
  ])("rejects an %s scenario filter before launching Electron", (_label, filter, message) => {
    const result = spawnSync(process.execPath, ["scripts/verify-card-lifecycle-ui.mjs"], {
      cwd: root,
      env: { ...process.env, QA_SCENARIO_FILTER: filter },
      encoding: "utf8",
      timeout: 5_000
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(message);
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
    expect(main).toContain("element.scrollWidth > element.clientWidth");
    expect(main).not.toMatch(
      /horizontalOverflowSelectors:[\s\S]{0,300}\/\(auto\|scroll\)\/\.test\(style\.overflowX\)/
    );
    expect(main).toContain('webContents.on("console-message"');
    expect(main).toContain("getQaConsoleErrorCount(cardPreviewWindow)");
    expect(main.indexOf("installQaConsoleErrorListener(window)"))
      .toBeLessThan(main.indexOf("await window.loadFile"));
    expect(main.indexOf("installQaConsoleErrorListener(cardPreviewWindow)"))
      .toBeLessThan(main.indexOf("await cardPreviewWindow.loadFile"));
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

  it("hard-asserts one preview scroll shell and zero result subtree scroll for every preview scenario", () => {
    const script = read("scripts/verify-card-lifecycle-ui.mjs");
    expect(script).toMatch(
      /assert\.deepEqual\(\s*preview\.actualScrollableSelectors,\s*\["\.card-preview-root"\]/
    );
    expect(script).toContain(
      "assert.deepEqual(preview.resultScrollableSelectors, []"
    );
    expect(script).toContain(
      "assert.equal(preview.consoleErrorCount, 0"
    );
    expect(script).toContain("assertPreviewScrollContract(name, preview)");
    expect(script.match(/assertPreviewScrollContract\(name, preview\)/g)).toHaveLength(3);
  });

  it("reports the tall-window case as blocked and unverified", () => {
    const report = read(".superpowers/sdd/task-9-report.md");
    expect(report).not.toContain("验收已完成");
    expect(report).toContain("环境阻塞");
    expect(report).toContain("未验证");
    expect(report).toContain("7 个");
  });
});
