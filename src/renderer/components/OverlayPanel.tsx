import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Hand, Layers3, Settings, X } from "lucide-react";
import type { OverlayCardItem, OverlayPanelProps, OverlayStatusTone } from "../types";
import { CardHoverPreview } from "./CardHoverPreview";
import { PublicMatchCounters } from "./PublicMatchCounters";

const MAX_REASONABLE_OTHER_CARD_COUNT = 100;

export function OverlayPanel({ view, className = "overlay-shell", style, onClose, onOpenSettings, isLoading = false, loadError }: OverlayPanelProps) {
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
        {onOpenSettings ? (
          <button type="button" onClick={onOpenSettings} aria-label="打开软件设置" title="打开软件设置">
            <Settings aria-hidden="true" size={13} />
          </button>
        ) : null}
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
          <p>先点修复日志，完全退出并重新打开炉石，然后进入一局。</p>
          <ol>
            <li>修复日志</li>
            <li>完全退出并重新打开炉石</li>
            <li>进入一局</li>
          </ol>
          <span>当前不会展示默认示例卡组。</span>
        </section>
      ) : (
        <>
          {view.arena?.showDeckStats ? <ArenaOverlay view={view.arena} /> : <NormalOverlay view={view} />}
        </>
      )}
    </section>
  );
}

function NormalOverlay({ view }: { view: OverlayPanelProps["view"] }) {
  const [activeCardId, setActiveCardId] = useState<string>();
  const deckIdentity = resolveDeckIdentity(view);
  const globalEffects = view.globalEffects ?? [];
  const handCards = view.handCards ?? [];
  const otherCards = view.otherCards ?? [];
  const remainingDeck = view.remainingDeck.filter((item) => !isUnresolvedCard(item));
  const activeCard = [...globalEffects, ...remainingDeck, ...handCards, ...otherCards]
    .find((item) => item.id === activeCardId);
  const handleActiveCardChange = (card: OverlayCardItem | undefined) => setActiveCardId(card?.id);
  useEffect(() => {
    if (activeCardId && !activeCard) {
      setActiveCardId(undefined);
    }
  }, [activeCard, activeCardId]);
  const handCount = countCards(handCards);
  const otherCount = countCards(otherCards);
  const hasMissingDeckDetails =
    view.deckIdentity?.status !== "arena" &&
    view.summary.remainingCards > 0 &&
    remainingDeck.length === 0;
  const hasImplausibleOtherCount = otherCount > MAX_REASONABLE_OTHER_CARD_COUNT;
  const hasDataIntegrityWarning = hasMissingDeckDetails || hasImplausibleOtherCount;
  const deckTotal = view.arena?.deckCount;
  const unresolvedCount = view.arena?.unresolvedCount ?? 0;
  const confirmedCount = view.arena?.confirmedCount ?? 0;
  const deckCountLabel = unresolvedCount > 0
    ? `已确认 ${confirmedCount}，总计 ${confirmedCount + unresolvedCount}`
    : deckTotal === undefined
    ? "牌库剩余"
    : `牌库剩余 ${view.summary.remainingCards}，总计 ${deckTotal}`;
  const deckCountText = unresolvedCount > 0
    ? `${confirmedCount}/${confirmedCount + unresolvedCount}`
    : deckTotal === undefined
    ? String(view.summary.remainingCards)
    : `${view.summary.remainingCards}/${deckTotal}`;

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
        <span className="overlay-summary-count" aria-label={deckCountLabel} title={deckCountLabel}>
          <Layers3 aria-hidden="true" size={13} />
          <strong>{deckCountText}</strong>
        </span>
      </section>

      <PublicMatchCounters side="friendly" counters={view.friendlyCounters} />

      {hasDataIntegrityWarning ? (
        <p
          className="overlay-unresolved-warning overlay-data-integrity-warning"
          role="alert"
          aria-label="牌库数据异常"
          title="当前计数仅供排障，不会被隐藏或自动改写"
        >
          牌库数据异常，正在重新识别
        </p>
      ) : unresolvedCount > 0 ? (
        <p className="overlay-unresolved-warning" role="status" aria-label="牌库完整度">
          {unresolvedCount} 张待识别
        </p>
      ) : null}

      <div className="overlay-card-groups">
        <CollapsibleCardGroup
          label="影响全局"
          count={countCards(globalEffects)}
          items={globalEffects}
          emptyLabel="暂无全局影响"
          activeCard={activeCard}
          onActiveCardChange={handleActiveCardChange}
        />
        <CollapsibleCardGroup
          label="牌库中"
          count={view.summary.remainingCards}
          items={remainingDeck}
          emptyLabel="牌库中暂无卡牌"
          activeCard={activeCard}
          onActiveCardChange={handleActiveCardChange}
        />
        <CollapsibleCardGroup
          label="手牌中"
          count={handCount}
          items={handCards}
          emptyLabel="手牌中暂无卡牌"
          activeCard={activeCard}
          onActiveCardChange={handleActiveCardChange}
        />
        <CollapsibleCardGroup
          label="其他"
          count={otherCount}
          items={otherCards}
          emptyLabel="暂无其他卡牌"
          activeCard={activeCard}
          onActiveCardChange={handleActiveCardChange}
        />
      </div>
    </div>
  );
}

export function CollapsibleCardGroup({
  label,
  count,
  items,
  emptyLabel,
  children,
  activeCard,
  onActiveCardChange
}: {
  label: string;
  count: number;
  items: readonly OverlayCardItem[];
  emptyLabel: string;
  children?: ReactNode;
  activeCard?: OverlayCardItem;
  onActiveCardChange?: (card: OverlayCardItem | undefined) => void;
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
      {isExpanded ? (
        <div id={contentId} className="overlay-card-group-content">
          <CompactCardList
            items={items}
            emptyLabel={children ? undefined : emptyLabel}
            activeCard={activeCard}
            onActiveCardChange={onActiveCardChange}
          />
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function CompactCardList({
  items,
  emptyLabel,
  activeCard,
  onActiveCardChange
}: {
  items: readonly OverlayCardItem[];
  emptyLabel?: string;
  activeCard?: OverlayCardItem;
  onActiveCardChange?: (card: OverlayCardItem | undefined) => void;
}) {
  if (items.length === 0) {
    return emptyLabel ? <p className="overlay-card-group-empty">{emptyLabel}</p> : null;
  }

  return (
    <ul className="overlay-compact-card-list">
      {items.map((item) => {
        const cost = resolveCardCost(item);
        const count = resolveCardCount(item);
        const costLabel = cost === undefined ? "?" : String(cost);
        const isRelated = activeCard ? areCardsRelated(activeCard, item) : false;

        return (
          <li key={item.id}>
            <CardHoverPreview
              details={item.details}
              className={`overlay-compact-card-row${isRelated ? " is-synergy-related" : ""}`}
              isRelated={isRelated}
              onActiveChange={(isActive) => onActiveCardChange?.(isActive ? item : undefined)}
            >
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

function areCardsRelated(activeCard: OverlayCardItem, candidateCard: OverlayCardItem): boolean {
  const activeDetails = activeCard.details;
  const candidateDetails = candidateCard.details;
  if (!activeDetails || !candidateDetails || activeDetails.dbfId === candidateDetails.dbfId) {
    return false;
  }

  return referencesCard(activeDetails, candidateDetails) || referencesCard(candidateDetails, activeDetails);
}

function referencesCard(
  details: NonNullable<OverlayCardItem["details"]>,
  candidate: NonNullable<OverlayCardItem["details"]>
): boolean {
  return (
    details.relatedCards.some((card) => isSameCard(card, candidate)) ||
    details.synergyCards?.some((card) => isSameCard(card, candidate)) === true
  );
}

function isSameCard(
  referenced: NonNullable<OverlayCardItem["details"]>["relatedCards"][number],
  candidate: NonNullable<OverlayCardItem["details"]>
): boolean {
  if (referenced.dbfId === candidate.dbfId) {
    return true;
  }

  const referencedCardId = normalizeCardIdentity(referenced.cardId);
  const candidateCardId = normalizeCardIdentity(candidate.cardId);
  return Boolean(referencedCardId && candidateCardId && referencedCardId === candidateCardId);
}

function normalizeCardIdentity(cardId: string | undefined): string | undefined {
  return cardId?.trim().toLocaleUpperCase().replace(/^CORE_/, "");
}

function resolveCardCount(item: OverlayCardItem): number {
  return item.count ?? 1;
}

function isUnresolvedCard(item: OverlayCardItem): boolean {
  return item.unresolved === true;
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
  return (
    <section className="overlay-arena overlay-arena-stats" aria-label="竞技场卡组影响">
      <strong className="overlay-arena-stage" aria-label="竞技场阶段" title={view.statusLabel}>
        {view.statusLabel}
      </strong>
      <div className="overlay-arena-stats-header" aria-label="竞技场牌库表头">
        <span>选取率</span>
        <span>卡牌</span>
        <span>影响</span>
      </div>
      <ArenaDeckStatsList items={view.deck} />
    </section>
  );
}

function ArenaDeckStatsList({ items }: { items: readonly OverlayCardItem[] }) {
  const visibleItems = items.filter((item) => !isUnresolvedCard(item));
  if (visibleItems.length === 0) {
    return <p className="overlay-empty">尚未选择牌</p>;
  }

  return (
    <ul className="overlay-arena-stats-list">
      {visibleItems.map((item) => (
        <li key={item.id}>
          <CardHoverPreview details={item.details} className="overlay-arena-stats-row">
            <span
              className={`overlay-arena-stat-pick ${pickRateTone(item.pickRate)}`}
              aria-label={`选取率 ${formatPickRate(item.pickRate)}`}
            >
              {formatPickRate(item.pickRate)}
            </span>
            <span className="overlay-arena-stat-card">
              <span className="overlay-cost" aria-label={`费用 ${item.cost ?? "?"}`}>{item.cost ?? "?"}</span>
              {item.thumbnailUrl ? <img className="overlay-card-thumb" src={item.thumbnailUrl} alt="" loading="lazy" /> : null}
              <strong title={item.name}>{item.name}</strong>
              {(item.count ?? 1) > 1 ? <em aria-label={`数量 ${item.count}`}>{item.count}</em> : null}
            </span>
            <span
              className={`overlay-arena-stat-impact ${deckImpactTone(item.deckImpact)}`}
              aria-label={`卡组影响 ${formatDeckImpact(item.deckImpact)}`}
            >
              {formatDeckImpact(item.deckImpact)}
            </span>
          </CardHoverPreview>
        </li>
      ))}
    </ul>
  );
}

function formatPickRate(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function formatDeckImpact(value: number | undefined): string {
  return value === undefined ? "—" : value.toFixed(2);
}

function pickRateTone(value: number | undefined): "is-positive" | "is-negative" | "is-neutral" {
  return value !== undefined && value >= 70 ? "is-positive" : value !== undefined && value <= 30 ? "is-negative" : "is-neutral";
}

function deckImpactTone(value: number | undefined): "is-positive" | "is-negative" | "is-neutral" {
  return value === undefined || value === 0 ? "is-neutral" : value > 0 ? "is-positive" : "is-negative";
}

function StatusPill({ tone, label, title }: { tone: OverlayStatusTone; label: string; title?: string }) {
  return (
    <span className={`overlay-status overlay-status-${tone}`} style={statusToneStyles[tone]} title={title}>
      {label}
    </span>
  );
}

const statusToneStyles: Record<OverlayStatusTone, CSSProperties> = {
  ready: { borderColor: "rgba(201, 209, 217, 0.22)", color: "#e5edf6" },
  tracking: { borderColor: "rgba(94, 234, 212, 0.28)", color: "#b9fff3" },
  paused: { borderColor: "rgba(250, 204, 21, 0.32)", color: "#fff3ad" },
  offline: { borderColor: "rgba(251, 146, 60, 0.32)", color: "#ffd7b8" },
  error: { borderColor: "rgba(248, 113, 113, 0.34)", color: "#ffd0d0" }
};
