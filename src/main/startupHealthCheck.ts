import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { TrackerSettings } from "../shared/types.js";

export interface StartupHealthFailure {
  readonly check: string;
  readonly reason: string;
  readonly action: string;
}

export interface StartupRequiredResource {
  readonly name: string;
  readonly path: string;
  readonly executable?: boolean;
}

interface StartupSettingsResult {
  readonly status: "unchanged" | "migrated" | "repaired";
  readonly settings: TrackerSettings;
  readonly backupPath?: string;
}

type StartupLogConfigResult =
  | { readonly status: "unchanged" | "repaired" | "skipped-qa" }
  | { readonly status: "error"; readonly error: string };

export type StartupHealthCheckResult =
  | {
      readonly status: "ready";
      readonly settings: TrackerSettings;
      readonly repairs: readonly string[];
    }
  | {
      readonly status: "blocked";
      readonly failures: readonly StartupHealthFailure[];
      readonly repairs: readonly string[];
    };

export interface StartupHealthCheckOptions {
  readonly userDataDirectory: string;
  readonly repairSettings: () => Promise<StartupSettingsResult>;
  readonly repairLogConfig: () => Promise<StartupLogConfigResult>;
  readonly requiredResources: readonly StartupRequiredResource[];
}

let probeSequence = 0;

export async function runStartupHealthCheck(
  options: StartupHealthCheckOptions
): Promise<StartupHealthCheckResult> {
  const dataDirectoryFailure = await checkUserDataDirectory(options.userDataDirectory);
  if (dataDirectoryFailure) {
    return { status: "blocked", failures: [dataDirectoryFailure], repairs: [] };
  }

  const repairs: string[] = [];
  const failures: StartupHealthFailure[] = [];
  let settings: TrackerSettings | undefined;

  try {
    const result = await options.repairSettings();
    settings = result.settings;
    if (result.status === "repaired") {
      repairs.push("已修复损坏的软件设置，并保留原文件备份。");
    } else if (result.status === "migrated") {
      repairs.push("已升级旧版软件设置。");
    }
  } catch (error) {
    failures.push({
      check: "软件设置",
      reason: formatError(error),
      action: "请确认软件数据目录可写；若仍失败，请重新安装最新版。"
    });
  }

  try {
    const result = await options.repairLogConfig();
    if (result.status === "repaired") {
      repairs.push("已修复炉石日志配置。");
    } else if (result.status === "error") {
      failures.push({
        check: "炉石日志配置",
        reason: result.error,
        action: "请确认当前用户可修改炉石配置目录，然后重新打开软件。"
      });
    }
  } catch (error) {
    failures.push({
      check: "炉石日志配置",
      reason: formatError(error),
      action: "请确认当前用户可修改炉石配置目录，然后重新打开软件。"
    });
  }

  for (const resource of options.requiredResources) {
    const failure = await checkRequiredResource(resource);
    if (failure) failures.push(failure);
  }

  if (failures.length > 0 || !settings) {
    return { status: "blocked", failures, repairs };
  }
  return { status: "ready", settings, repairs };
}

export function formatStartupHealthFailures(
  failures: readonly StartupHealthFailure[]
) {
  return failures
    .map((failure) =>
      `${failure.check}：${failure.reason}\n处理办法：${failure.action}`
    )
    .join("\n\n");
}

async function checkUserDataDirectory(
  directory: string
): Promise<StartupHealthFailure | undefined> {
  probeSequence += 1;
  const probePath = path.join(
    directory,
    `.startup-health-${process.pid}-${Date.now()}-${probeSequence}`
  );
  const movedProbePath = `${probePath}.verified`;
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(probePath, "hearthstone-tracker", {
      encoding: "utf8",
      flag: "wx"
    });
    const content = await fs.readFile(probePath, "utf8");
    if (content !== "hearthstone-tracker") {
      throw new Error("写入后的内容无法正确读取");
    }
    await fs.rename(probePath, movedProbePath);
    return undefined;
  } catch (error) {
    return {
      check: "软件数据目录",
      reason: formatError(error),
      action: "请检查磁盘空间和当前用户对该目录的读写权限，然后重新打开软件。"
    };
  } finally {
    await fs.rm(probePath, { force: true }).catch(() => undefined);
    await fs.rm(movedProbePath, { force: true }).catch(() => undefined);
  }
}

async function checkRequiredResource(
  resource: StartupRequiredResource
): Promise<StartupHealthFailure | undefined> {
  try {
    const metadata = await fs.stat(resource.path);
    if (!metadata.isFile()) throw new Error("目标不是文件");
    const mode = constants.R_OK | (resource.executable ? constants.X_OK : 0);
    await fs.access(resource.path, mode);
    return undefined;
  } catch (error) {
    return {
      check: resource.name,
      reason: formatError(error),
      action: "请重新安装最新版炉石记牌器。"
    };
  }
}

function formatError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}
