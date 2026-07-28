import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("card preview delivery", () => {
  it("resends details when the same visible preview is refreshed", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/main/main.ts"), "utf8");
    const sameRequestBranch = source.match(
      /if \(previewWindow\.isVisible\(\) && lastCardPreviewRequestKey === requestKey\) \{([\s\S]*?)\n  \}/
    )?.[1];

    expect(sameRequestBranch).toContain('previewWindow.webContents.send("tracker:card-preview:update", request.details)');
  });

  it("lets only the current source overlay hide the shared preview", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "../src/main/main.ts"), "utf8");

    expect(source).toContain(
      'secureHandle("tracker:hide-card-preview", (event) => {\n    hideCardPreviewWindow(BrowserWindow.fromWebContents(event.sender));'
    );
    expect(source).toContain(
      "if (sourceWindow && cardPreviewSourceWindow && sourceWindow !== cardPreviewSourceWindow)"
    );
  });
});
