import { BookOpen, FolderOpen, LayoutDashboard, MonitorUp, Pause, Play, ScrollText, Settings, Swords, Upload } from "lucide-react";
import type { TrackerStatus } from "../types";

export type MainView = "tracker" | "card-library";

interface TopBarProps {
  status: TrackerStatus;
  isTracking: boolean;
  isBusy: boolean;
  onToggleTracking: () => void;
  onChooseLogDirectory: () => void;
  onImportDeck: () => void;
  onEnsureLogConfig: () => void;
  onToggleOverlay: () => void;
  onToggleOpponentOverlay: () => void;
  onMinimize: () => void;
  activeView?: MainView;
  onShowCardLibrary?: () => void;
  onShowTracker?: () => void;
}

const statusLabels: Record<TrackerStatus["state"], string> = {
  ready: "待开始",
  tracking: "读取中",
  paused: "已暂停",
  offline: "未连接"
};

export function TopBar({
  status,
  isTracking,
  isBusy,
  onToggleTracking,
  onChooseLogDirectory,
  onImportDeck,
  onEnsureLogConfig,
  onToggleOverlay,
  onToggleOpponentOverlay,
  activeView = "tracker",
  onShowCardLibrary,
  onShowTracker
}: TopBarProps) {
  const isCardLibraryOpen = activeView === "card-library";
  const canSwitchView = isCardLibraryOpen ? Boolean(onShowTracker) : Boolean(onShowCardLibrary);

  return (
    <header className="top-bar" aria-label="记牌器工具栏">
      <section className="brand-block" aria-label="日志状态">
        <div className="brand-mark">
          <ScrollText aria-hidden="true" size={20} />
        </div>
        <div>
          <h1>炉石 Mac 记牌器</h1>
          <p title={status.logPath}>
            {status.logPath} · {status.watchedFiles} 个文件 · {status.parsedLines.toLocaleString("zh-CN")} 行
          </p>
        </div>
      </section>

      <section className="status-strip" aria-label="当前读取状态">
        <span className={`status-dot status-${status.state}`} aria-hidden="true" />
        <strong>{status.isLoading ? "正在读取" : statusLabels[status.state]}</strong>
        <span>同步 {status.lastSyncedAt}</span>
      </section>

      <nav className="top-actions" aria-label="主要操作">
        <button className="primary-action" type="button" onClick={onToggleTracking} disabled={isBusy} aria-busy={isBusy}>
          {isTracking ? <Pause aria-hidden="true" size={17} /> : <Play aria-hidden="true" size={17} />}
          {isBusy ? "处理中" : isTracking ? "暂停" : "开始"}
        </button>
        <button type="button" onClick={onChooseLogDirectory} disabled={isBusy} title="选择日志目录" aria-label="选择日志目录">
          <FolderOpen aria-hidden="true" size={17} />
          选择日志目录
        </button>
        <button type="button" onClick={onEnsureLogConfig} disabled={isBusy} title="修复日志" aria-label="修复日志">
          <Settings aria-hidden="true" size={17} />
          修复日志
        </button>
        <button type="button" onClick={onToggleOverlay} disabled={isBusy} title="打开记牌小窗" aria-label="打开记牌小窗">
          <MonitorUp aria-hidden="true" size={17} />
          小窗
        </button>
        {canSwitchView ? (
          <button
            className="icon-action"
            type="button"
            onClick={isCardLibraryOpen ? onShowTracker : onShowCardLibrary}
            disabled={isBusy}
            title={isCardLibraryOpen ? "返回对局面板" : "打开卡牌数据库"}
            aria-label={isCardLibraryOpen ? "返回对局面板" : "打开卡牌数据库"}
          >
            {isCardLibraryOpen ? <LayoutDashboard aria-hidden="true" size={17} /> : <BookOpen aria-hidden="true" size={17} />}
          </button>
        ) : null}
        <button
          className="icon-action"
          type="button"
          onClick={onToggleOpponentOverlay}
          disabled={isBusy}
          title="打开对手出牌小窗"
          aria-label="打开对手出牌小窗"
        >
          <Swords aria-hidden="true" size={17} />
        </button>
        <button type="button" onClick={onImportDeck} disabled={isBusy} title="手动导入卡组" aria-label="手动导入卡组">
          <Upload aria-hidden="true" size={17} />
          手动导入
        </button>
      </nav>
    </header>
  );
}
