import { useEffect, useRef, useState } from "react";
import { Copy, Layers3, X } from "lucide-react";
import type { LadderDeckRecommendation, LadderMode } from "../../shared/ladderDeckRecommendation";

export type { LadderDeckRecommendation, LadderMode };

export interface LadderDeckRecommendationPanelProps {
  mode: LadderMode;
  gameVersion?: string;
  recommendation?: LadderDeckRecommendation;
  unavailable?: { readonly status: "unavailable"; readonly code?: string; readonly message: string };
  isCached?: boolean;
  isLoading?: boolean;
  loadError?: string;
  emptyMessage?: string;
  onRetry?: () => void;
  onCopyDeckCode: (deckCode: string) => Promise<void>;
  onClose?: () => void;
}

type CopyState = "idle" | "copying" | "copied" | "error";

export function LadderDeckRecommendationPanel({
  mode,
  gameVersion,
  recommendation,
  unavailable,
  isCached = false,
  isLoading = false,
  loadError,
  emptyMessage = "当前模式暂无可用推荐",
  onRetry,
  onCopyDeckCode,
  onClose
}: LadderDeckRecommendationPanelProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setCopyState("idle");
  }, [recommendation?.deckCode]);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  async function copyDeckCode() {
    if (!recommendation || copyState === "copying") return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setCopyState("copying");
    try {
      await onCopyDeckCode(recommendation.deckCode);
      setCopyState("copied");
      resetTimer.current = setTimeout(() => setCopyState("idle"), 1_500);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className="ladder-deck-shell" aria-label="天梯推荐" aria-busy={isLoading}>
      <header className="ladder-deck-header" aria-label="天梯推荐工具栏">
        <strong className="ladder-deck-title">
          <Layers3 aria-hidden="true" size={12} />
          <span>天梯推荐</span>
        </strong>
        <span className="ladder-deck-mode" aria-label="当前模式">
          {modeLabel(mode)}
        </span>
        {onClose ? (
          <button className="ladder-deck-close" type="button" onClick={onClose} aria-label="关闭推荐">
            <X aria-hidden="true" size={13} />
          </button>
        ) : null}
      </header>

      {isLoading ? (
        <PanelMessage className="is-loading" role="status" text={`正在获取${modeLabel(mode)}模式推荐`} />
      ) : unavailable ? (
        <UnavailableMessage unavailable={unavailable} onRetry={onRetry} />
      ) : loadError ? (
        <PanelMessage className="ladder-deck-error" role="alert" text={loadError} />
      ) : recommendation ? (
        <>
          <section className="ladder-deck-summary" aria-label="推荐卡组概览">
            <h2 className="ladder-deck-name">{recommendation.name}</h2>
            <div className="ladder-deck-meta">
              {gameVersion ? (
                <span className="ladder-deck-version" aria-label="炉石版本" title={`炉石版本 ${gameVersion}`}>
                  版本 {gameVersion}
                </span>
              ) : null}
              <span className="ladder-deck-class">{recommendation.className}</span>
              <span className="ladder-deck-source">{recommendation.source.name}</span>
              <span className="ladder-deck-updated">
                {isCached ? "缓存更新于" : "更新时间"} {formatUpdatedAt(recommendation.updatedAt)}
              </span>
            </div>
            <div className="ladder-deck-metrics">
              <span className="ladder-deck-metric" aria-label="胜率">
                <small>胜率</small>
                <strong>{formatWinRate(recommendation.winRate)}</strong>
              </span>
              <span className="ladder-deck-metric" aria-label="统计场次">
                <small>场次</small>
                <strong>{recommendation.games.toLocaleString("zh-CN")}</strong>
              </span>
            </div>
          </section>

          <section className="ladder-deck-card-section" aria-label="卡组牌表区域">
            <ul className="ladder-deck-card-list" aria-label="卡组牌表">
              {recommendation.cards.map((card, index) => (
                <li className="ladder-deck-card-row" key={`${card.name}-${index}`}>
                  <span className="ladder-deck-card-cost" aria-label={`费用 ${card.cost ?? "?"}`}>
                    {card.cost ?? "?"}
                  </span>
                  <strong className="ladder-deck-card-name">{card.name}</strong>
                  {card.count > 1 ? (
                    <span className="ladder-deck-card-count" aria-label={`数量 ${card.count}`}>
                      {card.count}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <footer className="ladder-deck-footer">
            {copyState === "error" ? (
              <span className="ladder-deck-feedback is-error" role="alert">
                复制失败，请重试
              </span>
            ) : null}
            <button
              className="ladder-deck-copy-button"
              type="button"
              onClick={copyDeckCode}
              disabled={copyState === "copying"}
              aria-label={copyState === "copied" ? "已复制" : "复制卡组代码"}
            >
              <Copy aria-hidden="true" size={13} />
              {copyState === "copied" ? "已复制" : copyState === "copying" ? "复制中" : "复制卡组代码"}
            </button>
          </footer>
        </>
      ) : (
        <PanelMessage className="is-empty" role="status" text={emptyMessage} />
      )}
    </section>
  );
}

const unavailableTitles: Readonly<Record<string, string>> = {
  "installation-not-found": "未找到炉石",
  "not-found": "未找到炉石",
  "version-unreadable": "无法读取版本",
  "region-unverified": "无法确认数据区域",
  "source-unconfigured": "等待排行数据",
  "network-failed": "网络更新失败",
  "no-current-patch-data": "当前版本暂无推荐",
  "invalid-data": "数据校验失败",
  "cache-expired": "缓存已过期"
};

function UnavailableMessage({
  unavailable,
  onRetry
}: {
  unavailable: NonNullable<LadderDeckRecommendationPanelProps["unavailable"]>;
  onRetry?: () => void;
}) {
  const title = unavailableTitles[unavailable.code ?? ""] ?? "天梯推荐暂不可用";
  const canRetry = unavailable.code === "installation-not-found" || unavailable.code === "not-found" || unavailable.code === "version-unreadable";
  return (
    <div className="ladder-deck-message ladder-deck-error" role="alert">
      <strong>{title}</strong>
      <span>{unavailable.message}</span>
      {canRetry && onRetry ? (
        <button className="ladder-deck-retry-button" type="button" onClick={onRetry}>
          重新检测
        </button>
      ) : null}
    </div>
  );
}

function PanelMessage({ className, role, text }: { className: string; role: "alert" | "status"; text: string }) {
  return (
    <div className={`ladder-deck-message ${className}`} role={role}>
      {text}
    </div>
  );
}

function modeLabel(mode: LadderMode) {
  return mode === "standard" ? "标准" : "狂野";
}

function formatWinRate(winRate: number) {
  return `${winRate.toFixed(1)}%`;
}

function formatUpdatedAt(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return updatedAt;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
