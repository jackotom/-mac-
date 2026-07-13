import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ArenaScreenRecognizer,
  ScreenCaptureError,
  parseArenaOcrPayload,
  resolveArenaOcrHelperPath,
  selectArenaChoiceTexts
} from "../src/main/arenaScreenRecognition";

describe("arena screen recognition", () => {
  it("uses the project native helper during development even when Electron has a resources path", () => {
    const moduleUrl = "file:///project/dist-electron/main/arenaScreenRecognition.js";
    expect(resolveArenaOcrHelperPath("/Electron.app/Contents/Resources", moduleUrl, false))
      .toBe("/project/native/bin/arena-ocr");
  });

  it("uses the bundled Resources helper in a packaged app", () => {
    expect(resolveArenaOcrHelperPath("/Tracker.app/Contents/Resources", import.meta.url, true))
      .toBe("/Tracker.app/Contents/Resources/arena-ocr");
  });

  it("keeps only the three card-title lanes from an OCR response", () => {
    const result = parseArenaOcrPayload(JSON.stringify({
      status: "ok",
      observations: [
        { text: "小蜘蛛", confidence: 0.99, x: 0.215, y: 0.598, width: 0.04, height: 0.02 },
        { text: "痴醉歌迷", confidence: 0.99, x: 0.366, y: 0.591, width: 0.06, height: 0.03 },
        { text: "致命配方", confidence: 0.99, x: 0.536, y: 0.605, width: 0.05, height: 0.02 },
        { text: "构筑套牌", confidence: 0.99, x: 0.373, y: 0.928, width: 0.06, height: 0.02 },
        { text: "抽两张随从牌", confidence: 0.99, x: 0.527, y: 0.539, width: 0.06, height: 0.02 },
        { text: "造成2点伤害。", confidence: 0.99, x: 0.208, y: 0.542, width: 0.06, height: 0.02 },
        { text: "2", confidence: 0.99, x: 0.331, y: 0.719, width: 0.02, height: 0.04 }
      ]
    }));

    expect(result.status).toBe("ok");
    expect(selectArenaChoiceTexts(result.texts)).toEqual(["小蜘蛛", "痴醉歌迷", "致命配方"]);
  });

  it("fails safely for malformed recognizer output", () => {
    expect(parseArenaOcrPayload("not json")).toMatchObject({ status: "failed", texts: [] });
  });

  it("passes a main-process screen capture to the local OCR helper", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arena-screen-test-"));
    const helperPath = path.join(directory, "fake-ocr");
    await writeFile(
      helperPath,
      `#!/bin/sh
test "$1" = "--image" || exit 2
test "$(cat "$2")" = "png-data" || exit 3
test "$3" = "--profile" || exit 4
test "$4" = "constructed" || exit 5
printf '%s\\n' '{"status":"ok","observations":[{"text":"偷取牌库","confidence":1,"x":0.72,"y":0.34,"width":0.06,"height":0.02}]}'
`,
      "utf8"
    );
    await chmod(helperPath, 0o755);

    try {
      const captureScreenImage = vi.fn(async () => Buffer.from("png-data"));
      const recognizer = new ArenaScreenRecognizer(helperPath, captureScreenImage);
      const result = await recognizer.recognize({ requireHearthstoneFrontmost: false, profile: "constructed" });

      expect(captureScreenImage).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ status: "ok", texts: [{ text: "偷取牌库" }] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers automatically after screen capture permission becomes available", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arena-screen-test-"));
    const helperPath = path.join(directory, "fake-ocr");
    await writeFile(
      helperPath,
      `#!/bin/sh
if [ "$1" = "--request-screen-permission" ]; then
  exit 0
fi
test "$1" = "--image" || exit 2
printf '%s\\n' '{"status":"ok","observations":[{"text":"偷取牌库","confidence":1,"x":0.72,"y":0.34,"width":0.06,"height":0.02}]}'
`,
      "utf8"
    );
    await chmod(helperPath, 0o755);

    try {
      const captureScreenImage = vi
        .fn<() => Promise<Buffer>>()
        .mockRejectedValueOnce(new Error("permission denied"))
        .mockResolvedValue(Buffer.from("png-data"));
      const recognizer = new ArenaScreenRecognizer(helperPath, captureScreenImage);

      expect(await recognizer.recognize({ requireHearthstoneFrontmost: false })).toMatchObject({
        status: "permission-denied"
      });
      expect(await recognizer.recognize({ requireHearthstoneFrontmost: false })).toMatchObject({
        status: "ok",
        texts: [{ text: "偷取牌库" }]
      });
      expect(captureScreenImage).toHaveBeenCalledTimes(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports a transient capture failure without treating it as missing permission", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arena-screen-test-"));
    const helperPath = path.join(directory, "fake-ocr");
    await writeFile(helperPath, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(helperPath, 0o755);

    try {
      const captureScreenImage = vi.fn(async () => {
        throw new ScreenCaptureError("capture-failed", "temporary capture failure");
      });
      const recognizer = new ArenaScreenRecognizer(helperPath, captureScreenImage);

      expect(await recognizer.recognize({ requireHearthstoneFrontmost: false })).toMatchObject({
        status: "capture-failed",
        message: "temporary capture failure"
      });
      expect(captureScreenImage).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
