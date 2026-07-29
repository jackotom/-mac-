export interface WindowBounds {
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OverlayPositionSettings {
  readonly position: "left" | "right";
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface WindowBoundsNormalizationOptions {
  readonly defaultBounds: WindowBounds;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly migrateLegacyWidth?: number;
}

const defaultBounds: WindowBounds = { width: 100, height: 900 };
const minWidth = 100;
const minHeight = 200;
const arenaHeroDefaultWidth = 100;
const arenaHeroDefaultHeight = 560;
const arenaHeroLeftInset = 0;
const opponentDefaultWidth = 250;
const opponentDefaultHeight = 170;
const opponentEdgeGap = 24;

export function getDefaultOverlayWindowBounds(workArea: WorkArea): Required<WindowBounds> {
  const width = Math.min(defaultBounds.width, workArea.width);
  const height = Math.min(defaultBounds.height, workArea.height);
  return {
    x: workArea.x + workArea.width - width,
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  };
}

export function getDefaultArenaHeroRankingWindowBounds(workArea: WorkArea): Required<WindowBounds> {
  const width = Math.min(arenaHeroDefaultWidth, workArea.width);
  const height = Math.min(arenaHeroDefaultHeight, workArea.height);
  return {
    x: workArea.x + Math.min(arenaHeroLeftInset, Math.max(0, workArea.width - width)),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  };
}

export function getDefaultOpponentOverlayWindowBounds(workArea: WorkArea): Required<WindowBounds> {
  const width = Math.min(opponentDefaultWidth, workArea.width);
  const height = Math.min(opponentDefaultHeight, workArea.height);
  const heroBounds = getDefaultArenaHeroRankingWindowBounds(workArea);
  const desiredX = heroBounds.x + heroBounds.width + opponentEdgeGap;
  return {
    x: clamp(desiredX, workArea.x, workArea.x + workArea.width - width),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  };
}

export function getAnchoredOverlayWindowBounds(
  bounds: Required<WindowBounds>,
  workArea: WorkArea,
  settings: OverlayPositionSettings
): Required<WindowBounds> {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const edgeX = settings.position === "left"
    ? workArea.x
    : workArea.x + workArea.width - width;
  return {
    x: clamp(Math.round(edgeX + settings.offsetX), workArea.x, workArea.x + workArea.width - width),
    y: clamp(
      Math.round(workArea.y + (workArea.height - height) / 2 + settings.offsetY),
      workArea.y,
      workArea.y + workArea.height - height
    ),
    width,
    height
  };
}

export function normalizeOpponentOverlayWindowBounds(
  value: unknown,
  workAreas: readonly WorkArea[],
  fallbackWorkArea: WorkArea
): Required<WindowBounds> {
  const fallback = getDefaultOpponentOverlayWindowBounds(fallbackWorkArea);
  const normalized = normalizeOverlayWindowBounds(value, workAreas, {
    defaultBounds: fallback,
    minWidth: 100,
    minHeight: 150
  });
  if (normalized.x === undefined || normalized.y === undefined) return fallback;
  const restored = {
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height
  };
  if (!isSavedBounds(value) || workAreas.length === 0) return restored;

  const area = selectWorkArea(restored, workAreas);
  if (restored.x !== area.x) return restored;
  const heroBounds = getDefaultArenaHeroRankingWindowBounds(area);
  return {
    ...restored,
    x: clamp(
      heroBounds.x + heroBounds.width + opponentEdgeGap,
      area.x,
      area.x + area.width - restored.width
    )
  };
}

export function normalizeOverlayWindowBounds(
  value: unknown,
  workAreas: readonly WorkArea[],
  options: WindowBoundsNormalizationOptions = {
    defaultBounds,
    minWidth,
    minHeight,
    migrateLegacyWidth: 300
  }
): WindowBounds {
  if (!isSavedBounds(value)) {
    return { ...options.defaultBounds };
  }
  const savedBounds = options.migrateLegacyWidth !== undefined && value.width === options.migrateLegacyWidth
    ? { ...value, width: options.defaultBounds.width }
    : value;
  if (workAreas.length === 0) {
    return savedBounds;
  }

  const area = selectWorkArea(savedBounds, workAreas);
  const width = clamp(savedBounds.width, Math.min(options.minWidth, area.width), area.width);
  const height = clamp(savedBounds.height, Math.min(options.minHeight, area.height), area.height);
  return {
    x: clamp(savedBounds.x, area.x, area.x + area.width - width),
    y: clamp(savedBounds.y, area.y, area.y + area.height - height),
    width,
    height
  };
}

function isSavedBounds(value: unknown): value is Required<WindowBounds> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const bounds = value as Record<string, unknown>;
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(
    (part) => typeof part === "number" && Number.isFinite(part)
  ) && Number(bounds.width) > 0 && Number(bounds.height) > 0;
}

function selectWorkArea(bounds: Required<WindowBounds>, workAreas: readonly WorkArea[]) {
  return [...workAreas].sort((left, right) => intersectionArea(bounds, right) - intersectionArea(bounds, left))[0]!;
}

function intersectionArea(bounds: Required<WindowBounds>, area: WorkArea) {
  const width = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
  const height = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
  return width * height;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
