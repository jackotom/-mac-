import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
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
});
