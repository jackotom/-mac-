export interface LaunchAtLoginHost {
  setLoginItemSettings(settings: { openAtLogin: boolean }): void;
  getLoginItemSettings(): { openAtLogin: boolean };
}

export function applyLaunchAtLoginSetting(host: LaunchAtLoginHost, openAtLogin: boolean): void {
  host.setLoginItemSettings({ openAtLogin });
  const actual = host.getLoginItemSettings().openAtLogin;
  if (actual === openAtLogin) return;
  throw new Error(openAtLogin
    ? "系统未允许开启开机启动，请在“系统设置 → 通用 → 登录项”中允许后重试。"
    : "系统未允许关闭开机启动，请在“系统设置 → 通用 → 登录项”中关闭后重试。");
}
