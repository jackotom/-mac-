import { useId, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Hand, Layers3, X } from "lucide-react";
import { getArenaScoreQuality } from "../../shared/arenaRatings";
import type { OverlayArenaChoice, OverlayCardItem, OverlayPanelProps, OverlayStatusTone } from "../types";
import { ArenaChoiceMetrics } from "./ArenaChoiceMetrics";
import { CardHoverPreview } from "./CardHoverPreview";

const arenaDeckShareStorageKey = "hearthstone.overlay.arenaDeckShare";
const defaultArenaDeckShare = 42;
const minArenaDeckShare = 26;
const maxArenaDeckShare = 68;

export function OverlayPanel({ view, className = "overlay-shell", style, onClose, isLoading = false, loadError }: OverlayPanelProps) {
  const needsLogRepair = view.status.tone === "offline";
  const displayedStatus = isLoading
    ? { tone: "offline" as const, label: "读取中", detail: "正在读取本机状态" }
    : loadError
      ? { tone: "error" as const, label: "读取失败", detail: loadError }
      : view.status;

  return (
    <section className={className} style={style} aria-label="炉石记牌器置顶小窗" aria-busy={isLoading}>
      <header className="overlay-header" aria-label="置顶小窗工具栏">
        <strong className="overlay-app-title" title="炉石记牌器">
          <Layers3 aria-hidden="true" className="lucide-layers-3" size={12} />
          <span>记牌器</span>
        </strong>
        <StatusPill tone={displayedStatus.tone} label={displayedStatus.label} title={displayedStatus.detail} />
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="关闭小窗" title="关闭小窗">
            <X aria-hidden="true" size={13} />
          </button>
        ) : null}
      </header>

      {isLoading ? (
        <section className="overlay-repair-prompt" role="status">
          <strong>正在读取记牌器状态</strong>
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
          <ol>
            <li>修复日志</li>
            <li>重启炉石</li>
            <li>开始一局</li>
          </ol>
          <span>当前不会展示默认示例卡组。</span>
        </section>
      ) : (
        <>
          {view.arena && isArenaDraftActive(view.arena) ? <ArenaOverlay view={view.arena} /> : <NormalOverlay view={view} />}
        </>
      )}
    </section>
  );
}

function isArenaDraftActive(view: NonNullable<OverlayPanelProps["view"]["arena"]>): boolean {
  return view.isChoosing || view.statusLabel === "选牌中" || view.statusLabel === "重选中";
}

function NormalOverlay({ view }: { view: OverlayPanelProps["view"] }) {
  const deckIdentity = resolveDeckIdentity(view);
  const handCards = view.handCards ?? [];
  const otherCards = view.otherCards ?? [];
  const handCount = countCards(handCards);
  const otherCount = countCards(otherCards);

  return (
    <div className="overlay-normal">
      <section className="overlay-deck-summary" aria-label="套牌概览">
        <span className="overlay-deck-identity-compact">
          <strong className="overlay-deck-name" title={`${deckIdentity.name} · ${deckIdentity.status} · ${deckIdentity.detail}`}>
            {deckIdentity.name}
          </strong>
          <ChevronDown aria-hidden="true" size={11} />
        </span>
        <span className="overlay-summary-count" aria-label="手牌总数" title="手牌总数">
          <Hand aria-hidden="true" size={13} />
          <strong>{handCount}</strong>
        </span>
        <span className="overlay-summary-count" aria-label="牌库剩余" title="牌库剩余">
          <Layers3 aria-hidden="true" size={13} />
          <strong>{view.summary.remainingCards}</strong>
        </span>
      </section>

      <div className="overlay-card-groups">
        <CollapsibleCardGroup
          label="牌库中"
          count={view.summary.remainingCards}
          items={view.remainingDeck}
          emptyLabel="牌库中暂无卡牌"
        />
        <CollapsibleCardGroup label="手牌中" count={handCount} items={handCards} emptyLabel="手牌中暂无卡牌" />
        <CollapsibleCardGroup label="其他" count={otherCount} items={otherCards} emptyLabel="暂无其他卡牌" />
      </div>
    </div>
  );
}

function CollapsibleCardGroup({
  label,
  count,
  items,
  emptyLabel
}: {
  label: string;
  count: number;
  items: readonly OverlayCardItem[];
  emptyLabel: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = useId();
  const accessibleLabel = `${label} ${count} 张`;

  return (
    <section className="overlay-card-group" aria-label={accessibleLabel} data-expanded={isExpanded ? "true" : "false"}>
      <button
        type="button"
        className="overlay-card-group-toggle"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span>
          {label} <em>({count})</em>
        </span>
        {isExpanded ? <ChevronDown aria-hidden="true" size={13} /> : <ChevronRight aria-hidden="true" size={13} />}
      </button>
      {isExpanded ? <CompactCardList id={contentId} items={items} emptyLabel={emptyLabel} /> : null}
    </section>
  );
}

function CompactCardList({
  id,
  items,
  emptyLabel
}: {
  id: string;
  items: readonly OverlayCardItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <p id={id} className="overlay-card-group-empty">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul id={id} className="overlay-compact-card-list">
      {items.map((item) => {
        const cost = resolveCardCost(item);
        const count = resolveCardCount(item);
        const costLabel = cost === undefined ? "?" : String(cost);

        return (
          <li key={item.id}>
            <CardHoverPreview details={item.details} className="overlay-compact-card-row">
              <span className={`overlay-card-cost ${rarityClassName(item.details?.rarity)}`} aria-label={`费用 ${costLabel}`}>
                {costLabel}
              </span>
              <span className="overlay-card-art">
                {item.thumbnailUrl ? (
                  <img className="overlay-card-art-image" src={item.thumbnailUrl} alt="" loading="lazy" />
                ) : null}
                <strong title={item.name}>{item.name}</strong>
              </span>
              {count > 1 ? (
                <span className="overlay-card-quantity" aria-label={`数量 ${count}`}>
                  {count}
                </span>
              ) : null}
            </CardHoverPreview>
          </li>
        );
      })}
    </ul>
  );
}

function countCards(items: readonly OverlayCardItem[]): number {
  return items.reduce((total, item) => total + resolveCardCount(item), 0);
}

function resolveCardCount(item: OverlayCardItem): number {
  return item.count ?? 1;
}

function resolveCardCost(item: OverlayCardItem): number | undefined {
  return item.cost ?? item.details?.manaCost;
}

function rarityClassName(rarity: string | undefined): string {
  const normalized = rarity?.trim().toLocaleLowerCase("zh-CN");
  return normalized ? `is-rarity-${normalized}` : "is-rarity-unknown";
}

type DeckIdentityTone = "recognized" | "manual" | "waiting";

interface ResolvedDeckIdentity {
  name: string;
  status: string;
  detail: string;
  tone: DeckIdentityTone;
}

interface OptionalDeckIdentity {
  name?: unknown;
  status?: unknown;
  label?: unknown;
  detail?: unknown;
  isAutoMatched?: unknown;
}

type OverlayViewWithOptionalDeckIdentity = OverlayPanelProps["view"] & {
  deckIdentity?: OptionalDeckIdentity | string;
  deckName?: unknown;
  autoMatchedDeckId?: unknown;
};

function resolveDeckIdentity(view: OverlayPanelProps["view"]): ResolvedDeckIdentity {
  const extendedView = view as OverlayViewWithOptionalDeckIdentity;
  const rawIdentity = extendedView.deckIdentity;
  const identity = rawIdentity && typeof rawIdentity === "object" ? rawIdentity : undefined;
  const name = asText(identity?.name) ?? asText(rawIdentity) ?? asText(extendedView.deckName);
  const status = asText(identity?.status) ?? asText(identity?.label);
  const detail = asText(identity?.detail);
  const normalizedStatus = status?.toLocaleLowerCase("zh-CN") ?? "";
  const isWaiting = !name || /等待|识别中|pending|unmatched|waiting/.test(normalizedStatus);
  const isAutomatic =
    Boolean(extendedView.autoMatchedDeckId) ||
    identity?.isAutoMatched === true ||
    /自动|匹配|识别|auto|match|identified/.test(normalizedStatus);

  if (isWaiting) {
    return {
      name: name ?? "等待识别",
      status: "识别中",
      detail: detail ?? "抽到或打出牌后自动匹配",
      tone: "waiting"
    };
  }

  if (isAutomatic) {
    return {
      name,
      status: "已自动识别",
      detail: detail ?? "已匹配当前对局牌库",
      tone: "recognized"
    };
  }

  return {
    name,
    status: "已加载",
    detail: detail ?? "正在记录当前对局",
    tone: "manual"
  };
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ArenaOverlay({ view }: { view: NonNullable<OverlayPanelProps["view"]["arena"]> }) {
  const [deckShare, setDeckShare] = useState(readArenaDeckShare);
  const showChoices = view.isChoosing && view.choices.length >= 3;
  const choiceShare = 100 - deckShare;
  const arenaGridStyle = {
    gridTemplateRows: showChoices
      ? `auto minmax(92px, ${choiceShare}fr) 14px minmax(78px, ${deckShare}fr) auto`
      : "auto minmax(0, 1fr) auto"
  } satisfies CSSProperties;

  function updateDeckShare(nextValue: string) {
    const nextShare = clampShare(Number(nextValue));
    setDeckShare(nextShare);
    try {
      window.localStorage.setItem(arenaDeckShareStorageKey, String(nextShare));
    } catch {
      // Local storage can be unavailable in tests or locked-down environments.
    }
  }

  return (
    <section
      className="overlay-arena"
      aria-label="竞技场选牌评分"
      data-choosing={showChoices ? "true" : "false"}
      style={arenaGridStyle}
    >
      <div className="overlay-arena-progress">
        <Metric label="已选" value={view.progress} />
        <Metric label="职业" value={view.hero} />
        <Metric label="评分" value={view.error ?? view.scoreSource ?? "等待"} />
      </div>

      {showChoices ? (
        <>
          <section className="overlay-section overlay-arena-choice-section" aria-label="当前竞技场候选牌">
            <SectionTitle label={`当前三选一 · ${view.statusLabel}`} count={view.choices.length} />
            <ArenaChoiceList choices={view.choices} />
          </section>

          <label className="overlay-arena-resizer" title="拖动调整上下区域">
            <span aria-hidden="true" />
            <input
              type="range"
              min={minArenaDeckShare}
              max={maxArenaDeckShare}
              value={deckShare}
              onChange={(event) => updateDeckShare(event.currentTarget.value)}
              aria-label="调整当前牌库高度"
            />
          </label>
        </>
      ) : null}

      <section className="overlay-section" aria-label="当前竞技场牌库">
        <SectionTitle label="当前牌库" count={view.deckCount} />
        <CardList items={view.deck} emptyLabel="尚未选择牌" listClassName="overlay-deck-list" />
      </section>

      {view.lastPick ? (
        <div className="overlay-arena-last-pick">
          <span>最近选择：{view.lastPick.name}</span>
          <Score score={view.lastPick.score} quality={view.lastPick.quality} />
        </div>
      ) : null}
    </section>
  );
}

function readArenaDeckShare(): number {
  try {
    return clampShare(Number(window.localStorage.getItem(arenaDeckShareStorageKey)));
  } catch {
    return defaultArenaDeckShare;
  }
}

function clampShare(value: number): number {
  if (!Number.isFinite(value)) {
    return defaultArenaDeckShare;
  }

  return Math.min(Math.max(Math.round(value), minArenaDeckShare), maxArenaDeckShare);
}

function ArenaChoiceList({ choices }: { choices: readonly OverlayArenaChoice[] }) {
  return (
    <ul className="overlay-deck-list overlay-arena-choice-list">
      {choices.map((choice) => (
        <li key={choice.id}>
          <CardHoverPreview details={choice.details} className="overlay-card-hover-target">
            {choice.thumbnailUrl ? <img className="overlay-card-thumb" src={choice.thumbnailUrl} alt="" loading="lazy" /> : null}
            <div className="overlay-card-main">
              <strong title={choice.name}>{choice.name}</strong>
              {choice.ratingSummary ? <small>{choice.ratingSummary}</small> : null}
            </div>
            <Score score={choice.score} quality={choice.quality} />
            <ArenaChoiceMetrics choice={choice} className="overlay-arena-choice-metrics" />
          </CardHoverPreview>
        </li>
      ))}
    </ul>
  );
}

function Score({ score, quality }: Pick<OverlayArenaChoice, "score" | "quality">) {
  const resolvedQuality = quality ?? getArenaScoreQuality(score);
  return (
    <span
      className={`overlay-arena-score overlay-arena-score-${resolvedQuality.tier}`}
      title={score === undefined ? "暂无评分" : `评分 ${score}，质量：${resolvedQuality.label}`}
    >
      <strong>{score === undefined ? "—" : score}</strong>
      <small>{resolvedQuality.label}</small>
    </span>
  );
}

function StatusPill({ tone, label, title }: { tone: OverlayStatusTone; label: string; title?: string }) {
  return (
    <span className={`overlay-status overlay-status-${tone}`} style={statusToneStyles[tone]} title={title}>
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="overlay-stat">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <div className="overlay-section-title">
      <h2>{label}</h2>
      <em>{count}</em>
    </div>
  );
}

function CardList({
  items,
  emptyLabel,
  listClassName
}: {
  items: readonly OverlayCardItem[];
  emptyLabel: string;
  listClassName: string;
}) {
  if (items.length === 0) {
    return <p className="overlay-empty">{emptyLabel}</p>;
  }

  return (
    <ul className={listClassName}>
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
