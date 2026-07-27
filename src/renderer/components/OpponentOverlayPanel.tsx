import type { CSSProperties } from "react";
import { Minus, ShieldQuestion } from "lucide-react";
import type { OpponentOverlayPanelProps, OverlayCardItem, OverlayStatusTone } from "../types";
import { CollapsibleCardGroup } from "./OverlayPanel";
import { PublicMatchCounters } from "./PublicMatchCounters";

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
  const secretCount = view.opponentSecrets?.length ?? 0;
  const opponentDeck = view.opponentDeck ?? [];
  const knownHand = view.opponentHand ?? [];
  const unknownHandCount = view.opponentUnknownHandCount ??
    Math.max(0, (view.opponentHandCount ?? countCards(knownHand)) - countCards(knownHand));
  const opponentHand = unknownHandCount > 0
    ? [...knownHand, ...createUndisclosedHandSlots(unknownHandCount)]
    : knownHand;
  const opponentOther = mergeCards(view.opponentOther ?? [], view.opponentRecentPlays);
  const otherCount = countCards(opponentOther) + secretCount;

  if (isCollapsed) {
    return (
      <section className={`${className} opponent-overlay-collapsed`} style={style} aria-label="对手记牌器置顶小窗">
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
    <section className={className} style={style} aria-label="对手记牌器置顶小窗" aria-busy={isLoading}>
      <header className="overlay-header">
        <div>
          <strong>对手记牌器</strong>
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
          <p>先点修复日志，完全退出并重新打开炉石，然后进入一局。</p>
        </section>
      ) : (
        <>
          <PublicMatchCounters side="opponent" counters={view.opponentCounters} />
          <div className="overlay-card-groups opponent-overlay-card-groups">
            <CollapsibleCardGroup
              label="影响全局"
              count={countCards(view.opponentGlobalEffects ?? [])}
              items={view.opponentGlobalEffects ?? []}
              emptyLabel="暂无全局影响"
            />
            <CollapsibleCardGroup
              label="牌库中"
              count={view.opponentDeckCount ?? countCards(opponentDeck)}
              items={opponentDeck}
              emptyLabel="牌库中暂无已知卡牌"
            />
            <CollapsibleCardGroup
              label="手牌中"
              count={view.opponentHandCount ?? countCards(opponentHand)}
              items={opponentHand}
              emptyLabel="手牌中暂无卡牌"
            />
            <CollapsibleCardGroup label="其他" count={otherCount} items={opponentOther} emptyLabel="暂无其他卡牌">
              {view.opponentSecrets?.length ? (
                <section className="opponent-secret-section" aria-label="对手奥秘">
                  {view.opponentSecrets.map((secret, index) => (
                    <section
                      key={secret.id}
                      className="opponent-secret-slot"
                      aria-label={`奥秘 ${index + 1} 候选`}
                    >
                      <strong className="opponent-secret-slot-label">奥秘 {index + 1}</strong>
                      <ul className="opponent-secret-candidates" aria-label={`${secret.label} 候选奥秘`}>
                        {secret.candidates.map((candidate) => (
                          <li key={candidate.id} className={`secret-candidate-${candidate.status}`}>
                            <strong>{candidate.name}</strong>
                            <span>{candidate.status === "excluded" ? "已排除" : "可能"}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </section>
              ) : null}
            </CollapsibleCardGroup>
          </div>
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

function countCards(items: readonly OverlayCardItem[]): number {
  return items.reduce((total, item) => total + (item.count ?? 1), 0);
}

function createUndisclosedHandSlots(count: number): OverlayCardItem[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: `opponent-undisclosed-hand-${index + 1}`,
    name: "未公开",
    count: 1
  }));
}

function mergeCards(current: readonly OverlayCardItem[], played: readonly OverlayCardItem[]): OverlayCardItem[] {
  const currentNames = new Set(current.map((item) => item.name.trim()));
  return [...current, ...played.filter((item) => !currentNames.has(item.name.trim()))];
}

const statusToneStyles: Record<OverlayStatusTone, CSSProperties> = {
  ready: { borderColor: "rgba(201, 209, 217, 0.22)", color: "#e5edf6" },
  tracking: { borderColor: "rgba(94, 234, 212, 0.28)", color: "#b9fff3" },
  paused: { borderColor: "rgba(250, 204, 21, 0.32)", color: "#fff3ad" },
  offline: { borderColor: "rgba(251, 146, 60, 0.32)", color: "#ffd7b8" },
  error: { borderColor: "rgba(248, 113, 113, 0.34)", color: "#ffd0d0" }
};
