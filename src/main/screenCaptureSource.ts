export interface ScreenCaptureSourceCandidate {
  readonly id: string;
  readonly name: string;
  readonly display_id: string;
  readonly thumbnail?: {
    getSize(): { width: number; height: number };
  };
}

export const HEARTHSTONE_CAPTURE_TYPES = ["window"] as const;

export function selectHearthstoneCaptureSource<T extends ScreenCaptureSourceCandidate>(
  sources: readonly T[],
  _targetDisplayId: number
): T | undefined {
  const hearthstoneWindows = sources
    .filter((candidate) => /hearthstone|炉石传说/i.test(candidate.name))
    .sort((left, right) => captureArea(right) - captureArea(left));
  return hearthstoneWindows[0];
}

function captureArea(candidate: ScreenCaptureSourceCandidate) {
  const size = candidate.thumbnail?.getSize();
  return size ? size.width * size.height : 0;
}
