import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type HearthstoneInstallationResult =
  | { readonly status: "detected"; readonly fullVersion: string; readonly patch: string; readonly region: "CN"; readonly appPath: string; readonly source: "default-path" | "battle-net-product-db" }
  | { readonly status: "not-found" | "version-unreadable" | "region-unverified"; readonly message: string };

interface DetectionOptions {
  readonly defaultInstallRoot?: string;
  readonly productDbPaths?: readonly string[];
  readonly readFile?: (file: string) => Promise<string | Buffer>;
  readonly readPlistVersion?: (file: string) => Promise<string | undefined>;
}

export async function detectHearthstoneInstallation(options: DetectionOptions = {}): Promise<HearthstoneInstallationResult> {
  const usingDefaultReadFile = options.readFile === undefined;
  const readFile = options.readFile ?? ((file: string) => fs.readFile(file));
  const defaultRoot = options.defaultInstallRoot ?? "/Applications/Hearthstone";
  const productDbPaths = options.productDbPaths ?? [
    path.join(defaultRoot, ".product.db"),
    path.join(os.homedir(), "Library", "Application Support", "Battle.net", "Agent", "product.db")
  ];
  const records = await Promise.all(productDbPaths.map(async (file) => {
    try { return Buffer.from(await readFile(file)).toString("utf8"); } catch { return ""; }
  }));
  const combinedRecord = records.join("\n");
  const customRoots = records.flatMap(extractInstallRoots);
  const candidates = [
    { root: defaultRoot, source: "default-path" as const },
    ...customRoots.filter((root) => root !== defaultRoot).map((root) => ({ root, source: "battle-net-product-db" as const }))
  ];

  let foundApp = false;
  let foundVersion: string | undefined;
  for (const candidate of candidates) {
    const appPath = candidate.root.endsWith(".app") ? candidate.root : path.join(candidate.root, "Hearthstone.app");
    const plistPath = path.join(appPath, "Contents", "Info.plist");
    const fullVersion = await readVersion(plistPath, readFile, options.readPlistVersion, usingDefaultReadFile);
    if (!fullVersion) {
      try { await readFile(plistPath); foundApp = true; } catch { /* candidate does not exist */ }
      continue;
    }
    foundApp = true;
    foundVersion = fullVersion;
    if (!hasCnEvidence(combinedRecord)) continue;
    const patch = normalizePatch(fullVersion);
    if (!patch) return { status: "version-unreadable", message: "已找到炉石传说，但无法读取有效版本" };
    return { status: "detected", fullVersion, patch, region: "CN", appPath, source: candidate.source };
  }
  if (foundVersion && !hasCnEvidence(combinedRecord)) return { status: "region-unverified", message: "已找到炉石传说，但无法确认是国服安装" };
  if (foundApp) return { status: "version-unreadable", message: "已找到炉石传说，但无法读取版本" };
  return { status: "not-found", message: "未找到炉石传说安装" };
}

export function normalizePatch(version: string): string | undefined {
  const match = version.trim().match(/^(\d+)\.(\d+)(?:\.\d+){1,2}$/);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

async function readVersion(
  plistPath: string,
  readFile: (file: string) => Promise<string | Buffer>,
  injected?: (file: string) => Promise<string | undefined>,
  allowSystemPlist = false
): Promise<string | undefined> {
  if (injected) return injected(plistPath);
  try {
    const raw = Buffer.from(await readFile(plistPath)).toString("utf8");
    const xml = raw.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    if (xml) return xml.trim();
  } catch { return undefined; }
  if (!allowSystemPlist) return undefined;
  try {
    const { stdout } = await execFile("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleVersion", plistPath]);
    return stdout.trim() || undefined;
  } catch { return undefined; }
}

function extractInstallRoots(record: string): string[] {
  return [...record.matchAll(/\/(?:[^\0\r\n]+\/)*Hearthstone(?=\0|\r|\n|$)/g)].map((match) => match[0]);
}

function hasCnEvidence(record: string): boolean {
  return /(?:^|[^A-Za-z])(?:CHN|zhCN)(?:$|[^A-Za-z])/i.test(record);
}
