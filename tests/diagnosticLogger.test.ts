import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DiagnosticLogger } from "../src/main/diagnosticLogger";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("DiagnosticLogger", () => {
  it("persists ordered diagnostic entries to the folder opened by settings", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hearthstone-diagnostics-"));
    temporaryDirectories.push(directory);
    const logger = new DiagnosticLogger(directory);

    logger.info("application started");
    logger.error("screen capture failed", new Error("window missing"));

    const lines = (await readFile(path.join(directory, "hearthstone-tracker.log"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toMatchObject([
      { level: "INFO", message: "application started" },
      { level: "ERROR", message: "screen capture failed", detail: expect.stringContaining("window missing") }
    ]);
  });

  it("keeps one bounded backup instead of growing forever", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hearthstone-diagnostics-rotation-"));
    temporaryDirectories.push(directory);
    const logger = new DiagnosticLogger(directory, 180);

    logger.info("first entry", "a".repeat(140));
    logger.info("second entry", "b".repeat(140));
    logger.info("third entry", "c".repeat(140));

    expect(await readFile(logger.backupFilePath, "utf8")).toContain("second entry");
    const activeLog = await readFile(logger.filePath, "utf8");
    expect(activeLog).toContain("third entry");
    expect(activeLog).not.toContain("first entry");
  });
});
