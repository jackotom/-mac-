export interface ScreenCaptureSourceCandidate {
  readonly id: string;
  readonly name: string;
  readonly display_id: string;
  readonly thumbnail?: {
    getSize(): { width: number; height: number };
  };
}

export function selectHearthstoneCaptureSource<T extends ScreenCaptureSourceCandidate>(
  sources: readonly T[],
  targetDisplayId: number
): T | undefined {
  const hearthstoneWindows = sources
    .filter((candidate) => /hearthstone|炉石传说/i.test(candidate.name))
    .sort((left, right) => captureArea(right) - captureArea(left));
  return (
    hearthstoneWindows[0] ??
    sources.find((candidate) => candidate.display_id === String(targetDisplayId)) ??
    sources.find((candidate) => candidate.id.startsWith("screen:"))
  );
}

function captureArea(candidate: ScreenCaptureSourceCandidate) {
  const size = candidate.thumbnail?.getSize();
  return size ? size.width * size.height : 0;
}
