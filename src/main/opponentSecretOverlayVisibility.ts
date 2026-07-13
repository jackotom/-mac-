export class OpponentSecretOverlayVisibility {
  private previousCount = 0;

  update(activeSecretCount: number): boolean {
    const normalizedCount = Number.isFinite(activeSecretCount) ? Math.max(0, Math.trunc(activeSecretCount)) : 0;
    const shouldShow = normalizedCount > this.previousCount;
    this.previousCount = normalizedCount;
    return shouldShow;
  }
}
