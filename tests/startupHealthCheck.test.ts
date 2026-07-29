import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatStartupHealthFailures,
  runStartupHealthCheck
} from "../src/main/startupHealthCheck";
import { DEFAULT_TRACKER_SETTINGS } from "../src/main/trackerSettingsStore";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function createTemporaryDirectory(prefix = "hearthstone-startup-health-") {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function createExecutable(directory: string, name: string) {
  const filePath = path.join(directory, name);
  await writeFile(filePath, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(filePath, 0o755);
  return filePath;
}

describe("startup health check", () => {
  it("accepts a healthy installation without leaving probe files", async () => {
    const userDataDirectory = await createTemporaryDirectory();
    const resourceDirectory = await createTemporaryDirectory();
    const helperPath = await createExecutable(resourceDirectory, "frontmost-app");

    const result = await runStartupHealthCheck({
      userDataDirectory,
      repairSettings: async () => ({
        status: "unchanged",
        settings: DEFAULT_TRACKER_SETTINGS
      }),
      repairLogConfig: async () => ({ status: "unchanged" }),
      requiredResources: [{ name: "前台检测组件", path: helperPath, executable: true }]
    });

    expect(result).toEqual({
      status: "ready",
      settings: DEFAULT_TRACKER_SETTINGS,
      repairs: []
    });
    expect(await readdir(userDataDirectory)).toEqual([]);
  });

  it("reports settings and log repairs while allowing startup", async () => {
    const userDataDirectory = await createTemporaryDirectory();

    const result = await runStartupHealthCheck({
      userDataDirectory,
      repairSettings: async () => ({
        status: "repaired",
        settings: DEFAULT_TRACKER_SETTINGS,
        backupPath: "/tmp/tracker-settings.json.bak"
      }),
      repairLogConfig: async () => ({ status: "repaired" }),
      requiredResources: []
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected ready result");
    expect(result.repairs).toEqual([
      "已修复损坏的软件设置，并保留原文件备份。",
      "已修复炉石日志配置。"
    ]);
  });

  it("blocks startup when the user data path is not a writable directory", async () => {
    const parent = await createTemporaryDirectory();
    const invalidDirectory = path.join(parent, "not-a-directory");
    await writeFile(invalidDirectory, "occupied", "utf8");
    const repairSettings = vi.fn(async () => ({
      status: "unchanged" as const,
      settings: DEFAULT_TRACKER_SETTINGS
    }));

    const result = await runStartupHealthCheck({
      userDataDirectory: invalidDirectory,
      repairSettings,
      repairLogConfig: async () => ({ status: "unchanged" }),
      requiredResources: []
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked result");
    expect(result.failures).toEqual([
      expect.objectContaining({
        check: "软件数据目录",
        action: "请检查磁盘空间和当前用户对该目录的读写权限，然后重新打开软件。"
      })
    ]);
    expect(repairSettings).not.toHaveBeenCalled();
  });

  it("blocks startup when settings cannot be repaired", async () => {
    const result = await runStartupHealthCheck({
      userDataDirectory: await createTemporaryDirectory(),
      repairSettings: async () => {
        throw new Error("permission denied");
      },
      repairLogConfig: async () => ({ status: "unchanged" }),
      requiredResources: []
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked result");
    expect(result.failures).toContainEqual({
      check: "软件设置",
      reason: "permission denied",
      action: "请确认软件数据目录可写；若仍失败，请重新安装最新版。"
    });
  });

  it("blocks startup when the Hearthstone log configuration cannot be repaired", async () => {
    const result = await runStartupHealthCheck({
      userDataDirectory: await createTemporaryDirectory(),
      repairSettings: async () => ({
        status: "unchanged",
        settings: DEFAULT_TRACKER_SETTINGS
      }),
      repairLogConfig: async () => ({
        status: "error",
        error: "operation not permitted"
      }),
      requiredResources: []
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked result");
    expect(result.failures).toContainEqual({
      check: "炉石日志配置",
      reason: "operation not permitted",
      action: "请确认当前用户可修改炉石配置目录，然后重新打开软件。"
    });
  });

  it("blocks startup when a required packaged helper is missing or not executable", async () => {
    const resourceDirectory = await createTemporaryDirectory();
    const nonExecutablePath = path.join(resourceDirectory, "arena-ocr");
    await writeFile(nonExecutablePath, "not executable", "utf8");

    const result = await runStartupHealthCheck({
      userDataDirectory: await createTemporaryDirectory(),
      repairSettings: async () => ({
        status: "unchanged",
        settings: DEFAULT_TRACKER_SETTINGS
      }),
      repairLogConfig: async () => ({ status: "unchanged" }),
      requiredResources: [
        { name: "竞技场识别组件", path: nonExecutablePath, executable: true },
        { name: "界面文件", path: path.join(resourceDirectory, "missing.html") }
      ]
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked result");
    expect(result.failures.map((failure) => failure.check)).toEqual([
      "竞技场识别组件",
      "界面文件"
    ]);
    expect(formatStartupHealthFailures(result.failures)).toContain(
      "请重新安装最新版炉石记牌器"
    );
  });
});
