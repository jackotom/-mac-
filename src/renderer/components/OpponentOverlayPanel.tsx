import { useState, type CSSProperties } from "react";
import { Minus, ShieldQuestion } from "lucide-react";
import type { OpponentOverlayPanelProps, OverlayCardItem, OverlayStatusTone } from "../types";
import { CardHoverPreview } from "./CardHoverPreview";

export function OpponentOverlayPanel({
  view,
  className = "overlay-shell opponent-overlay-shell",
  style,
  isCollapsed,
  onCollapsedChange,
  isLoading = false,
  loadError
}: OpponentOverlayPanelProps) {
  const needsLogRepair = view.status.tone === "offline";
  const [selectedSecretId, setSelectedSecretId] = useState<string>();
  const selectedSecret = view.opponentSecrets?.find((secret) => secret.id === selectedSecretId);
  const secretCount = view.opponentSecrets?.length ?? 0;

  if (isCollapsed) {
    return (
      <section className={`${className} opponent-overlay-collapsed`} style={style} aria-label="对手出牌置顶小窗">
        <button
          type="button"
          className="opponent-overlay-restore"
          onClick={() => onCollapsedChange?.(false)}
          aria-label={`恢复对手小窗，${secretCount} 个奥秘`}
        >
          <ShieldQuestion aria-hidden="true" size={18} />
          <strong>{secretCount}</strong>
        </button>
      </section>
    );
  }

  return (
    <section className={className} style={style} aria-label="对手出牌置顶小窗" aria-busy={isLoading}>
      <header className="overlay-header">
        <div>
          <strong>对手出牌</strong>
          <span>{isLoading ? "正在读取本机状态" : view.status.detail}</span>
        </div>
        <StatusPill tone={isLoading ? "offline" : view.status.tone} label={isLoading ? "读取中" : view.status.label} />
        <button type="button" onClick={() => onCollapsedChange?.(true)} aria-label="折叠对手小窗" title="折叠对手小窗">
          <Minus aria-hidden="true" size={14} />
        </button>
      </header>

      {isLoading ? (
        <section className="overlay-repair-prompt" role="status">
          <strong>正在读取对局状态</strong>
          <p>正在扫描炉石日志，请稍候。</p>
        </section>
      ) : loadError ? (
        <section className="overlay-repair-prompt" role="alert">
          <strong>读取失败</strong>
          <p>{loadError}</p>
          <span>请关闭并重新打开记牌器。</span>
        </section>
      ) : needsLogRepair ? (
        <section className="overlay-repair-prompt" role="status">
          <strong>{view.status.label}</strong>
          <p>先点修复日志，然后重启炉石/开始一局。</p>
        </section>
      ) : (
        <>
          {view.opponentSecrets?.length ? (
            <section className="opponent-secret-section" aria-label="对手奥秘">
              <div className="opponent-secret-tabs" role="group" aria-label="奥秘槽位">
                {view.opponentSecrets.map((secret, index) => {
                  const isExpanded = selectedSecret?.id === secret.id;
                  return (
                    <button
                      key={secret.id}
                      type="button"
                      aria-label={`查看奥秘 ${index + 1}`}
                      aria-expanded={isExpanded}
                      onClick={() => setSelectedSecretId(isExpanded ? undefined : secret.id)}
                    >
                      {secret.label}
                    </button>
                  );
                })}
              </div>
              {selectedSecret ? (
                <ul className="opponent-secret-candidates" aria-label={`${selectedSecret.label} 候选奥秘`}>
                  {selectedSecret.candidates.map((candidate) => (
                    <li key={candidate.id} className={`secret-candidate-${candidate.status}`}>
                      <strong>{candidate.name}</strong>
                      <span>{candidate.status === "excluded" ? "已排除" : "可能"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <section className="overlay-section opponent-overlay-section" aria-label="对手最近出牌">
            <SectionTitle label="对手出牌" count={view.opponentRecentPlays.length} />
            <OpponentPlayList items={view.opponentRecentPlays} />
          </section>
        </>
      )}
    </section>
  );
}

function StatusPill({ tone, label }: { tone: OverlayStatusTone; label: string }) {
  return (
    <span className={`overlay-status overlay-status-${tone}`} style={statusToneStyles[tone]}>
      {label}
    </span>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <div className="overlay-section-title opponent-overlay-section-title">
      <h2>{label}</h2>
      <em>{count}</em>
    </div>
  );
}

function OpponentPlayList({ items }: { items: readonly OverlayCardItem[] }) {
  if (items.length === 0) {
    return <p className="overlay-empty">暂无出牌</p>;
  }

  return (
    <ul className="overlay-opponent-list opponent-overlay-list">
      {items.map((item) => (
        <li key={item.id}>
          <CardHoverPreview details={item.details} className="overlay-card-hover-target">
            {item.thumbnailUrl ? <img className="overlay-card-thumb" src={item.thumbnailUrl} alt="" loading="lazy" /> : null}
            <div className="overlay-card-main">
              <strong title={item.name}>{item.name}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
            </div>
            {item.count ? <span className="overlay-count-badge">x{item.count}</span> : null}
          </CardHoverPreview>
        </li>
      ))}
    </ul>
  );
}

const statusToneStyles: Record<OverlayStatusTone, CSSProperties> = {
  ready: { borderColor: "rgba(201, 209, 217, 0.22)", color: "#e5edf6" },
  tracking: { borderColor: "rgba(94, 234, 212, 0.28)", color: "#b9fff3" },
  paused: { borderColor: "rgba(250, 204, 21, 0.32)", color: "#fff3ad" },
  offline: { borderColor: "rgba(251, 146, 60, 0.32)", color: "#ffd7b8" },
  error: { borderColor: "rgba(248, 113, 113, 0.34)", color: "#ffd0d0" }
};
