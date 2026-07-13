import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { CardDetails } from "../../shared/cardDatabase";
import type { CardPreviewAnchorRect } from "../../shared/types";
import { CardDetailBody } from "./CardDetailBody";

interface CardHoverPreviewProps {
  details?: CardDetails;
  children: ReactNode;
  className?: string;
}

const previewGap = 10;
const previewWidth = 280;
const hoverRetentionSlop = 4;
const externalHideDelayMs = 120;
let nextExternalPreviewOwnerId = 1;
let activeExternalPreviewOwnerId: number | undefined;

export function CardHoverPreview({ details, children, className }: CardHoverPreviewProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const externalRefreshTimerRef = useRef<number>();
  const externalHideTimerRef = useRef<number>();
  const externalPreviewOwnerIdRef = useRef<number>();
  const lastPointerRef = useRef<{ x: number; y: number }>();
  const [position, setPosition] = useState<{ top: number; left: number }>();
  const [isPinned, setIsPinned] = useState(false);
  const isPinnedRef = useRef(false);
  const canPreview = Boolean(details);
  if (externalPreviewOwnerIdRef.current === undefined) {
    externalPreviewOwnerIdRef.current = nextExternalPreviewOwnerId++;
  }

  useEffect(() => {
    if (!usesExternalCardPreview()) {
      return undefined;
    }

    function hideWhenWindowLosesFocus() {
      if (!isActiveExternalPreviewOwner()) {
        return;
      }

      clearPinnedPreview();
      hidePreview();
    }

    function hideWhenWindowIsLeft(event: Event) {
      if (!isActiveExternalPreviewOwner()) {
        return;
      }

      if (event instanceof MouseEvent) {
        updateLastPointerFromCoordinates(event.clientX, event.clientY);
      }
      if (!isPinnedRef.current && !isLastPointerInsideAnchor()) {
        scheduleExternalHide();
      }
    }

    function hideWhenDocumentIsHidden() {
      if (document.hidden && isActiveExternalPreviewOwner()) {
        clearPinnedPreview();
        hidePreview();
      }
    }

    window.addEventListener("blur", hideWhenWindowLosesFocus);
    window.addEventListener("mouseleave", hideWhenWindowIsLeft);
    document.addEventListener("visibilitychange", hideWhenDocumentIsHidden);
    const unsubscribePinnedChange = window.hearthstoneTracker?.onCardPreviewPinnedChange?.((pinned) => {
      if (!isActiveExternalPreviewOwner()) {
        return;
      }
      isPinnedRef.current = pinned;
      setIsPinned(pinned);
      if (pinned) {
        clearExternalHideTimer();
      }
    });

    return () => {
      window.removeEventListener("blur", hideWhenWindowLosesFocus);
      window.removeEventListener("mouseleave", hideWhenWindowIsLeft);
      document.removeEventListener("visibilitychange", hideWhenDocumentIsHidden);
      unsubscribePinnedChange?.();
      stopExternalPreview();
    };
  }, []);

  function showPreview(event?: ReactMouseEvent<HTMLDivElement>) {
    if (usesExternalCardPreview()) {
      clearExternalHideTimer();
    }

    if (event) {
      updateLastPointerFromCoordinates(event.clientX, event.clientY);
    }

    if (!canPreview || !details || !anchorRef.current) {
      return;
    }

    const rect = anchorRef.current.getBoundingClientRect();
    if (usesExternalCardPreview() && window.hearthstoneTracker?.showCardPreview) {
      showExternalPreview(details, rect);
      return;
    }

    const width = Math.min(previewWidth, Math.max(220, window.innerWidth - 12));
    const rightPosition = rect.right + previewGap;
    const leftPosition = rect.left - width - previewGap;
    const left = rightPosition + width <= window.innerWidth - 6
      ? rightPosition
      : leftPosition >= 6
        ? leftPosition
        : Math.max(6, (window.innerWidth - width) / 2);
    const estimatedHeight = Math.min(520, Math.max(240, window.innerHeight - 12));
    const top = Math.min(Math.max(6, rect.top - 8), Math.max(6, window.innerHeight - estimatedHeight - 6));
    setPosition({ top, left });
  }

  function hidePreview() {
    if (usesExternalCardPreview()) {
      stopExternalPreview();
    }
    setPosition(undefined);
  }

  function showExternalPreview(nextDetails: CardDetails, rect: DOMRect) {
    activeExternalPreviewOwnerId = externalPreviewOwnerIdRef.current;
    clearExternalHideTimer();

    void window.hearthstoneTracker?.showCardPreview?.({
      details: nextDetails,
      anchorRect: toAnchorRect(rect)
    });

    if (externalRefreshTimerRef.current !== undefined) {
      return;
    }

    externalRefreshTimerRef.current = window.setInterval(() => {
      if (!isActiveExternalPreviewOwner()) {
        stopExternalPreview({ hideWindow: false, releaseActiveOwner: false });
        return;
      }

      const anchor = anchorRef.current;
      if (!anchor || document.hidden) {
        hidePreview();
        return;
      }

      if (!isPinnedRef.current && !anchor.matches(":hover") && !isLastPointerInsideAnchor()) {
        scheduleExternalHide();
        return;
      }

      clearExternalHideTimer();
      void window.hearthstoneTracker?.showCardPreview?.({
        details: nextDetails,
        anchorRect: toAnchorRect(anchor.getBoundingClientRect())
      });
    }, 500);
  }

  function handlePointerLeave() {
    lastPointerRef.current = undefined;
    if (!isPinnedRef.current) {
      if (usesExternalCardPreview()) {
        scheduleExternalHide();
      } else {
        hidePreview();
      }
    }
  }

  function handlePointerMove(event: ReactMouseEvent<HTMLDivElement>) {
    updateLastPointerFromCoordinates(event.clientX, event.clientY);
    if (usesExternalCardPreview() && isLastPointerInsideAnchor()) {
      clearExternalHideTimer();
    }
  }

  function updateLastPointerFromCoordinates(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    lastPointerRef.current = { x, y };
  }

  function isLastPointerInsideAnchor() {
    const anchor = anchorRef.current;
    const pointer = lastPointerRef.current;
    if (!anchor || !pointer) {
      return false;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    return (
      pointer.x >= rect.left - hoverRetentionSlop &&
      pointer.x <= rect.right + hoverRetentionSlop &&
      pointer.y >= rect.top - hoverRetentionSlop &&
      pointer.y <= rect.bottom + hoverRetentionSlop
    );
  }

  function stopExternalPreview(options: { hideWindow?: boolean; releaseActiveOwner?: boolean } = {}) {
    const hideWindow = options.hideWindow ?? true;
    const releaseActiveOwner = options.releaseActiveOwner ?? true;

    clearExternalHideTimer();

    if (externalRefreshTimerRef.current !== undefined) {
      window.clearInterval(externalRefreshTimerRef.current);
      externalRefreshTimerRef.current = undefined;
    }

    const ownsActivePreview = isActiveExternalPreviewOwner();
    if (releaseActiveOwner && ownsActivePreview) {
      activeExternalPreviewOwnerId = undefined;
    }
    if (hideWindow && ownsActivePreview) {
      void window.hearthstoneTracker?.hideCardPreview?.();
    }
  }

  function scheduleExternalHide() {
    if (!isActiveExternalPreviewOwner() || isPinnedRef.current) {
      return;
    }

    if (externalHideTimerRef.current !== undefined) {
      return;
    }

    externalHideTimerRef.current = window.setTimeout(() => {
      externalHideTimerRef.current = undefined;
      if (!isActiveExternalPreviewOwner()) {
        return;
      }

      const anchor = anchorRef.current;
      if (!isPinnedRef.current && (!anchor || document.hidden || (!anchor.matches(":hover") && !isLastPointerInsideAnchor()))) {
        lastPointerRef.current = undefined;
        hidePreview();
      }
    }, externalHideDelayMs);
  }

  function isActiveExternalPreviewOwner() {
    return activeExternalPreviewOwnerId === externalPreviewOwnerIdRef.current;
  }

  function clearExternalHideTimer() {
    if (externalHideTimerRef.current === undefined) {
      return;
    }

    window.clearTimeout(externalHideTimerRef.current);
    externalHideTimerRef.current = undefined;
  }

  function clearPinnedPreview() {
    if (!isPinnedRef.current) {
      return;
    }

    isPinnedRef.current = false;
    setIsPinned(false);
  }

  const preview = details && position && typeof document !== "undefined"
    ? createPortal(
        <div
          className="card-hover-preview"
          role="tooltip"
          style={{ top: position.top, left: position.left } satisfies CSSProperties}
        >
          <CardDetailBody details={details} className="card-detail-body-hover" />
        </div>,
        document.body
      )
    : null;

  return (
    <div
      ref={anchorRef}
      className={className ? `card-hover-target ${className}` : "card-hover-target"}
      data-preview-pinned={isPinned}
      aria-keyshortcuts="Alt+Q"
      onMouseEnter={showPreview}
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      onFocus={() => showPreview()}
      onBlur={hidePreview}
    >
      {children}
      {preview}
    </div>
  );
}

function usesExternalCardPreview(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("overlay") === "1" || searchParams.get("opponent-overlay") === "1";
}

function toAnchorRect(rect: DOMRect): CardPreviewAnchorRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}
