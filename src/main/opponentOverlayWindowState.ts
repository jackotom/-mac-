export interface WindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const collapsedWidth = 52;
const collapsedHeight = 38;

export class OpponentOverlayWindowState {
  private collapsed = false;

  constructor(private expandedBounds: WindowBounds) {}

  isCollapsed(): boolean {
    return this.collapsed;
  }

  updateExpandedBounds(bounds: WindowBounds): void {
    if (!this.collapsed) {
      this.expandedBounds = bounds;
    }
  }

  collapse(): WindowBounds {
    this.collapsed = true;
    return this.currentBounds();
  }

  expand(): WindowBounds {
    this.collapsed = false;
    return this.currentBounds();
  }

  currentBounds(): WindowBounds {
    return this.collapsed
      ? { x: this.expandedBounds.x, y: this.expandedBounds.y, width: collapsedWidth, height: collapsedHeight }
      : this.expandedBounds;
  }
}
