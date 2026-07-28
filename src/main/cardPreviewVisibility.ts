import { isHearthstoneOrTrackerFrontmost } from "./frontmostApp.js";

export class CardPreviewVisibilityGate {
  private generation = 0;
  private hoverActive = false;

  beginHover(): number {
    this.hoverActive = true;
    return ++this.generation;
  }

  canShow(hover: number, frontmostAppName: string | undefined): boolean {
    return this.hoverActive && hover === this.generation && isHearthstoneOrTrackerFrontmost(frontmostAppName);
  }

  refresh(frontmostAppName: string | undefined): boolean {
    if (isHearthstoneOrTrackerFrontmost(frontmostAppName)) {
      return false;
    }

    const shouldHide = this.hoverActive;
    this.invalidate();
    return shouldHide;
  }

  invalidateIfCurrent(hover: number): boolean {
    if (!this.hoverActive || hover !== this.generation) {
      return false;
    }

    this.invalidate();
    return true;
  }

  invalidate() {
    this.hoverActive = false;
    this.generation += 1;
  }
}
