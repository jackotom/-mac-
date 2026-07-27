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

const REQUIRED_LOG_SECTIONS = ["Power", "Zone", "Decks", "Arena"] as const;
let atomicWriteSequence = 0;

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
    hasPowerLog: hasFilePrintingEnabled(content, "Power"),
    hasZoneLog: hasFilePrintingEnabled(content, "Zone"),
    hasDecksLog: hasFilePrintingEnabled(content, "Decks"),
    hasArenaLog: hasFilePrintingEnabled(content, "Arena")
  };
}

export async function ensureLogConfig(configPath?: string, homeDir = os.homedir()): Promise<LogConfigStatus> {
  const resolvedPath = await resolveLogConfigPath(configPath, homeDir);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const previous = await fs.readFile(resolvedPath, "utf8").catch(() => undefined);
  const next = previous === undefined ? REQUIRED_LOG_CONFIG : mergeRequiredLogSections(previous);
  let backupPath: string | undefined;

  if (previous !== undefined && previous !== next) {
    backupPath = `${resolvedPath}.bak-${timestampForPath()}`;
    await atomicWriteFile(backupPath, previous);
  }

  if (previous !== next) {
    await atomicWriteFile(resolvedPath, next);
  }
  const status = await inspectLogConfig(resolvedPath);
  return { ...status, backupPath };
}

export async function autoRepairLogConfigOnStartup(options: {
  readonly environment?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
  readonly homeDir?: string;
  readonly onError?: (error: unknown) => void;
} = {}) {
  const environment = options.environment ?? process.env;
  if (shouldSkipLogConfigRepair(environment)) {
    return { status: "skipped-qa" as const };
  }

  try {
    const current = await inspectLogConfig(undefined, options.homeDir);
    if (hasAllRequiredLogs(current)) {
      return { status: "unchanged" as const, config: current };
    }
    const config = await ensureLogConfig(undefined, options.homeDir);
    return { status: "repaired" as const, config };
  } catch (error) {
    options.onError?.(error);
    return { status: "error" as const, error: formatError(error) };
  }
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
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}

function hasAllRequiredLogs(status: LogConfigStatus) {
  return status.hasPowerLog && status.hasZoneLog && status.hasDecksLog && status.hasArenaLog;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function hasFilePrintingEnabled(content: string | undefined, sectionName: string) {
  if (!content) {
    return false;
  }
  const section = findSection(content, sectionName);
  if (!section) {
    return false;
  }
  const body = content.slice(section.bodyStart, section.end);
  return /^[ \t]*FilePrinting[ \t]*=[ \t]*true[ \t]*(?:[#;].*)?$/im.test(body);
}

function mergeRequiredLogSections(original: string) {
  const lineEnding = original.includes("\r\n") ? "\r\n" : "\n";
  let content = original;

  for (const sectionName of REQUIRED_LOG_SECTIONS) {
    const section = findSection(content, sectionName);
    if (!section) {
      const separator = content.length === 0
        ? ""
        : content.endsWith(lineEnding + lineEnding)
          ? ""
          : content.endsWith(lineEnding)
            ? lineEnding
            : lineEnding + lineEnding;
      content += `${separator}[${sectionName}]${lineEnding}LogLevel=1${lineEnding}FilePrinting=true${lineEnding}ConsolePrinting=false${lineEnding}ScreenPrinting=false${lineEnding}`;
      continue;
    }

    const sectionBody = content.slice(section.bodyStart, section.end);
    const filePrinting = /^([ \t]*FilePrinting[ \t]*=[ \t]*)([^#;\r\n]*)(.*)$/im.exec(sectionBody);
    if (!filePrinting) {
      const headerSeparator = section.bodyStart > 0 && !content.slice(0, section.bodyStart).endsWith("\n")
        ? lineEnding
        : "";
      content = `${content.slice(0, section.bodyStart)}${headerSeparator}FilePrinting=true${lineEnding}${content.slice(section.bodyStart)}`;
      continue;
    }

    if (filePrinting[2]?.trim().toLocaleLowerCase() !== "true") {
      const valueStart = section.bodyStart + filePrinting.index + filePrinting[1].length;
      const valueEnd = valueStart + filePrinting[2].length;
      const trailingWhitespace = filePrinting[2].match(/[ \t]*$/)?.[0] ?? "";
      content = `${content.slice(0, valueStart)}true${trailingWhitespace}${content.slice(valueEnd)}`;
    }
  }

  return content;
}

function findSection(content: string, sectionName: string) {
  const headerPattern = /^[ \t]*\[([^\]\r\n]+)\][ \t]*(?:\r?\n|$)/gm;
  const headers = [...content.matchAll(headerPattern)];
  const index = headers.findIndex((header) => header[1]?.trim().toLocaleLowerCase() === sectionName.toLocaleLowerCase());
  if (index < 0) {
    return undefined;
  }
  const header = headers[index];
  return {
    bodyStart: (header.index ?? 0) + header[0].length,
    end: headers[index + 1]?.index ?? content.length
  };
}

function shouldSkipLogConfigRepair(environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>) {
  return environment.QA_SKIP_LOG_CONFIG_REPAIR === "1" ||
    Boolean(environment.QA_USER_DATA_DIR) ||
    Boolean(environment.QA_SCREENSHOT_PATH);
}

async function atomicWriteFile(filePath: string, content: string) {
  atomicWriteSequence += 1;
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${atomicWriteSequence}`;
  try {
    await fs.writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
