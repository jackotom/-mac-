import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const main = fs.readFileSync(path.resolve(import.meta.dirname, "../src/main/main.ts"), "utf8");

describe("transient overlay window lifecycle", () => {
  it("releases hidden renderer windows instead of keeping them resident", () => {
    for (const name of [
      "overlayWindow",
      "opponentOverlayWindow",
      "boardAttackOverlayWindow",
      "ladderDeckOverlayWindow",
      "arenaChoiceOverlayWindow",
      "cardPreviewWindow"
    ]) {
      expect(main).not.toMatch(new RegExp(`${name}\\?*\\.hide\\(`));
    }
    expect(main.match(/releaseTransientWindow\(/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("creates the arena choice renderer only when the overlay is visible", () => {
    expect(main).not.toContain("if (trackerSettings.overlay.enabled) await createArenaChoiceOverlayWindow();");
    expect(main).toContain("if (trackerSettings.overlay.enabled) startArenaChoiceOverlayMonitor();");
    expect(main).toMatch(
      /refreshArenaChoiceOverlayWindow[\s\S]*?shouldShowArenaChoiceOverlay[\s\S]*?createArenaChoiceOverlayWindow/
    );
  });

  it("keeps the opponent window collapsed after a background release and restore", () => {
    expect(main).toContain("opponentOverlayRestoreCollapsed");
    expect(main).toMatch(
      /createOpponentOverlayWindow[\s\S]*?opponentOverlayRestoreCollapsed[\s\S]*?collapseOpponentOverlayWindow/
    );
  });

  it("invalidates stopped arena refreshes and persists opponent bounds before release", () => {
    expect(main).toContain("arenaChoiceOverlayGeneration");
    expect(main).toContain("arenaHeroRankingGeneration");
    expect(main).toContain("await releaseOpponentOverlayWindow()");
    expect(main).toContain("await opponentOverlayBoundsPersistence.flush");
  });

  it("invalidates pending secret updates and rechecks settings after async creation", () => {
    expect(main).toContain("opponentSecretOverlayGeneration");
    expect(main).toMatch(
      /async function showOpponentOverlayInactive\(generation:[\s\S]*?await createOpponentOverlayWindow[\s\S]*?generation !== opponentSecretOverlayGeneration[\s\S]*?!isDeckTrackerEnabled\("opponentDeckTracker"\)[\s\S]*?opponentOverlayWindow !== window/
    );
  });

  it("updates secret prediction in-place instead of releasing a manually opened opponent window", () => {
    const start = main.indexOf("previous && previous.overlay.secretPrediction");
    const settingsSection = main.slice(
      start,
      main.indexOf('if (trackerSettings.general.gameDetection === "automatic")', start)
    );
    expect(settingsSection).toContain('"tracker:secret-prediction:update"');
    expect(settingsSection).not.toContain("releaseOpponentOverlayWindow");
  });

  it("flushes final friendly bounds before close and application quit", () => {
    expect(main).toContain("overlayBoundsPersistence");
    expect(main).toMatch(/cleanup: async \(\) =>[\s\S]*?await releaseOverlayWindow\(\)/);
    expect(main).toMatch(
      /closeFriendlyOverlay:\s*\(\) => releaseOverlayWindow\(overlayWindow\)/
    );
    expect(main).toMatch(
      /automaticOverlayController\.suppressCurrentContext\(\);[\s\S]*?await releaseOverlayWindow\(overlayWindow\)/
    );
    expect(main).not.toContain("overlayBoundsSaveTimer");
  });

  it("waits for an in-flight opponent creation before releasing it", () => {
    const releaseStart = main.indexOf("async function releaseOpponentOverlayWindow");
    const releaseSource = main.slice(
      releaseStart,
      main.indexOf("async function loadOpponentOverlayBounds", releaseStart)
    );
    expect(releaseSource).toContain("opponentOverlayWindowCreationPromise");
    expect(releaseSource).toMatch(
      /await opponentOverlayWindowCreationPromise\.catch[\s\S]*?window = opponentOverlayWindow/
    );
  });

  it("closes friendly and opponent windows even when final bounds persistence fails", () => {
    for (const [releaseName, nextName] of [
      ["releaseOverlayWindow", "saveOverlayWindowBounds"],
      ["releaseOpponentOverlayWindow", "loadOpponentOverlayBounds"]
    ]) {
      const releaseStart = main.indexOf(`async function ${releaseName}`);
      const releaseSource = main.slice(
        releaseStart,
        main.indexOf(`async function ${nextName}`, releaseStart)
      );
      expect(releaseSource).toMatch(/try \{[\s\S]*?await [\s\S]*?\.flush[\s\S]*?finally \{[\s\S]*?window\.close\(\)/);
    }
  });
});
