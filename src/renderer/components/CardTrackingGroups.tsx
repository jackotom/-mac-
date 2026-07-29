import {
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PublicCardZone } from "../../shared/types";
import {
  resolveFriendlyDefault,
  resolveOpponentDefault,
  trackingLayoutModeForHeight,
  type SelectionOrigin,
  type TrackingGroupKey,
  type TrackingLayoutMode,
  type TrackingPage,
  type TrackingSelection
} from "../cardTrackingLayout";
import type {
  OverlayCardHistoryView,
  OverlayCardItem,
  OverlayCardTrackingView,
  OverlayCardZoneView
} from "../types";
import { CardHoverPreview } from "./CardHoverPreview";

const currentKeys: readonly PublicCardZone[] = [
  "deck",
  "hand",
  "play",
  "secret",
  "graveyard",
  "removed"
];
const historyKeys = ["burned", "used"] as const;
const labels: Record<TrackingGroupKey, string> = {
  deck: "牌库",
  hand: "手牌",
  play: "场上",
  secret: "奥秘",
  graveyard: "墓地",
  removed: "移除",
  burned: "疑似烧毁",
  used: "已使用"
};

export function CardTrackingGroups({
  view,
  opponent = false
}: {
  readonly view: OverlayCardTrackingView;
  readonly opponent?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialMode = opponent
    ? "opponent"
    : trackingLayoutModeForHeight(window.innerHeight) ?? "tall";
  const [layoutMode, setLayoutMode] = useState<TrackingLayoutMode>(initialMode);
  const initial = initialSelection(view, initialMode);
  const [page, setPage] = useState<TrackingPage>(initial.page);
  const [expanded, setExpanded] = useState<ReadonlySet<TrackingGroupKey>>(initial.expanded);
  const [origin, setOrigin] = useState<SelectionOrigin>("system");
  const lastActivatedRef = useRef<TrackingGroupKey>(firstExpanded(initial.expanded, initial.page));
  const previousModeRef = useRef<TrackingLayoutMode>(initialMode);
  const previousGameKeyRef = useRef(view.gameKey);
  const previousSecretCountRef = useRef(view.secretSlots.length);

  useEffect(() => {
    if (opponent || typeof ResizeObserver === "undefined") return;
    const root = rootRef.current;
    if (!root) return;
    const observedElement = root.closest(".overlay-shell") ?? root;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      const nextMode = trackingLayoutModeForHeight(height);
      if (nextMode) setLayoutMode(nextMode);
    });
    observer.observe(observedElement);
    return () => observer.disconnect();
  }, [opponent]);

  useEffect(() => {
    if (previousGameKeyRef.current === view.gameKey) return;
    previousGameKeyRef.current = view.gameKey;
    previousSecretCountRef.current = view.secretSlots.length;
    const next = initialSelection(view, layoutMode);
    setPage(next.page);
    setExpanded(next.expanded);
    setOrigin("system");
    lastActivatedRef.current = firstExpanded(next.expanded, next.page);
  }, [layoutMode, view]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    if (previousMode === layoutMode) return;
    previousModeRef.current = layoutMode;
    if (layoutMode === "short") {
      const preferred = belongsToPage(lastActivatedRef.current, page)
        ? lastActivatedRef.current
        : firstExpanded(expanded, page);
      setExpanded(new Set([preferred]));
      return;
    }
    if (previousMode === "short" && layoutMode === "tall" && origin === "system") {
      setExpanded(resolveFriendlyDefault("tall", page).expanded);
    }
  }, [expanded, layoutMode, origin, page]);

  useEffect(() => {
    const secretCount = view.secretSlots.length;
    const gainedFirstSecret = previousSecretCountRef.current === 0 && secretCount > 0;
    previousSecretCountRef.current = secretCount;
    if (!gainedFirstSecret || origin === "user") return;
    setPage("current");
    setExpanded(new Set(["secret"]));
    lastActivatedRef.current = "secret";
  }, [origin, view.secretSlots.length]);

  useEffect(() => {
    const root = rootRef.current;
    const main = root?.querySelector<HTMLElement>(".card-tracking-main");
    const activeKey = firstExpanded(expanded, page);
    const activeGroup = root?.querySelector<HTMLElement>(`[data-group-key="${activeKey}"]`);
    if (!main || !activeGroup) return;
    main.scrollTop = Math.max(0, activeGroup.offsetTop - main.offsetTop);
  }, [expanded, page]);

  const handlePageChange = (nextPage: TrackingPage) => {
    if (nextPage === page) return;
    const mode = layoutMode === "opponent" ? "short" : layoutMode;
    const next = resolveFriendlyDefault(mode, nextPage);
    setPage(nextPage);
    setExpanded(next.expanded);
    setOrigin("user");
    lastActivatedRef.current = firstExpanded(next.expanded, nextPage);
  };

  const handleGroupToggle = (key: TrackingGroupKey) => {
    setOrigin("user");
    lastActivatedRef.current = key;
    if (layoutMode !== "tall") {
      setExpanded(new Set([key]));
      return;
    }
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleKeys: readonly TrackingGroupKey[] = page === "current" ? currentKeys : historyKeys;

  return (
    <div
      ref={rootRef}
      className="card-tracking-layout"
      data-layout-mode={layoutMode}
      data-tracking-page={page}
    >
      <main className="card-tracking-main" data-scroll-owner="card-tracking-main">
        {visibleKeys.map((key) => (
          <TrackingGroup
            key={key}
            groupKey={key}
            view={view}
            expanded={expanded.has(key)}
            onToggle={() => handleGroupToggle(key)}
          />
        ))}
      </main>
      <footer className="card-tracking-footer" aria-label="记牌页面">
        <button
          type="button"
          className={page === "current" ? "is-active" : undefined}
          aria-pressed={page === "current"}
          onClick={() => handlePageChange("current")}
        >
          当前
        </button>
        <button
          type="button"
          className={page === "history" ? "is-active" : undefined}
          aria-pressed={page === "history"}
          onClick={() => handlePageChange("history")}
        >
          历史
        </button>
      </footer>
    </div>
  );
}

function TrackingGroup({
  groupKey,
  view,
  expanded,
  onToggle
}: {
  readonly groupKey: TrackingGroupKey;
  readonly view: OverlayCardTrackingView;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const contentId = useId();
  const group = groupKey === "burned" || groupKey === "used"
    ? view[groupKey]
    : view.current[groupKey];
  const countLabel = group.countLabel;
  return (
    <section
      className="overlay-card-group"
      aria-label={`${labels[groupKey]} ${countLabel}`}
      data-group-key={groupKey}
      data-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        className="overlay-card-group-toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span>{labels[groupKey]} <em>({countLabel})</em></span>
        {expanded
          ? <ChevronDown aria-hidden="true" size={13} />
          : <ChevronRight aria-hidden="true" size={13} />}
      </button>
      {expanded ? (
        <div id={contentId} className="overlay-card-group-content">
          {groupKey === "burned" || groupKey === "used"
            ? <HistoryItems group={group as OverlayCardHistoryView} />
            : <CurrentItems
                group={group as OverlayCardZoneView}
                secretSlots={groupKey === "secret" ? view.secretSlots : []}
              />}
        </div>
      ) : null}
    </section>
  );
}

function CurrentItems({
  group,
  secretSlots
}: {
  readonly group: OverlayCardZoneView;
  readonly secretSlots: OverlayCardTrackingView["secretSlots"];
}) {
  const undisclosed = group.key === "hand" && group.totalCount !== undefined
    ? Math.max(0, group.totalCount - group.knownCount)
    : 0;
  const hasContent = group.cards.length > 0 || undisclosed > 0 || secretSlots.length > 0;
  return (
    <>
      <CardRows items={group.cards} />
      {undisclosed > 0 ? <p className="overlay-undisclosed-row">未公开 ×{undisclosed}</p> : null}
      {secretSlots.map((slot, index) => (
        <section key={slot.id} className="opponent-secret-slot" aria-label={`奥秘 ${index + 1} 候选`}>
          <strong className="opponent-secret-slot-label">奥秘 {index + 1}</strong>
          {slot.candidates.length > 0 ? (
            <ul className="opponent-secret-candidates" aria-label={`${slot.label} 候选奥秘`}>
              {slot.candidates.map((candidate) => (
                <li key={candidate.id} className={`secret-candidate-${candidate.status}`}>
                  <strong>{candidate.name}</strong>
                  <span>{candidate.status === "excluded" ? "已排除" : "可能"}</span>
                </li>
              ))}
            </ul>
          ) : <span className="overlay-secret-hidden">候选未显示</span>}
        </section>
      ))}
      {!hasContent ? <p className="overlay-card-group-empty">暂无记录</p> : null}
    </>
  );
}

function HistoryItems({ group }: { readonly group: OverlayCardHistoryView }) {
  if (group.items.length === 0) {
    return <p className="overlay-card-group-empty">暂无记录</p>;
  }
  return (
    <ul className="overlay-compact-card-list">
      {group.items.map((item) => (
        <li key={item.id}>
          <CardHoverPreview details={item.details} className="overlay-compact-card-row">
            <span className="overlay-card-cost" aria-label="顺序">{item.sequence}</span>
            <span className="overlay-card-art">
              <strong>{item.hidden ? "未公开记录" : item.displayName}</strong>
            </span>
            <span className="overlay-history-confidence">
              {item.confidence === "confirmed" ? "确认" : "推断"}
            </span>
          </CardHoverPreview>
        </li>
      ))}
    </ul>
  );
}

function CardRows({ items }: { readonly items: readonly OverlayCardItem[] }) {
  return (
    <ul className="overlay-compact-card-list">
      {items.map((item) => {
        const cost = item.cost ?? item.details?.manaCost;
        const count = item.count ?? 1;
        return (
          <li key={item.id}>
            <CardHoverPreview details={item.details} className="overlay-compact-card-row">
              <span className="overlay-card-cost" aria-label={`费用 ${cost ?? "?"}`}>
                {cost ?? "?"}
              </span>
              <span className="overlay-card-art">
                {item.thumbnailUrl
                  ? <img className="overlay-card-art-image" src={item.thumbnailUrl} alt="" loading="lazy" />
                  : null}
                <strong title={item.name}>{item.name}</strong>
              </span>
              {count > 1 ? <span className="overlay-card-quantity" aria-label={`数量 ${count}`}>{count}</span> : null}
            </CardHoverPreview>
          </li>
        );
      })}
    </ul>
  );
}

function initialSelection(
  view: OverlayCardTrackingView,
  layoutMode: TrackingLayoutMode
): TrackingSelection {
  if (layoutMode === "opponent") return resolveOpponentDefault(view);
  return resolveFriendlyDefault(layoutMode);
}

function firstExpanded(
  expanded: ReadonlySet<TrackingGroupKey>,
  page: TrackingPage
): TrackingGroupKey {
  return expanded.values().next().value ?? (page === "current" ? "deck" : "burned");
}

function belongsToPage(key: TrackingGroupKey, page: TrackingPage) {
  return page === "current"
    ? key !== "burned" && key !== "used"
    : key === "burned" || key === "used";
}
