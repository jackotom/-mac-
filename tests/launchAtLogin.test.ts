import { describe, expect, it, vi } from "vitest";
import { applyLaunchAtLoginSetting } from "../src/main/launchAtLogin";

describe("launch at login", () => {
  it("reads back the system result after writing", () => {
    const host = {
      setLoginItemSettings: vi.fn(),
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: true }))
    };

    expect(() => applyLaunchAtLoginSetting(host, true)).not.toThrow();
    expect(host.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
    expect(host.getLoginItemSettings).toHaveBeenCalledOnce();
  });

  it("throws a readable error when the system rejects the requested value", () => {
    const host = {
      setLoginItemSettings: vi.fn(),
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: false }))
    };

    expect(() => applyLaunchAtLoginSetting(host, true)).toThrow("系统未允许开启开机启动");
  });
});
