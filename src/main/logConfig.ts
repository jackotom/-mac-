import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface LogConfigStatus {
  path: string;
  exists: boolean;
  hasPowerLog: boolean;
  hasZoneLog: boolean;
  hasDecksLog: boolean;
  hasArenaLog: boolean;
  backupPath?: string;
}

const REQUIRED_LOG_CONFIG = `[Achievements]
LogLevel=1
FilePrinting=true
ConsolePrinting=false
ScreenPrinting=false

[Power]
LogLevel=1
FilePrinting=true
ConsolePrinting=false
ScreenPrinting=false

[Zone]
LogLevel=1
FilePrinting=true
ConsolePrinting=false
ScreenPrinting=false

[Decks]
LogLevel=1
FilePrinting=true
ConsolePrinting=false
ScreenPrinting=false

[Arena]
LogLevel=1
FilePrinting=true
ConsolePrinting=false
ScreenPrinting=false

[Asset]
LogLevel=1
FilePrinting=true
ConsolePrinting=false
ScreenPrinting=false
`;

export function getDefaultLogConfigPath(homeDir = os.homedir()) {
  return getPreferredLogConfigPath(homeDir);
}

export function getPreferredLogConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, "Library", "Preferences", "Blizzard", "Hearthstone", "log.config");
}

export function getLegacyLogConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, "Library", "Application Support", "Blizzard", "Hearthstone", "log.config");
}

export function getLogConfigCandidatePaths(homeDir = os.homedir()) {
  return [getPreferredLogConfigPath(homeDir), getLegacyLogConfigPath(homeDir)];
}

export async function inspectLogConfig(configPath?: string, homeDir = os.homedir()): Promise<LogConfigStatus> {
  const resolvedPath = await resolveLogConfigPath(configPath, homeDir);
  const content = await fs.readFile(resolvedPath, "utf8").catch(() => undefined);
  return {
    path: resolvedPath,
    exists: content !== undefined,
    hasPowerLog: Boolean(content?.match(/\[Power\][\s\S]*?FilePrinting\s*=\s*true/i)),
    hasZoneLog: Boolean(content?.match(/\[Zone\][\s\S]*?FilePrinting\s*=\s*true/i)),
    hasDecksLog: Boolean(content?.match(/\[Decks\][\s\S]*?FilePrinting\s*=\s*true/i)),
    hasArenaLog: Boolean(content?.match(/\[Arena\][\s\S]*?FilePrinting\s*=\s*true/i))
  };
}

export async function ensureLogConfig(configPath?: string, homeDir = os.homedir()): Promise<LogConfigStatus> {
  const resolvedPath = await resolveLogConfigPath(configPath, homeDir);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const previous = await fs.readFile(resolvedPath, "utf8").catch(() => undefined);
  let backupPath: string | undefined;

  if (previous && previous.trim() !== REQUIRED_LOG_CONFIG.trim()) {
    backupPath = `${resolvedPath}.bak-${timestampForPath()}`;
    await fs.writeFile(backupPath, previous, "utf8");
  }

  await fs.writeFile(resolvedPath, REQUIRED_LOG_CONFIG, "utf8");
  const status = await inspectLogConfig(resolvedPath);
  return { ...status, backupPath };
}

async function resolveLogConfigPath(configPath: string | undefined, homeDir: string) {
  if (configPath) {
    return configPath;
  }

  const [preferredPath, legacyPath] = getLogConfigCandidatePaths(homeDir);
  if (await exists(preferredPath) || await exists(path.dirname(preferredPath))) {
    return preferredPath;
  }

  if (await exists(legacyPath) || await exists(path.dirname(legacyPath))) {
    return legacyPath;
  }

  return preferredPath;
}

async function exists(filePath: string) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function timestampForPath() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}
