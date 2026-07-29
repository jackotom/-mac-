import type {
  PublicCardHistoryGroup,
  PublicCardHistoryItem,
  PublicCardTracking,
  PublicCardZone,
  PublicCardZoneGroup
} from "../shared/types";
import type { CardDetails } from "../shared/cardDatabase";
import type {
  OverlayCardHistoryView,
  OverlayCardItem,
  OverlayCardTrackingView,
  OverlayCardZoneView,
  OverlayHistoryItem,
  OverlaySecretSlot
} from "./types";

const cardZones = ["deck", "hand", "play", "secret", "graveyard", "removed"] as const;

export function toCardTrackingView(
  tracking: PublicCardTracking,
  side: "friendly" | "opponent",
  options: { showSecretCandidates: boolean }
): OverlayCardTrackingView {
  const player = tracking[side];
  const secretSlots = side === "opponent"
    ? toSecretSlots(tracking, options.showSecretCandidates)
    : [];

  return {
    status: "ready",
    gameKey: tracking.gameKey,
    side,
    current: Object.fromEntries(cardZones.map((zone) => [
      zone,
      toCurrentGroup(tracking, zone, player.current[zone], side, secretSlots.length)
    ])) as Readonly<Record<PublicCardZone, OverlayCardZoneView>>,
    burned: toHistoryGroup(tracking, "burned", player.burned),
    used: toHistoryGroup(tracking, "used", player.used),
    secretSlots
  };
}

function toCurrentGroup(
  tracking: PublicCardTracking,
  zone: PublicCardZone,
  group: PublicCardZoneGroup,
  side: "friendly" | "opponent",
  secretSlotCount: number
): OverlayCardZoneView {
  return {
    key: zone,
    status: group.status,
    knownCount: group.knownCount,
    totalCount: group.totalCount,
    countLabel: side === "opponent" && zone === "secret"
      ? `当前 ${secretSlotCount}`
      : toZoneCountLabel(group),
    cards: group.cards.map((card): OverlayCardItem => {
      const details = tracking.detailsByCardKey[card.cardKey];
      return {
        id: `${zone}-${card.cardKey}`,
        name: card.name,
        count: card.count,
        cost: details?.manaCost,
        thumbnailUrl: details?.cropImageUrl ?? details?.imageUrl,
        details
      };
    })
  };
}

function toZoneCountLabel(group: PublicCardZoneGroup): string {
  if (group.status === "unknown") {
    return "?";
  }
  if (group.status === "partial") {
    return `≥${group.knownCount}`;
  }
  return String(group.totalCount ?? group.knownCount);
}

function toHistoryGroup(
  tracking: PublicCardTracking,
  key: "burned" | "used",
  group: PublicCardHistoryGroup
): OverlayCardHistoryView {
  return {
    key,
    totalCount: group.totalCount,
    countLabel: group.truncated
      ? `最近 ${group.items.length} / 共 ${group.totalCount}`
      : String(group.totalCount),
    truncated: group.truncated,
    items: group.items.map((item) => toHistoryItem(tracking, item))
  };
}

function toHistoryItem(
  tracking: PublicCardTracking,
  item: PublicCardHistoryItem
): OverlayHistoryItem {
  const baseDetails = item.card
    ? tracking.detailsByCardKey[item.card.cardKey]
    : undefined;
  const details = mergeHistoryDetails(baseDetails, item.outcomeSections);

  return {
    id: item.id,
    sequence: item.sequence,
    displayName: item.card?.name,
    hidden: item.card === undefined,
    confidence: item.confidence,
    details
  };
}

function mergeHistoryDetails(
  baseDetails: CardDetails | undefined,
  outcomeSections: PublicCardHistoryItem["outcomeSections"]
): CardDetails | undefined {
  if (!baseDetails) {
    return undefined;
  }
  if (outcomeSections === undefined) {
    return baseDetails;
  }
  return {
    ...baseDetails,
    cardOutcomeSections: outcomeSections
  };
}

function toSecretSlots(
  tracking: PublicCardTracking,
  showSecretCandidates: boolean
): readonly OverlaySecretSlot[] {
  return tracking.opponentSecretSlots.map((slot, slotIndex) => ({
    id: slot.entityId,
    label: `? ${slotIndex + 1}`,
    candidates: showSecretCandidates
      ? slot.candidates.map((candidate) => ({
          id: candidate.cardId,
          name: candidate.name,
          status: candidate.status
        }))
      : []
  }));
}
