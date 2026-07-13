import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("release verification entrypoint", () => {
  it("exposes one command for the complete release gate", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["verify:release"]).toBe("bash scripts/verify-release.sh");
  });

  it("fails closed while checking tests, build, replay, screenshots, signing, architecture, and launch", () => {
    const script = read("scripts/verify-release.sh");

    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("npm test");
    expect(script).toContain("npm run typecheck");
    expect(script).toContain("npm run build");
    expect(script).toContain("fixtures/logs/session-2026-07-10");
    expect(script).toContain("fixtures/logs/auto-match-session");
    expect(script).toContain("fixtures/logs/arena-session");
    expect(script).toContain("QA_LOG_PATH");
    expect(script).toContain("QA_OPEN_OVERLAY");
    expect(script).toContain("QA_OPEN_OPPONENT_OVERLAY");
    expect(script).toContain("QA_OPEN_ARENA_CHOICE_OVERLAY");
    expect(script).toContain("QA_OPEN_LADDER_DECK_OVERLAY");
    expect(script).toContain("QA_OPEN_BOARD_ATTACK_OVERLAY");
    expect(script).toContain("codesign --verify --deep --strict");
    expect(script).toContain("NSScreenCaptureUsageDescription");
    expect(script).toContain("lipo -archs");
    expect(script).toContain("launched_pid=$!");
  });

  it("documents generated evidence and manual-only screen recording acceptance", () => {
    const acceptance = read("docs/commercial-acceptance.md");

    expect(acceptance).toContain("npm run verify:release");
    expect(acceptance).toContain("outputs/release-verification");
    expect(acceptance).toContain("录屏权限仍需人工确认");
  });
});
