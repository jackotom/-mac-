export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LadderDeckOverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const panelWidth = 210;
const preferredHeight = 500;
const minimumHeight = 400;
const edgeGap = 8;
const minimumDisplayWidth = 720;

export function getLadderDeckOverlayBounds(workArea: DisplayWorkArea): LadderDeckOverlayBounds | undefined {
  if (workArea.width < minimumDisplayWidth || workArea.height < minimumHeight) {
    return undefined;
  }

  const height = Math.min(preferredHeight, workArea.height - 40);
  return {
    x: workArea.x + edgeGap,
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width: panelWidth,
    height
  };
}
