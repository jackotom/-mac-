import { isHearthstoneFrontmost } from "./frontmostApp.js";

export class CardPreviewVisibilityGate {
  private generation = 0;
  private hoverActive = false;

  beginHover(): number {
    this.hoverActive = true;
    return ++this.generation;
  }

  canShow(hover: number, frontmostAppName: string | undefined): boolean {
    return this.hoverActive && hover === this.generation && isHearthstoneFrontmost(frontmostAppName);
  }

  refresh(frontmostAppName: string | undefined): boolean {
    if (isHearthstoneFrontmost(frontmostAppName)) {
      return false;
    }

    const shouldHide = this.hoverActive;
    this.invalidate();
    return shouldHide;
  }

  invalidate() {
    this.hoverActive = false;
    this.generation += 1;
  }
}
