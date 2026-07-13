export function markRendererReady(target: Document): void {
  target.documentElement.setAttribute("data-renderer-ready", "true");
}
