import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const main = fs.readFileSync(
  path.resolve(import.meta.dirname, "../src/main/main.ts"),
  "utf8"
);

describe("startup health integration", () => {
  it("isolates QA diagnostics before creating the logger", () => {
    const userDataSetup = main.indexOf(
      'app.setPath("userData", process.env.QA_USER_DATA_DIR)'
    );
    const logsSetup = main.indexOf('app.setPath("logs"');
    const loggerCreation = main.indexOf("new DiagnosticLogger");

    expect(userDataSetup).toBeGreaterThan(-1);
    expect(logsSetup).toBeGreaterThan(userDataSetup);
    expect(loggerCreation).toBeGreaterThan(logsSetup);
  });

  it("runs health checking before registering IPC or creating the main window", () => {
    const healthCheck = main.indexOf("await runStartupHealthCheck");
    const registerIpc = main.indexOf("registerIpc();", healthCheck);
    const createWindow = main.indexOf("await createWindow();", healthCheck);

    expect(healthCheck).toBeGreaterThan(-1);
    expect(registerIpc).toBeGreaterThan(healthCheck);
    expect(createWindow).toBeGreaterThan(registerIpc);
  });

  it("shows one native blocking dialog and exits before entering the app", () => {
    expect(main).toMatch(
      /healthCheck\.status === "blocked"[\s\S]*?dialog\.showMessageBox[\s\S]*?formatStartupHealthFailures[\s\S]*?app\.quit\(\)[\s\S]*?return/
    );
  });

  it("checks the renderer, preload and packaged native helpers", () => {
    const healthCheckStart = main.indexOf("await runStartupHealthCheck");
    const healthCheckSource = main.slice(
      healthCheckStart,
      main.indexOf("if (healthCheck.status", healthCheckStart)
    );

    expect(healthCheckSource).toContain("dist/index.html");
    expect(healthCheckSource).toContain("preload.cjs");
    expect(healthCheckSource).toContain("resolveArenaOcrHelperPath");
    expect(healthCheckSource).toContain("resolveFrontmostAppHelperPath");
  });

  it("uses repaired settings and records repairs before normal startup", () => {
    expect(main).toContain("trackerSettings = healthCheck.settings");
    expect(main).toMatch(
      /healthCheck\.repairs[\s\S]*?diagnosticLogger\.info\("启动自动检修已修复问题"/
    );
  });

  it("turns unexpected boot failures into one blocking error instead of a headless process", () => {
    expect(main).toMatch(
      /app\.whenReady\(\)\.then\(async \(\) => \{[\s\S]*?\}\)\.catch\(async \(error\) => \{[\s\S]*?启动过程发生无法自动修复的问题[\s\S]*?dialog\.showMessageBox[\s\S]*?app\.quit\(\)/
    );
  });
});
