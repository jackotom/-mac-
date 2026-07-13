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

const defaultBounds: WindowBounds = { width: 300, height: 500 };
const minWidth = 300;
const minHeight = 400;

export function normalizeOverlayWindowBounds(value: unknown, workAreas: readonly WorkArea[]): WindowBounds {
  if (!isSavedBounds(value)) {
    return defaultBounds;
  }
  if (workAreas.length === 0) {
    return value;
  }

  const area = selectWorkArea(value, workAreas);
  const width = clamp(value.width, Math.min(minWidth, area.width), area.width);
  const height = clamp(value.height, Math.min(minHeight, area.height), area.height);
  return {
    x: clamp(value.x, area.x, area.x + area.width - width),
    y: clamp(value.y, area.y, area.y + area.height - height),
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
