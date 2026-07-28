export interface ScreenCaptureSourceCandidate {
  readonly id: string;
  readonly name: string;
  readonly display_id: string;
  readonly thumbnail?: {
    getSize(): { width: number; height: number };
  };
}

export const HEARTHSTONE_WINDOW_CAPTURE_TYPES = ["window"] as const;
export const HEARTHSTONE_DISPLAY_CAPTURE_TYPES = ["screen"] as const;

export function selectHearthstoneWindowCaptureSource<T extends ScreenCaptureSourceCandidate>(
  sources: readonly T[]
): T | undefined {
  const hearthstoneWindows = sources
    .filter((candidate) => /hearthstone|炉石传说/i.test(candidate.name))
    .sort((left, right) => captureArea(right) - captureArea(left));
  return hearthstoneWindows.find((candidate) => captureArea(candidate) > 0)
    ?? hearthstoneWindows.find((candidate) => candidate.thumbnail === undefined);
}

export function selectTargetDisplayCaptureSource<T extends ScreenCaptureSourceCandidate>(
  sources: readonly T[],
  targetDisplayId: number
): T | undefined {
  const targetDisplay = String(targetDisplayId);
  return sources.find((candidate) =>
    candidate.id.startsWith("screen:") &&
    candidate.display_id === targetDisplay &&
    (candidate.thumbnail === undefined || captureArea(candidate) > 0)
  );
}

function captureArea(candidate: ScreenCaptureSourceCandidate) {
  const size = candidate.thumbnail?.getSize();
  return size ? size.width * size.height : 0;
}
