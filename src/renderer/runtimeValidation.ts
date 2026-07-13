import type { PublicTrackerState } from "../shared/types";

const trackerStatuses = new Set(["idle", "watching", "paused", "missing-log", "error"]);

export function parsePublicTrackerState(value: unknown): PublicTrackerState {
  if (!isRecord(value) || typeof value.status !== "string" || !trackerStatuses.has(value.status) || !Array.isArray(value.deck) ||
      !Array.isArray(value.opponentPlayed) || !Array.isArray(value.events) || !isSummary(value.summary)) {
    throw new Error("记牌器状态数据无效，已拒绝更新界面。");
  }
  return value as unknown as PublicTrackerState;
}

function isSummary(value: unknown): boolean {
  return isRecord(value) && ["totalCards", "remainingCards", "drawnCards", "opponentPlayedCount"]
    .every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
