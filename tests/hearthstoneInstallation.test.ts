import { describe, expect, it, vi } from "vitest";
import { detectHearthstoneInstallation } from "../src/main/hearthstoneInstallation.js";

const plist = (version?: string) => version
  ? `<?xml version="1.0"?><plist><dict><key>CFBundleVersion</key><string>${version}</string></dict></plist>`
  : `<?xml version="1.0"?><plist><dict></dict></plist>`;

describe("detectHearthstoneInstallation", () => {
  it.each([["36.0.246003", "36.0"], ["36.0.0.246003", "36.0"]])("normalizes %s to %s", async (fullVersion, patch) => {
    const readFile = vi.fn(async (file: string) => file.endsWith("Info.plist") ? plist(fullVersion) : Buffer.from("CHN zhCN 36.0.0.246003"));
    await expect(detectHearthstoneInstallation({ readFile })).resolves.toMatchObject({
      status: "detected", fullVersion, patch, region: "CN", appPath: "/Applications/Hearthstone/Hearthstone.app"
    });
  });

  it("finds a custom installation from the Battle.net product record", async () => {
    const custom = "/Games/Hearthstone";
    const readFile = vi.fn(async (file: string) => {
      if (file.endsWith(".product.db")) return Buffer.from(`${custom}\0CHN\0zhCN\0${"36.0.0.246003"}`);
      if (file === `${custom}/Hearthstone.app/Contents/Info.plist`) return plist("36.0.246003");
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });
    await expect(detectHearthstoneInstallation({
      defaultInstallRoot: "/missing", productDbPaths: ["/battle/.product.db"], readFile
    })).resolves.toMatchObject({ status: "detected", appPath: `${custom}/Hearthstone.app`, source: "battle-net-product-db" });
  });

  it("reports a missing version", async () => {
    const readFile = vi.fn(async (file: string) => file.endsWith("Info.plist") ? plist() : Buffer.from("CHN zhCN"));
    await expect(detectHearthstoneInstallation({ readFile })).resolves.toMatchObject({ status: "version-unreadable" });
  });

  it("refuses an installation without Chinese-server evidence", async () => {
    const readFile = vi.fn(async (file: string) => file.endsWith("Info.plist") ? plist("36.0.246003") : Buffer.from("US enUS"));
    await expect(detectHearthstoneInstallation({ readFile })).resolves.toMatchObject({ status: "region-unverified" });
  });
});
