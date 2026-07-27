import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  autoRepairLogConfigOnStartup,
  ensureLogConfig,
  getDefaultLogConfigPath,
  getLegacyLogConfigPath,
  getPreferredLogConfigPath,
  inspectLogConfig
} from "../src/main/logConfig.js";

describe("log config", () => {
  let homeDir: string;

  beforeEach(async () => {
    homeDir = await mkdtemp(path.join(os.tmpdir(), "hs-log-config-"));
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it("uses the macOS Preferences config path as the default", () => {
    expect(getDefaultLogConfigPath("/Users/example")).toBe(
      path.join("/Users/example", "Library", "Preferences", "Blizzard", "Hearthstone", "log.config")
    );
  });

  it("creates and reports the Preferences log.config path on current macOS installs", async () => {
    const status = await ensureLogConfig(undefined, homeDir);
    const content = await readFile(getPreferredLogConfigPath(homeDir), "utf8");
    const inspected = await inspectLogConfig(undefined, homeDir);

    expect(status.path).toBe(getPreferredLogConfigPath(homeDir));
    expect(status.exists).toBe(true);
    expect(status.hasPowerLog).toBe(true);
    expect(status.hasZoneLog).toBe(true);
    expect(status.hasDecksLog).toBe(true);
    expect(content).toContain("[Power]");
    expect(content).toContain("[Decks]");
    expect(inspected.path).toBe(status.path);
    expect(inspected.exists).toBe(true);
    expect(inspected.hasDecksLog).toBe(true);
  });

  it("prefers Preferences when both config directories exist", async () => {
    const preferredPath = getPreferredLogConfigPath(homeDir);
    const legacyPath = getLegacyLogConfigPath(homeDir);
    await mkdir(path.dirname(preferredPath), { recursive: true });
    await mkdir(path.dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, "legacy config", "utf8");

    const status = await ensureLogConfig(undefined, homeDir);

    expect(status.path).toBe(preferredPath);
    expect(await readFile(preferredPath, "utf8")).toContain("[Power]");
    expect(await readFile(preferredPath, "utf8")).toContain("[Decks]");
    expect(await readFile(legacyPath, "utf8")).toBe("legacy config");
  });

  it("falls back to the legacy Application Support path when it is the only existing config directory", async () => {
    const legacyPath = getLegacyLogConfigPath(homeDir);
    await mkdir(path.dirname(legacyPath), { recursive: true });

    const status = await ensureLogConfig(undefined, homeDir);
    const inspected = await inspectLogConfig(undefined, homeDir);

    expect(status.path).toBe(legacyPath);
    expect(status.exists).toBe(true);
    expect(inspected.path).toBe(legacyPath);
    expect(await readFile(legacyPath, "utf8")).toContain("[Decks]");
  });

  it("does not borrow FilePrinting from a later log section", async () => {
    const configPath = getPreferredLogConfigPath(homeDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, [
      "[Power]",
      "FilePrinting=false",
      "[Zone]",
      "FilePrinting=true",
      "[Decks]",
      "LogLevel=1",
      "[Arena]",
      "FilePrinting=true"
    ].join("\n"), "utf8");

    const status = await inspectLogConfig(undefined, homeDir);

    expect(status.hasPowerLog).toBe(false);
    expect(status.hasZoneLog).toBe(true);
    expect(status.hasDecksLog).toBe(false);
    expect(status.hasArenaLog).toBe(true);
  });

  it("repairs an incomplete production config and preserves a backup", async () => {
    const configPath = getPreferredLogConfigPath(homeDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "[Power]\nFilePrinting=true\n", "utf8");

    const result = await autoRepairLogConfigOnStartup({ environment: {}, homeDir });

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") {
      throw new Error("expected repaired result");
    }
    expect(result.config.backupPath).toBeTruthy();
    expect(await readFile(result.config.backupPath!, "utf8")).toBe("[Power]\nFilePrinting=true\n");
    expect(result.config).toMatchObject({
      hasPowerLog: true,
      hasZoneLog: true,
      hasDecksLog: true,
      hasArenaLog: true
    });
  });

  it("merges required logs without replacing custom sections or settings", async () => {
    const configPath = getPreferredLogConfigPath(homeDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    const original = [
      "# user-owned header",
      "[Power]",
      "Path=/Volumes/Hearthstone Logs",
      "FilePrinting=false",
      "DebugKey=keep-me",
      "",
      "[CustomPlugin]",
      "FilePrinting=false",
      "CustomOption=untouched",
      ""
    ].join("\r\n");
    await writeFile(configPath, original, "utf8");

    const result = await autoRepairLogConfigOnStartup({ environment: {}, homeDir });

    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") {
      throw new Error("expected repaired result");
    }
    const repaired = await readFile(configPath, "utf8");
    expect(repaired).toContain([
      "# user-owned header",
      "[Power]",
      "Path=/Volumes/Hearthstone Logs",
      "FilePrinting=true",
      "DebugKey=keep-me",
      "",
      "[CustomPlugin]",
      "FilePrinting=false",
      "CustomOption=untouched",
      ""
    ].join("\r\n"));
    expect(repaired).toContain("[Zone]\r\n");
    expect(repaired).toContain("[Decks]\r\n");
    expect(repaired).toContain("[Arena]\r\n");
    expect(await readFile(result.config.backupPath!, "utf8")).toBe(original);
  });

  it("preserves FilePrinting comments and treats the repaired config as unchanged on the next startup", async () => {
    const configPath = getPreferredLogConfigPath(homeDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, [
      "[Power]",
      "FilePrinting=false # keep this comment",
      "[Zone]",
      "FilePrinting=true # zone comment",
      "[Decks]",
      "FilePrinting=true ; deck comment",
      "[Arena]",
      "FilePrinting=true"
    ].join("\n") + "\n", "utf8");

    const first = await autoRepairLogConfigOnStartup({ environment: {}, homeDir });
    expect(first.status).toBe("repaired");
    const repaired = await readFile(configPath, "utf8");
    expect(repaired).toContain("FilePrinting=true # keep this comment");

    const second = await autoRepairLogConfigOnStartup({ environment: {}, homeDir });
    expect(second.status).toBe("unchanged");
    expect(await readFile(configPath, "utf8")).toBe(repaired);
  });

  it("does not treat unrelated QA settings as permission to skip repair", async () => {
    const configPath = getPreferredLogConfigPath(homeDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "[Power]\nFilePrinting=true\n", "utf8");

    const result = await autoRepairLogConfigOnStartup({
      environment: { QA_OPEN_OVERLAY: "1" },
      homeDir
    });

    expect(result.status).toBe("repaired");
    expect((await readFile(configPath, "utf8"))).toContain("[Arena]");
  });

  it.each([
    { QA_USER_DATA_DIR: "/tmp/tracker-qa-user-data" },
    { QA_SCREENSHOT_PATH: "/tmp/tracker-qa.png" },
    { QA_SKIP_LOG_CONFIG_REPAIR: "1" }
  ])("does not modify the real config in QA mode: %o", async (environment) => {
    const configPath = getPreferredLogConfigPath(homeDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "[Power]\nFilePrinting=true\n", "utf8");

    const result = await autoRepairLogConfigOnStartup({ environment, homeDir });

    expect(result).toEqual({ status: "skipped-qa" });
    expect(await readFile(configPath, "utf8")).toBe("[Power]\nFilePrinting=true\n");
  });
});
