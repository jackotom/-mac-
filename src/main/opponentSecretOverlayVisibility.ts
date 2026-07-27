export class OpponentSecretOverlayVisibility {
  private previousCount = 0;
  private previousEntityIds = new Set<string>();

  update(activeSecrets: number | readonly { readonly entityId: string }[]): boolean {
    if (Array.isArray(activeSecrets)) {
      const nextEntityIds = new Set(activeSecrets.map((secret) => secret.entityId));
      const shouldShow = [...nextEntityIds].some((entityId) => !this.previousEntityIds.has(entityId));
      this.previousEntityIds = nextEntityIds;
      this.previousCount = nextEntityIds.size;
      return shouldShow;
    }

    const activeSecretCount = activeSecrets as number;
    const normalizedCount = Number.isFinite(activeSecretCount) ? Math.max(0, Math.trunc(activeSecretCount)) : 0;
    const shouldShow = normalizedCount > this.previousCount;
    this.previousCount = normalizedCount;
    return shouldShow;
  }
}
